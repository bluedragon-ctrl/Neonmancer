/**
 * How a collapsing block looks through its states (pure, tested; no
 * three.js): it shakes harder and harder once the wizard steps on it,
 * derezzes when it vanishes (derez-fx.js, D126), and recompiles, growing
 * from its center, when it grows back.
 */
import { COLLAPSING } from '../entities/collapsing.js';

/** Timing in ticks, sizes in units. */
export const COLLAPSE_FX = {
  /** Sideways shake at the start and at the end of the shaking. */
  shakeFrom: 0.015,
  shakeTo: 0.07,
  /** Ticks the regrow takes, growing from the center with a flicker. */
  regrowTicks: 14,
};

/**
 * How to draw the block this frame.
 * @param {{ state: string, timer: number, regrown: boolean }} block see entities/collapsing.js
 * @param {number} alpha interpolation factor 0..1 between the last two ticks
 * @returns {{ visible: boolean, offset: number[], scale: number }} offset [x, y, z]
 *   from its cell; scale around its center
 */
export function collapseLook({ state, timer, regrown }, alpha) {
  const tick = timer + alpha;
  if (state === 'gone') return { visible: false, offset: [0, 0, 0], scale: 1 };
  if (state === 'shake') {
    // Two out-of-step wobbles, so it rattles rather than swings.
    const t = Math.min(tick / COLLAPSING.shakeTicks, 1);
    const amount = COLLAPSE_FX.shakeFrom + (COLLAPSE_FX.shakeTo - COLLAPSE_FX.shakeFrom) * t;
    return { visible: true, offset: [amount * Math.sin(tick * 2.1), 0, amount * Math.sin(tick * 2.9 + 1)], scale: 1 };
  }
  if (regrown && tick < COLLAPSE_FX.regrowTicks) {
    const t = tick / COLLAPSE_FX.regrowTicks;
    return { visible: Math.floor(tick / 2) % 2 === 0 || t > 0.6, offset: [0, 0, 0], scale: 0.3 + 0.7 * t * (2 - t) };
  }
  return { visible: true, offset: [0, 0, 0], scale: 1 };
}
