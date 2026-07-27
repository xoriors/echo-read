/**
 * Driven port for "call me back repeatedly while something is playing".
 *
 * Injecting it keeps `requestAnimationFrame` out of the player, which makes
 * playback logic testable with a hand-cranked ticker.
 */
export interface Ticker {
  start(onTick: () => void): void;
  stop(): void;
}
