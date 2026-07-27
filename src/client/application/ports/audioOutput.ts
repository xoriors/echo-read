/**
 * A decoded, playable piece of audio. Deliberately opaque: only the adapter
 * that produced it knows what is inside.
 */
export interface AudioClip {
  readonly durationSeconds: number;
}

/**
 * Driven port: the speaker.
 *
 * `positionSeconds` is authoritative — the adapter owns the clock, because
 * only it knows how the playback rate warps wall time.
 */
export interface AudioOutput {
  decode(samples: Uint8Array): Promise<AudioClip>;
  play(clip: AudioClip, offsetSeconds: number): void;
  stop(): void;
  positionSeconds(): number;
  setPlaybackRate(rate: number): void;
}
