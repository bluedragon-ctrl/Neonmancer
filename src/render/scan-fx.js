/**
 * The look of Scan (D128; pure, tested; no three.js): its wave, a square
 * of light spreading from the wizard's feet over the grid (entities/scan.js
 * sets how far), with a dimmer square trailing it, clipped to the room's
 * floor; bright while it spreads, then fading out. What it reveals
 * derezzes in the one derez (D126): a fake block as a block, a hidden
 * exit's patch of wall as a thin slab over its opening.
 */
import { PLAYER } from '../entities/player.js';
import { SCAN } from '../entities/scan.js';
import { isBackSide, sideAxes } from '../data/room-data.js';

export const SCAN_FX = {
  /** Line brightness of the wave, and of the square trailing it. */
  brightness: 2.2,
  trailBrightness: 0.8,
  /** How far behind the wave the trailing square runs, in units. */
  trail: 0.6,
  /** The wave floats this far above the floor it spreads over. */
  lift: 0.02,
  /** Thickness of the slab of wall a hidden exit derezzes from. */
  slab: 0.25,
  /** Height of the slab at a front exit, which has no wall: the floor's edge. */
  frontSlab: 0.3,
};

/**
 * The sides of a square of half-width `reach` round `origin`, at its
 * height, clipped to the floor of a room of `size`: each side a segment,
 * or null where it lies off the floor (the wave has left the room there).
 * @param {number[]} origin feet center
 * @param {number} reach
 * @param {number[]} size room size
 * @returns {(number[][]|null)[]} sides at −z, +x, +z, −x
 */
export function scanSquare(origin, reach, [w, , d]) {
  const [ox, oy, oz] = origin;
  const y = oy + SCAN_FX.lift;
  const x0 = Math.max(ox - reach, 0);
  const x1 = Math.min(ox + reach, w);
  const z0 = Math.max(oz - reach, 0);
  const z1 = Math.min(oz + reach, d);
  const on = (v, max) => v >= 0 && v <= max;
  return [
    on(oz - reach, d) ? [[x0, y, oz - reach], [x1, y, oz - reach]] : null,
    on(ox + reach, w) ? [[ox + reach, y, z0], [ox + reach, y, z1]] : null,
    on(oz + reach, d) ? [[x0, y, oz + reach], [x1, y, oz + reach]] : null,
    on(ox - reach, w) ? [[ox - reach, y, z0], [ox - reach, y, z1]] : null,
  ];
}

/**
 * How bright the wave is `tick` ticks after the cast: full while it
 * spreads, then fading to nothing at PLAYER.scanTicks.
 * @param {number} tick may be fractional
 */
export function waveBrightness(tick) {
  if (tick < 0 || tick >= PLAYER.scanTicks) return 0;
  if (tick <= SCAN.spreadTicks) return 1;
  return 1 - (tick - SCAN.spreadTicks) / (PLAYER.scanTicks - SCAN.spreadTicks);
}

/**
 * The derez body (derez-fx.js) of the patch of wall over a hidden exit's
 * opening, and where it stands (feet center): a thin slab filling a back
 * doorway, a low one along a front exit's edge.
 * @param {{ side: string, at: number, width: number, y: number, height: number }} exit exit with defaults applied
 * @param {number[]} size room size
 * @returns {{ body: { size: number[] }, at: number[] }}
 */
export function exitSlab({ side, at, width, y, height }, size) {
  const { cross, along } = sideAxes(side);
  const back = isBackSide(side);
  const box = [0, back ? height : SCAN_FX.frontSlab, 0];
  box[cross] = SCAN_FX.slab;
  box[along] = width;
  const pos = [0, y, 0];
  pos[cross] = back ? 0 : size[cross];
  pos[along] = at + width / 2;
  return { body: { size: box }, at: pos };
}
