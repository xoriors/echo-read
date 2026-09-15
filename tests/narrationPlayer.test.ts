/**
 * When the player asks for audio, and what it asks for.
 *
 * Time to first audio is decided here as much as in the chunker. The first
 * request has to be the short first part, and the second part has to be on
 * its way before the first has answered — a short first part buys a quick
 * start only if the seam after it is covered. And every part must be asked
 * for in the same voice: a document that changes voice between parts is worse
 * than one that starts slowly.
 */
import { NarrationPlayer } from '../src/client/application/narrationPlayer';
import type { AudioClip, AudioOutput } from '../src/client/application/ports/audioOutput';
import type { SpeechGateway } from '../src/client/application/ports/speechGateway';
import type { StatusChannel, Unsubscribe } from '../src/client/application/ports/statusChannel';
import type { Ticker } from '../src/client/application/ports/ticker';
import { PlaybackState } from '../src/client/domain/playback';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

interface Request {
  text: string;
  voice: string;
  answer: () => void;
}

/** Records every request and answers only when told to. */
class FakeSpeech implements SpeechGateway {
  readonly requests: Request[] = [];

  synthesize(text: string, voiceName: string): Promise<Uint8Array> {
    return new Promise((resolve) => {
      this.requests.push({ text, voice: voiceName, answer: () => resolve(new Uint8Array(text.length * 2)) });
    });
  }
}

/** A speaker whose clock is set by hand. */
class FakeAudio implements AudioOutput {
  position = 0;

  async decode(samples: Uint8Array): Promise<AudioClip> {
    return { durationSeconds: samples.byteLength / 2 / 100 };
  }

  play(_clip: AudioClip, offsetSeconds: number): void {
    this.position = offsetSeconds;
  }

  stop(): void {}

  positionSeconds(): number {
    return this.position;
  }

  setPlaybackRate(): void {}
}

class HandTicker implements Ticker {
  private onTick: (() => void) | null = null;

  start(onTick: () => void): void {
    this.onTick = onTick;
  }

  stop(): void {
    this.onTick = null;
  }

  tick(): void {
    this.onTick?.();
  }
}

class SilentStatus implements StatusChannel {
  publish(): void {}

  subscribe(): Unsubscribe {
    return () => {};
  }
}

/** Lets every pending promise chain run to its next await. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const ARTICLE = 'Spaced practice distributes study across sessions rather than massing it. '.repeat(120).trim();

const speech = new FakeSpeech();
const audio = new FakeAudio();
const ticker = new HandTicker();
const player = new NarrationPlayer({ speech, audio, ticker, status: new SilentStatus(), defaultVoice: 'Kore' });

const part = (index: number): string => player.document.chunkAt(index)?.text ?? '';

// --- Starting -----------------------------------------------------------------
void player.load(ARTICLE);
await settle();

check(player.document.chunkCount === 5, `the article is five parts (got ${player.document.chunkCount})`);
check(player.getSnapshot().state === PlaybackState.Buffering, 'loading a document starts buffering');
check(speech.requests.length === 2, `the first two parts are requested together (got ${speech.requests.length})`);
check(speech.requests[0]?.text === part(0), 'the first request is the first part');
check((speech.requests[0]?.text.length ?? 0) <= 300, `which is short (${speech.requests[0]?.text.length} chars)`);
check(speech.requests[1]?.text === part(1), 'the second request is the second part, before the first has answered');

speech.requests[0].answer();
await settle();

const started = player.getSnapshot();
check(started.state === PlaybackState.Playing && started.chunkIndex === 0, 'the first part plays as soon as it arrives');
check(speech.requests.length === 2, 'and starting it requests nothing more');

// --- Crossing the first seam -------------------------------------------------
speech.requests[1].answer();
await settle();

audio.position = player.getSnapshot().durationSeconds;
ticker.tick();
await settle();

const second = player.getSnapshot();
check(second.state === PlaybackState.Playing && second.chunkIndex === 1, 'the second part plays from the cache when the first ends');
check(speech.requests.length === 3, `without asking for it again (${speech.requests.length} requests)`);
check(speech.requests[2]?.text === part(2), 'and the third part is requested the moment the second is due');

// --- Seeking to a word --------------------------------------------------------
speech.requests[2].answer();
await settle();

const within = 100;
player.playFromCharacter(player.document.chunks[2].startOffset + within);
await settle();

check(speech.requests.length === 5, `a tap in a cached part requests two things (got ${speech.requests.length - 3})`);
check(speech.requests[3]?.text === part(2).slice(within), 'the part from the tapped word on');
check(speech.requests[4]?.text === part(3), 'and the whole next part, without waiting for the first to answer');

// --- The voice -----------------------------------------------------------------
check(
  speech.requests.every((request) => request.voice === 'Kore'),
  'every part is requested in the same voice',
);

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
