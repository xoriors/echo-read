import { messageOf } from '../../shared/domain/errors';
import { Narration, type NarrationPosition } from '../domain/narration';
import { PlaybackState, REWIND_SECONDS } from '../domain/playback';
import type { AudioClip, AudioOutput } from './ports/audioOutput';
import type { SpeechGateway } from './ports/speechGateway';
import type { StatusChannel, Unsubscribe } from './ports/statusChannel';
import type { Ticker } from './ports/ticker';

export interface NarrationSnapshot {
  state: PlaybackState;
  isLoaded: boolean;
  chunkIndex: number;
  chunkCount: number;
  positionSeconds: number;
  durationSeconds: number;
  /** Progress through the whole document, 0–1. */
  documentProgress: number;
  voice: string;
  speed: number;
  error: string | null;
}

export interface PlayTarget {
  chunkIndex: number;
  /** Absolute offset into the clip. Takes precedence over `chunkProgress`. */
  offsetSeconds?: number;
  /** Relative offset into the clip, 0–1. */
  chunkProgress?: number;
  /**
   * Speak the chunk from this character on, rather than from its start.
   *
   * Seeking by time can only ever estimate where a word falls, because speech
   * is not evenly paced. Synthesising from the character instead makes the
   * audio *begin* at that word, so landing on it is exact.
   */
  characterInChunk?: number;
}

export interface NarrationPlayerDeps {
  speech: SpeechGateway;
  audio: AudioOutput;
  ticker: Ticker;
  status: StatusChannel;
  defaultVoice: string;
}

const IDLE_SNAPSHOT: NarrationSnapshot = {
  state: PlaybackState.Idle,
  isLoaded: false,
  chunkIndex: 0,
  chunkCount: 0,
  positionSeconds: 0,
  durationSeconds: 0,
  documentProgress: 0,
  voice: '',
  speed: 1,
  error: null,
};

/**
 * Reads a document aloud.
 *
 * This is the heart of the browser hexagon: it decides *when* to synthesise,
 * what to keep, when to advance and what the transport controls should show.
 * Everything it touches — the network, the speaker, the frame clock — is a
 * port, so none of that reasoning is entangled with React or the Web Audio API.
 *
 * State is exposed as an immutable snapshot plus a subscription, so the UI can
 * bind to it without the player knowing a view layer exists.
 */
export class NarrationPlayer {
  private narration = Narration.empty();
  private snapshot: NarrationSnapshot;
  private readonly listeners = new Set<() => void>();

  private readonly clips = new Map<number, AudioClip>();
  /**
   * Character offset within the current chunk that `currentClip` starts at.
   * Non-zero after a seek-to-word, and needed to keep progress honest: the
   * clip then covers only the tail of the chunk.
   */
  private clipStartCharacter = 0;
  /**
   * The one partial clip worth keeping: the current seek-to-word. Holding it
   * means pausing, resuming or scrubbing after a tap does not pay for the
   * same synthesis again.
   */
  private partialClip: { chunkIndex: number; start: number; clip: AudioClip } | null = null;
  private readonly inFlight = new Map<number, Promise<AudioClip>>();
  private currentClip: AudioClip | null = null;

  /** Bumped whenever cached audio stops being valid (new text or new voice). */
  private contentGeneration = 0;
  /** Bumped on every transport command, to discard superseded playbacks. */
  private playToken = 0;

  constructor(private readonly deps: NarrationPlayerDeps) {
    this.snapshot = { ...IDLE_SNAPSHOT, voice: deps.defaultVoice };
  }

  // --- observation -------------------------------------------------------

  getSnapshot = (): NarrationSnapshot => this.snapshot;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The document being narrated, for text rendering and click-to-seek. */
  get document(): Narration {
    return this.narration;
  }

  // --- loading -----------------------------------------------------------

  /** Replaces the document and, unless told otherwise, starts reading it. */
  async load(text: string, { autoplay = true }: { autoplay?: boolean } = {}): Promise<void> {
    this.haltPlayback();
    this.contentGeneration++;
    this.clips.clear();
    this.inFlight.clear();
    this.currentClip = null;
    this.partialClip = null;
    this.clipStartCharacter = 0;
    this.narration = Narration.of(text);

    this.patch({
      state: PlaybackState.Idle,
      isLoaded: !this.narration.isEmpty,
      chunkIndex: 0,
      chunkCount: this.narration.chunkCount,
      positionSeconds: 0,
      durationSeconds: 0,
      documentProgress: 0,
      error: null,
    });

    if (autoplay && !this.narration.isEmpty) await this.playFrom({ chunkIndex: 0 });
  }

