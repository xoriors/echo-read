import type { Ticker } from '../../../application/ports/ticker';

/**
 * Frame-paced ticker. Browsers throttle `requestAnimationFrame` in background
 * tabs, which is exactly the behaviour we want for a progress readout.
 *
 * Each `start` claims a new run id so a callback that restarts the ticker
 * cannot leave the previous loop scheduling frames alongside the new one.
 */
export class AnimationFrameTicker implements Ticker {
  private frame: number | null = null;
  private run = 0;

  start(onTick: () => void): void {
    this.stop();
    const run = ++this.run;

    const loop = () => {
      onTick();
      if (run !== this.run) return;
      this.frame = requestAnimationFrame(loop);
    };

    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    this.run++;
    if (this.frame === null) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
