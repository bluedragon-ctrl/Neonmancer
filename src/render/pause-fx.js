/**
 * How a frozen enemy looks (Pause, D85; pure, tested; no three.js): it
 * stands still in its pose, tinted in the spell's color, in a cage of
 * corner brackets (pause-view.js), and blinks before it thaws.
 */

/** Timing in ticks. */
export const PAUSE_FX = {
  /** How far its hologram is tinted towards the spell's color (its flash amount). */
  tint: 0.3,
  /** Ticks the freeze takes to set in (the tint and the cage grow). */
  growTicks: 8,
  /** Blinking in the last `warnTicks`, every `blinkTicks`. */
  warnTicks: 60,
  blinkTicks: 5,
};

/**
 * A freeze `tick` ticks after it hit, lasting `ticks` in all.
 * @param {number} tick may be fractional
 * @param {number} ticks its duration
 * @returns {{ frozen: boolean, grow: number, on: boolean }}
 *   grow: setting in 0..1; on: tint and cage shown this frame (off while blinking)
 */
export function pauseLook(tick, ticks) {
  if (tick < 0 || tick >= ticks) return { frozen: false, grow: 0, on: false };
  const { growTicks, warnTicks, blinkTicks } = PAUSE_FX;
  const grow = Math.min(1, tick / growTicks);
  const warning = ticks - tick < warnTicks;
  const on = !warning || Math.floor((ticks - tick) / blinkTicks) % 2 === 0;
  return { frozen: true, grow, on };
}
