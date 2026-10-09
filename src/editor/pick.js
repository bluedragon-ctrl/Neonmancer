/**
 * Mouse picking in the room editor that hits what is seen (D142): the
 * mouse ray against the boxes of the blocks, objects, enemies and pickups
 * drawn (not those cut away above the layer), before the layer's plane. A
 * box on the current layer (or above it, when nothing is cut) is hit
 * through its top or side; a box below the layer never wins, since the
 * ray meets the layer first, so placing on a layer works as before. Plain
 * math on arrays, no three.js, so tests can drive it.
 */
import { DECO_LOOKS } from '../data/room-data.js';

/** A plate is a thin tile on the floor: the floor behind it stays easy to click. */
const PLATE_HEIGHT = 0.15;

/**
 * Where a ray enters a box, or null if it misses (or the box is behind it).
 * @param {number[]} origin [x, y, z]
 * @param {number[]} dir [x, y, z]
 * @param {number[]} lo the box's low corner
 * @param {number[]} hi the box's high corner
 * @returns {number|null} the distance along the ray (in units of `dir`)
 */
export function rayBox(origin, dir, lo, hi) {
  let near = -Infinity;
  let far = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(dir[axis]) < 1e-12) {
      if (origin[axis] < lo[axis] || origin[axis] > hi[axis]) return null;
      continue;
    }
    const a = (lo[axis] - origin[axis]) / dir[axis];
    const b = (hi[axis] - origin[axis]) / dir[axis];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  return near <= far && far >= 0 ? Math.max(near, 0) : null;
}

/**
 * The boxes a click can hit, each with the cell a tool acts on (an item's
 * own `at`, even for a tall decoration).
 * @param {import('./room-edit.js').RoomEdit} edit
 * @param {Record<string, object>} objectTypes object and pickup types
 * @param {object} [options]
 * @param {number|null} [options.cutAbove] what is above this layer isn't drawn, so isn't hit
 * @param {boolean} [options.blocks] blocks count (false: only objects, enemies and pickups)
 * @returns {{ cell: number[], lo: number[], hi: number[] }[]}
 */
export function hitBoxes(edit, objectTypes, { cutAbove = null, blocks = true } = {}) {
  const shown = (y) => cutAbove === null || y <= cutAbove;
  const out = [];
  if (blocks) {
    for (const { cell } of edit.blocks.cells()) {
      if (shown(cell[1])) out.push({ cell, lo: cell, hi: cell.map((v) => v + 1) });
    }
  }
  for (const item of edit.items()) {
    if (!shown(item.at[1])) continue;
    const type = objectTypes[item.type];
    const size = type?.kind === 'deco' ? (DECO_LOOKS[item.overrides?.look ?? type.look]?.size ?? [1, 1, 1]) : [1, type?.kind === 'plate' || type?.kind === 'socket' ? PLATE_HEIGHT : 1, 1];
    out.push({ cell: item.at, lo: item.at, hi: item.at.map((v, axis) => v + size[axis]) });
  }
  return out;
}

/**
 * The nearest box a ray hits.
 * @param {number[]} origin
 * @param {number[]} dir
 * @param {{ cell: number[], lo: number[], hi: number[] }[]} boxes
 * @returns {{ cell: number[], t: number }|null}
 */
export function firstHit(origin, dir, boxes) {
  let best = null;
  for (const box of boxes) {
    const t = rayBox(origin, dir, box.lo, box.hi);
    if (t !== null && (!best || t < best.t)) best = { cell: box.cell, t };
  }
  return best;
}

/**
 * The cell a click is on: the nearest box hit, unless the layer's plane
 * comes first (or as near: a box's top on the layer below is the floor of
 * the cell above it, on this layer).
 * @param {number[]} origin
 * @param {number[]} dir
 * @param {{ cell: number[], lo: number[], hi: number[] }[]} boxes
 * @param {number} layer the plane's height
 * @returns {{ cell: number[]|null, point: number[] }|null} `cell` null for a
 *   plane cell (the caller keeps it inside the room); `point` where the ray met it
 */
export function pickCell(origin, dir, boxes, layer) {
  const box = firstHit(origin, dir, boxes);
  const plane = Math.abs(dir[1]) < 1e-12 ? null : (layer - origin[1]) / dir[1];
  const onPlane = plane !== null && plane >= 0 && (!box || plane <= box.t + 1e-6);
  if (!onPlane && !box) return null;
  const t = onPlane ? plane : box.t;
  const point = origin.map((v, axis) => v + dir[axis] * t);
  return { cell: onPlane ? null : box.cell, point };
}
