/**
 * The stream (D127; pure, tested; no three.js): pixels carried from one
 * place to another. Cut (an object into his hands), Paste (his hands into
 * the cell), Compile (his hands into the cell) and Warp (his body where he
 * was into his body where he is) all look the same: each pixel leaves its
 * own spot of the start, a little later than the one before, and flies on
 * a slight arc to the same spot of the end. At a body (a box, as a
 * derez's, derez-fx.js) the pixels are full size and wait there before
 * leaving or after arriving; at a point (his hands) they are small and
 * gone. Only the two ends, the duration and the colors differ.
 */
import { DEREZ, derezCount } from './derez-fx.js';
import { hash } from './hash.js';

/** Sizes in units (a pixel's edge is DEREZ.pixelSize). */
export const STREAM = {
  /** The last pixel leaves this share of the stream's ticks after the first. */
  stagger: 0.4,
  /** How high a pixel arcs on its way, at most. */
  arc: 0.35,
  /** A pixel's size at a point end (1 at a body). */
  pointScale: 0.3,
};

/** Seed of this effect's hash() sequence. */
const SEED = [71.3, 419.1];

/**
 * One end of a stream: a body standing on `at` (its feet center), or the
 * point `at` when there is no body.
 * @typedef {{ at: number[], body?: import('./derez-fx.js').DerezBody }} StreamEnd
 */

/**
 * Pixels in a stream between `from` and `to`: as in the derez of the
 * bigger body (DEREZ.minPixels between two points).
 * @param {StreamEnd} from
 * @param {StreamEnd} to
 */
export function streamCount(from, to) {
  const size = (end) => (end.body ? derezCount(end.body) : 0);
  return Math.max(size(from), size(to), DEREZ.minPixels);
}

/** Pixel `i`'s spot of `end`, and its size there. */
function spot(i, { at, body }) {
  if (!body) return { pos: at, scale: STREAM.pointScale };
  const [w, h, d] = body.size;
  const box = [(hash(i, 0, SEED) - 0.5) * w, (body.y ?? 0) + hash(i, 1, SEED) * h, (hash(i, 2, SEED) - 0.5) * d];
  return { pos: box.map((v, k) => at[k] + v), scale: 1 };
}

/** Smoothstep of t, clamped to 0..1. */
function ease(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/**
 * The pixels `tick` ticks into a stream lasting `ticks`, from `from` to `to`.
 * @param {number} tick may be fractional
 * @param {number} ticks
 * @param {StreamEnd} from
 * @param {StreamEnd} to
 * @returns {{ offset: number[], scale: number }[]} world positions, always
 *   streamCount(from, to) of them (scale 0: not shown); empty outside the stream
 */
export function streamPixels(tick, ticks, from, to) {
  if (tick < 0 || tick >= ticks) return [];
  const { stagger, arc } = STREAM;
  const travel = ticks * (1 - stagger);
  return Array.from({ length: streamCount(from, to) }, (_, i) => {
    const start = spot(i, from);
    const end = spot(i, to);
    const u = (tick - hash(i, 3, SEED) * stagger * ticks) / travel;
    // Waiting in a body before leaving or after arriving; gone at a point.
    if (u < 0) return { offset: start.pos, scale: from.body ? 1 : 0 };
    if (u >= 1) return { offset: end.pos, scale: to.body ? 1 : 0 };
    const along = ease(u);
    const lift = Math.sin(Math.PI * along) * arc * (0.4 + 0.6 * hash(i, 4, SEED));
    return {
      offset: start.pos.map((v, k) => v + (end.pos[k] - v) * along + (k === 1 ? lift : 0)),
      scale: start.scale + (end.scale - start.scale) * along,
    };
  });
}