  /** Discards the document entirely, returning to the empty state. */
  reset(): void {
    this.haltPlayback();
    this.contentGeneration++;
    this.clips.clear();
    this.inFlight.clear();
    this.currentClip = null;
    this.partialClip = null;
    this.clipStartCharacter = 0;
    this.narration = Narration.empty();
    this.patch({ ...IDLE_SNAPSHOT, voice: this.snapshot.voice, speed: this.snapshot.speed });
  }

  // --- transport ---------------------------------------------------------

  async playFrom({ chunkIndex, offsetSeconds, chunkProgress, characterInChunk }: PlayTarget): Promise<void> {
    if (!this.narration.hasChunk(chunkIndex)) {
      this.stop();
      return;
    }

    const token = ++this.playToken;
    const generation = this.contentGeneration;
    const startCharacter = characterInChunk ?? 0;

    this.deps.audio.stop();
    this.deps.ticker.stop();
    this.patch({ state: PlaybackState.Buffering, chunkIndex, error: null });
    this.deps.status.publish(`Playing part ${chunkIndex + 1} of ${this.narration.chunkCount}...`);

    let clip: AudioClip;
    try {
      clip = await this.clipFor(chunkIndex, startCharacter);
    } catch (error) {
      if (this.isStale(token, generation)) return;
      this.fail(`Failed to load audio for part ${chunkIndex + 1}: ${messageOf(error)}`);
      return;
    }

    if (this.isStale(token, generation)) return;

    const offset = clampSeconds(
      offsetSeconds ?? (chunkProgress ?? 0) * clip.durationSeconds,
      clip.durationSeconds,
    );

    this.clipStartCharacter = startCharacter;
    this.currentClip = clip;
    this.deps.audio.setPlaybackRate(this.snapshot.speed);
    this.deps.audio.play(clip, offset);
    this.deps.ticker.start(this.onTick);

    this.patch({
      state: PlaybackState.Playing,
      chunkIndex,
      durationSeconds: clip.durationSeconds,
      positionSeconds: offset,
    });
    this.deps.status.publish('');

    void this.prefetch(chunkIndex + 1);
  }

  /** Resumes from wherever the transport currently sits. */
  async resume(): Promise<void> {
    if (!this.snapshot.isLoaded || this.snapshot.state === PlaybackState.Playing) return;
    await this.playFrom({
      chunkIndex: this.snapshot.chunkIndex,
      offsetSeconds: this.snapshot.positionSeconds,
      characterInChunk: this.clipStartCharacter,
    });
  }

  pause(): void {
    if (this.snapshot.state !== PlaybackState.Playing) return;

    const positionSeconds = this.deps.audio.positionSeconds();
    this.haltPlayback();
    this.patch({ state: PlaybackState.Paused, positionSeconds, documentProgress: this.progressAt(positionSeconds) });
  }

  stop(): void {
    this.haltPlayback();
    this.patch({ state: PlaybackState.Idle, positionSeconds: 0, documentProgress: this.progressAt(0) });
  }

  /** Moves within the current chunk, keeping playback going if it was. */
  seekTo(seconds: number): void {
    const positionSeconds = clampSeconds(seconds, this.snapshot.durationSeconds);

    if (this.snapshot.state === PlaybackState.Playing) {
      void this.playFrom({
        chunkIndex: this.snapshot.chunkIndex,
        offsetSeconds: positionSeconds,
        characterInChunk: this.clipStartCharacter,
      });
      return;
    }

    this.patch({ positionSeconds, documentProgress: this.progressAt(positionSeconds) });
  }

  rewind(seconds = REWIND_SECONDS): void {
    this.seekTo(this.snapshot.positionSeconds - seconds);
  }

  skipToNextChunk(): void {
    void this.playFrom({ chunkIndex: this.snapshot.chunkIndex + 1 });
  }

  /** Jumps to the passage containing a character of the rendered text. */
  playFromCharacter(characterIndex: number): void {
    if (this.narration.isEmpty) return;
    const position: NarrationPosition = this.narration.locate(characterIndex);
    void this.playFrom({
      chunkIndex: position.chunkIndex,
      characterInChunk: position.characterInChunk,
    });
  }

  // --- settings ----------------------------------------------------------

  /** Changing voice invalidates every cached clip, so it re-reads from here. */
  async setVoice(voice: string): Promise<void> {
    if (voice === this.snapshot.voice) return;

    const wasActive = this.snapshot.state === PlaybackState.Playing || this.snapshot.state === PlaybackState.Paused;
    const resumeFrom: PlayTarget = {
      chunkIndex: this.snapshot.chunkIndex,
      offsetSeconds: this.snapshot.positionSeconds,
      characterInChunk: this.clipStartCharacter,
    };

    this.haltPlayback();
    this.contentGeneration++;
    this.clips.clear();
    this.inFlight.clear();
    this.partialClip = null;
    this.patch({ voice });

    if (!wasActive || this.narration.isEmpty) return;

    this.deps.status.publish('Changing voice...');
    this.patch({ state: PlaybackState.Buffering });
    await this.playFrom(resumeFrom);
  }

