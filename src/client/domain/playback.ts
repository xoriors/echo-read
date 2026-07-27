/** Where the narration is in its lifecycle. */
export enum PlaybackState {
  Idle = 'IDLE',
  Buffering = 'BUFFERING',
  Playing = 'PLAYING',
  Paused = 'PAUSED',
  Error = 'ERROR',
}

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/** How far a single rewind press jumps back. */
export const REWIND_SECONDS = 10;

export function isActive(state: PlaybackState): boolean {
  return state === PlaybackState.Playing || state === PlaybackState.Paused;
}

/** `m:ss`, the format used on the transport bar and the sleep timer. */
export function formatTimecode(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
