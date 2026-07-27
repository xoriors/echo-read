import type { AudioClip, AudioOutput } from '../../../application/ports/audioOutput';
import { pcm16ToAudioBuffer } from './pcm';

/** Sample rate of the PCM the speech gateway delivers. */
export const NARRATION_SAMPLE_RATE = 24_000;
const MONO = 1;

interface WebAudioClip extends AudioClip {
  buffer: AudioBuffer;
}

/**
 * Web Audio implementation of the speaker port.
 *
 * It owns the playback clock: `AudioBufferSourceNode` exposes no position, so
 * elapsed context time is scaled by the playback rate and re-anchored whenever
 * the rate changes. That arithmetic lives here, next to the API that forces it.
 */
export class WebAudioOutput implements AudioOutput {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;

  private anchorContextTime = 0;
  private anchorOffsetSeconds = 0;
  private restingPositionSeconds = 0;
  private currentDurationSeconds = 0;
  private rate = 1;

  constructor(private readonly sampleRate: number = NARRATION_SAMPLE_RATE) {}

  async decode(samples: Uint8Array): Promise<AudioClip> {
    const context = this.ensureContext();
    const buffer = pcm16ToAudioBuffer(samples, context, this.sampleRate, MONO);
    const clip: WebAudioClip = { durationSeconds: buffer.duration, buffer };
    return clip;
  }

  play(clip: AudioClip, offsetSeconds: number): void {
    const context = this.ensureContext();
    this.stop();

    // Browsers start audio contexts suspended until a user gesture unlocks them.
    if (context.state === 'suspended') void context.resume();

    const source = context.createBufferSource();
    source.buffer = (clip as WebAudioClip).buffer;
    source.connect(this.gain!);
    source.playbackRate.value = this.rate;
    source.start(0, offsetSeconds);

    this.source = source;
    this.currentDurationSeconds = clip.durationSeconds;
    this.anchorContextTime = context.currentTime;
    this.anchorOffsetSeconds = offsetSeconds;
    this.restingPositionSeconds = offsetSeconds;
  }

  stop(): void {
    if (!this.source) return;

    this.restingPositionSeconds = this.positionSeconds();
    try {
      this.source.stop();
    } catch {
      // Already stopped: nothing to unwind.
    }
    this.source.disconnect();
    this.source = null;
  }

  positionSeconds(): number {
    if (!this.source || !this.context) return this.restingPositionSeconds;

    const elapsed = (this.context.currentTime - this.anchorContextTime) * this.rate;
    const position = this.anchorOffsetSeconds + elapsed;

    return this.currentDurationSeconds > 0 ? Math.min(position, this.currentDurationSeconds) : position;
  }

  setPlaybackRate(rate: number): void {
    if (rate === this.rate) return;

    if (this.source && this.context) {
      // Re-anchor first, so time already played is not re-scaled.
      this.anchorOffsetSeconds = this.positionSeconds();
      this.anchorContextTime = this.context.currentTime;
      this.source.playbackRate.value = rate;
    }

    this.rate = rate;
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;

    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    this.context = new AudioContextCtor({ sampleRate: this.sampleRate });
    this.gain = this.context.createGain();
    this.gain.connect(this.context.destination);

    return this.context;
  }
}