  setSpeed(speed: number): void {
    this.patch({ speed });
    this.deps.audio.setPlaybackRate(speed);
  }

  // --- internals ---------------------------------------------------------

  private readonly onTick = (): void => {
    if (this.snapshot.state !== PlaybackState.Playing || !this.currentClip) return;

    const positionSeconds = this.deps.audio.positionSeconds();

    if (positionSeconds >= this.currentClip.durationSeconds) {
      const next = this.snapshot.chunkIndex + 1;
      if (this.narration.hasChunk(next)) void this.playFrom({ chunkIndex: next });
      else this.stop();
      return;
    }

    this.patch({ positionSeconds, documentProgress: this.progressAt(positionSeconds) });
  };

  /**
   * Audio for a chunk, optionally starting partway through it.
   *
   * Only whole chunks are cached and shared. A partial clip belongs to one
   * seek — caching every tapped position would grow without bound and would
   * never be reused, since the next tap lands somewhere else.
   */
  private clipFor(index: number, fromCharacter = 0): Promise<AudioClip> {
    const chunk = this.narration.chunkAt(index);
    if (!chunk) return Promise.reject(new Error(`No chunk at index ${index}`));

    const start = Math.min(Math.max(fromCharacter, 0), chunk.text.length);
    const isWholeChunk = start === 0;

    if (isWholeChunk) {
      const cached = this.clips.get(index);
      if (cached) return Promise.resolve(cached);

      const pending = this.inFlight.get(index);
      if (pending) return pending;
    } else if (this.partialClip?.chunkIndex === index && this.partialClip.start === start) {
      return Promise.resolve(this.partialClip.clip);
    }

    const generation = this.contentGeneration;
    const voice = this.snapshot.voice;

    const request = this.deps.speech
      .synthesize(chunk.text.slice(start), voice)
      .then((samples) => this.deps.audio.decode(samples))
      .then((clip) => {
        if (generation !== this.contentGeneration) return clip;
        if (isWholeChunk) this.clips.set(index, clip);
        else this.partialClip = { chunkIndex: index, start, clip };
        return clip;
      })
      .finally(() => {
        if (isWholeChunk) this.inFlight.delete(index);
      });

    if (isWholeChunk) this.inFlight.set(index, request);
    return request;
  }

  /** Warms the next chunk so playback does not stall at the seam. */
  private async prefetch(index: number): Promise<void> {
    if (!this.narration.hasChunk(index) || this.clips.has(index)) return;
    try {
      await this.clipFor(index);
    } catch {
      // A failed prefetch is retried (and reported) when playback reaches it.
    }
  }

  private isStale(token: number, generation: number): boolean {
    return token !== this.playToken || generation !== this.contentGeneration;
  }

  private haltPlayback(): void {
    this.playToken++;
    this.deps.ticker.stop();
    this.deps.audio.stop();
  }

  private fail(message: string): void {
    this.haltPlayback();
    this.patch({ state: PlaybackState.Error, error: message });
  }

  private progressAt(positionSeconds: number): number {
    const duration = this.snapshot.durationSeconds;
    const throughClip = duration > 0 ? positionSeconds / duration : 0;

    // After a seek-to-word the clip is only the tail of the chunk, so progress
    // through the clip has to be rebased onto the whole chunk.
    const chunk = this.narration.chunkAt(this.snapshot.chunkIndex);
    const spokenLength = chunk ? chunk.text.length - this.clipStartCharacter : 0;
    const chunkProgress =
      chunk && chunk.text.length > 0
        ? (this.clipStartCharacter + throughClip * spokenLength) / chunk.text.length
        : throughClip;

    return this.narration.progressAt({ chunkIndex: this.snapshot.chunkIndex, chunkProgress });
  }

  private patch(changes: Partial<NarrationSnapshot>): void {
    const next = { ...this.snapshot, ...changes };
    if (shallowEqual(next, this.snapshot)) return;

    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}

function clampSeconds(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return duration > 0 ? Math.min(seconds, duration) : seconds;
}

function shallowEqual(left: NarrationSnapshot, right: NarrationSnapshot): boolean {
  return (Object.keys(left) as Array<keyof NarrationSnapshot>).every((key) => left[key] === right[key]);
}
