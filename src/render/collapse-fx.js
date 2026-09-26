/**
 * How a collapsing block looks through its states (pure, tested; no
 * three.js): it shakes harder and harder once the wizard steps on it,
 * fragments into pixels that tumble down and fade when it vanishes, and
 * recompiles, growing from its center, when it grows back.
 */
import { COLLAPSING } from '../entities/collapsing.js';
import { hash } from './hash.js';

/** Timing in ticks, sizes in units. */
export const COLLAPSE_FX = {
  /** Sideways shake at the start and at the end of the shaking. */
  shakeFrom: 0.015,
  shakeTo: 0.07,
  /** Ticks the regrow takes, growing from the center with a flicker. */
  regrowTicks: 14,
  /** Ticks the pixels of a vanished block fly. */
  pixelTicks: 42,
  /** Edge of one pixel cube. */
  pixelSize: 0.12,
  /** How far the pixels drop by the end. */
  drop: 1.6,
  /** How far out they drift by the end. */
  spread: 0.5,
};

/** Seed of this effect's hash() sequence. */
const SEED = [91.7, 263.3];

/** Where the pixels start: every other point (a checkerboard) of a 4×4×4 lattice through the block. */
const LATTICE = [];
for (let x = 0; x < 4; x++)
  for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) if ((x + y + z) % 2 === 0) LATTICE.push([x, y, z].map((v) => (v + 0.5) / 4));

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

/**
 * The pixels of a vanished block `tick` ticks after it vanished, as
 * offsets from its lower corner. Each starts on a lattice point inside the
 * block, drops with gravity and drifts out from the center, shrinking to
 * nothing.
 * @param {number} tick ticks since it vanished (may be fractional, for interpolation)
 * @returns {{ offset: number[], scale: number }[]} one per pixel; empty once they are gone
 */
export function collapsePixels(tick) {
  if (tick < 0 || tick >= COLLAPSE_FX.pixelTicks) return [];
  const t = tick / COLLAPSE_FX.pixelTicks;
  return LATTICE.map((start, i) => {
    const fall = t * t * COLLAPSE_FX.drop * (0.6 + 0.4 * hash(i, 0, SEED));
    const out = t * COLLAPSE_FX.spread * hash(i, 1, SEED);
    return {
      offset: [start[0] + (start[0] - 0.5) * out * 2, start[1] - fall, start[2] + (start[2] - 0.5) * out * 2],
      scale: 1 - t,
    };
  });
}

/** Number of pixels a vanishing block breaks into. */
export const COLLAPSE_PIXELS = LATTICE.length;
