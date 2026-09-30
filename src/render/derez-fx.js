/**
 * The derez (D126; pure, tested; no three.js): how anything breaks into
 * pixels when it is gone. The wizard dying, an enemy popping, a block or
 * crate breaking and a pickup taken all look the same: pixels start spread
 * through the thing's body, a few ticks apart, drift out from its middle
 * and up, and shrink to nothing. Only the body's size and the colors
 * (createDerez() in pixels.js) differ. The boot's arrival plays it
 * backwards (boot-fx.js).
 */
import { hash } from './hash.js';

/** Timing in ticks, sizes in units. */
export const DEREZ = {
  /** Ticks a burst lasts. */
  ticks: 48,
  /** The last pixel starts this many ticks after the first. */
  stagger: 10,
  /** Edge of one pixel cube. */
  pixelSize: 0.08,
  /** How far out from the body a pixel drifts at most by the end. */
  spread: 0.7,
  /** How high it drifts at most by the end. */
  rise: 1,
  /** Pixels of a 1×1×1 body; a smaller one gets fewer (by the cube root of its volume), within the bounds. */
  density: 48,
  minPixels: 24,
  maxPixels: 64,
};

/** Seed of this effect's hash() sequence. */
const SEED = [53.1, 227.9];

/**
 * A body that derezzes: a box standing on the point the burst is placed
 * at (its feet center), `y` above it.
 * @typedef {{ size: number[], y?: number }} DerezBody size [x, y, z]
 */

/** A block or a crate: its cell. */
export const BLOCK_BODY = { size: [1, 1, 1] };

/**
 * Pixels in the derez of `body`.
 * @param {DerezBody} body
 */
export function derezCount({ size: [w, h, d] }) {
  const count = Math.round(DEREZ.density * Math.cbrt(w * h * d));
  return Math.max(DEREZ.minPixels, Math.min(DEREZ.maxPixels, count));
}

/**
 * The pixels of `body` `tick` ticks after it derezzed, as offsets from its
 * feet center.
 * @param {number} tick may be fractional, for interpolation
 * @param {DerezBody} body
 * @returns {{ offset: number[], scale: number }[]} always derezCount(body)
 *   of them (scale 0: not started yet); empty once the burst is over
 */
export function derezPixels(tick, body) {
  const { ticks, stagger, spread, rise } = DEREZ;
  if (tick < 0 || tick >= ticks) return [];
  const [w, h, d] = body.size;
  const y = body.y ?? 0;
  return Array.from({ length: derezCount(body) }, (_, i) => {
    const start = [(hash(i, 0, SEED) - 0.5) * w, y + hash(i, 1, SEED) * h, (hash(i, 2, SEED) - 0.5) * d];
    const delay = hash(i, 3, SEED) * stagger;
    const t = (tick - delay) / (ticks - delay);
    if (t < 0) return { offset: start, scale: 0 };
    // Out along its own direction from the middle, fast at first, and up.
    const out = spread * (0.3 + 0.7 * hash(i, 4, SEED)) * (1 - (1 - t) * (1 - t));
    const angle = Math.atan2(start[2], start[0]) + (hash(i, 5, SEED) - 0.5);
    const up = rise * (0.4 + 0.6 * hash(i, 6, SEED)) * t;
    return { offset: [start[0] + Math.cos(angle) * out, start[1] + up, start[2] + Math.sin(angle) * out], scale: 1 - t };
  });
}
