/**
 * Fixed-timestep game loop.
 *
 * Game logic always advances in steps of exactly DT (1/60 s), no matter the
 * display refresh rate. Rendering happens once per animation frame and gets
 * `alpha` (0..1): how far real time has moved into the next logic step, used
 * to interpolate positions smoothly.
 */

/** Logic updates per second. */
export const TICK_RATE = 60;

/** Duration of one logic step in seconds. */
export const DT = 1 / TICK_RATE;

/**
 * Most logic steps run in a single frame. If the machine falls further
 * behind (or the tab was in the background), the backlog is dropped and the
 * game slows down instead of freezing while it tries to catch up.
 */
export const MAX_STEPS_PER_FRAME = 5;

export class FixedLoop {
  /**
   * @param {object} callbacks
   * @param {(dt: number, tick: number) => void} callbacks.update  one logic step
   * @param {(alpha: number) => void} callbacks.render  draw a frame
   */
  constructor({ update, render }) {
    this.update = update;
    this.render = render;
    /** Number of logic steps run so far. */
    this.tick = 0;
    this.accumulator = 0;
    this.running = false;
    this.lastTime = 0;
    this.frameId = 0;
  }

  /**
   * Advance by `elapsed` real seconds: run as many logic steps as fit, then
   * render once. Returns the number of steps run. Used by start() and by tests.
   * @param {number} elapsed
   */
  advance(elapsed) {
    this.accumulator += Math.max(0, elapsed);

    let steps = 0;
    while (this.accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
      this.update(DT, this.tick);
      this.tick++;
      this.accumulator -= DT;
      steps++;
    }
    // Still behind after the maximum number of steps: drop the backlog.
    if (this.accumulator >= DT) this.accumulator %= DT;

    this.render(this.accumulator / DT);
    return steps;
  }

  /** Start driving the loop with requestAnimationFrame (browser only). */
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();

    const frame = (now) => {
      if (!this.running) return;
      this.advance((now - this.lastTime) / 1000);
      this.lastTime = now;
      this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }
}
