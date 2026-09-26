/**
 * Axis-separated AABB movement against the solid cells of a grid and
 * against moving bodies (pushable objects).
 *
 * A body is a box given by its feet center `pos` [x, y, z] (bottom middle)
 * and `size` [x, y, z]. It moves one axis at a time; after each axis move
 * any overlap with a solid cell is resolved by pushing the box back to the
 * cell face. Speeds stay below one unit per tick, so no swept test is needed.
 *
 * Bodies are anything with `box()` returning [[minX, maxX], [minY, maxY],
 * [minZ, maxZ]] (room objects and the wizard); the mover never collides with itself.
 */

/** Overlaps smaller than this don't count, so touching faces never collide. */
const EPS = 1e-6;

/** Heights closer than this count as touching (one box resting on another). */
export const REST_EPS = 1e-4;

/**
 * The box of a body on each axis as [min, max].
 * @param {number[]} pos feet center
 * @param {number[]} size
 */
export function bodyBox(pos, size) {
  return [
    [pos[0] - size[0] / 2, pos[0] + size[0] / 2],
    [pos[1], pos[1] + size[1]],
    [pos[2] - size[2] / 2, pos[2] + size[2] / 2],
  ];
}

/** Do two [min, max] intervals overlap by more than EPS? */
export function overlaps([a0, a1], [b0, b1]) {
  return a0 < b1 - EPS && b0 < a1 - EPS;
}

/** Box of the unit cell with its lower corner at [x, y, z]. */
export function cellBox([x, y, z]) {
  return [
    [x, x + 1],
    [y, y + 1],
    [z, z + 1],
  ];
}

/** Integer cell range [lo, hi] a [min, max] interval overlaps. */
function cellRange([min, max]) {
  return [Math.floor(min + EPS), Math.ceil(max - EPS) - 1];
}

/**
 * Does the box overlap any solid cell?
 * @param {number[][]} box from bodyBox()
 * @param {{ isSolid(x: number, y: number, z: number): boolean }} grid
 */
export function overlapsSolid(box, grid) {
  const [x0, x1] = cellRange(box[0]);
  const [y0, y1] = cellRange(box[1]);
  const [z0, z1] = cellRange(box[2]);
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (grid.isSolid(x, y, z)) return true;
  return false;
}

/**
 * The first cell of the given type the box touches: overlaps, or lies
 * against one of its faces (within `reach`). Standing on a block, or
 * walking into its side, counts as touching it.
 * @param {number[][]} box from bodyBox()
 * @param {{ cellAt(x: number, y: number, z: number): number }} grid
 * @param {number} type a CELL type (world/grid.js)
 * @param {number} [reach] how far beyond the box faces still counts
 * @returns {number[]|null} the cell [x, y, z], or null if none
 */
export function touchedCell(box, grid, type, reach = 0.02) {
  const [x0, x1] = cellRange([box[0][0] - reach, box[0][1] + reach]);
  const [y0, y1] = cellRange([box[1][0] - reach, box[1][1] + reach]);
  const [z0, z1] = cellRange([box[2][0] - reach, box[2][1] + reach]);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        if (grid.cellAt(x, y, z) !== type) continue;
        // Reaching past a corner diagonally doesn't count (touchesBox()).
        const cell = [x, y, z];
        if (touchesBox(box, cellBox(cell), reach)) return cell;
      }
    }
  }
  return null;
}

/**
 * Move a body along one axis, stopping at the first solid cell face or body.
 * Changes `pos` in place. Returns false if the move was free, the body that
 * stopped it, or true for a cell (a body wins if both touch).
 * @param {number[]} pos feet center, updated
 * @param {number[]} size
 * @param {0|1|2} axis
 * @param {number} delta
 * @param {{ isSolid(x: number, y: number, z: number): boolean }} grid
 * @param {Iterable<{ box(): number[][] }>} [bodies] moving bodies
 * @param {object} [self] the mover itself, skipped among the bodies
 */
export function moveAxis(pos, size, axis, delta, grid, bodies = [], self = null) {
  if (delta === 0) return false;
  pos[axis] += delta;

  const box = bodyBox(pos, size);
  const ranges = box.map(cellRange);
  let blocked = false;
  let limit = pos[axis];

  for (let x = ranges[0][0]; x <= ranges[0][1]; x++) {
    for (let y = ranges[1][0]; y <= ranges[1][1]; y++) {
      for (let z = ranges[2][0]; z <= ranges[2][1]; z++) {
        if (!grid.isSolid(x, y, z)) continue;
        const cell = [x, y, z][axis];
        // Offset from the body's reference point to the face that touches.
        const [min, max] = box[axis];
        const toMin = pos[axis] - min;
        const toMax = max - pos[axis];
        const stop = delta > 0 ? cell - toMax : cell + 1 + toMin;
        limit = delta > 0 ? Math.min(limit, stop) : Math.max(limit, stop);
        blocked = true;
      }
    }
  }

  // Offsets from the reference point to the box faces on this axis.
  const toMin = pos[axis] - box[axis][0];
  const toMax = box[axis][1] - pos[axis];
  for (const body of bodies) {
    if (body === self) continue;
    const other = body.box();
    if (!other.every((range, i) => overlaps(box[i], range))) continue;
    const stop = delta > 0 ? other[axis][0] - toMax : other[axis][1] + toMin;
    if (delta > 0 ? stop <= limit : stop >= limit) {
      limit = stop;
      blocked = body;
    }
  }
  pos[axis] = limit;
  return blocked;
}

/**
 * Height of the highest solid surface under the footprint of a box, at or
 * below its bottom: static cells, bodies, or the floor at 0. Used for drop
 * shadows and for landing pushables.
 * @param {number[][]} box [[minX, maxX], [minY, maxY], [minZ, maxZ]]
 * @param {{ isSolid(x: number, y: number, z: number): boolean }} grid
 * @param {Iterable<{ box(): number[][] }>} [bodies]
 * @param {object} [self] skipped among the bodies
 */
export function surfaceBelow(box, grid, bodies = [], self = null) {
  const [x0, x1] = cellRange(box[0]);
  const [z0, z1] = cellRange(box[2]);
  const bottom = box[1][0];
  let top = 0;
  search: for (let y = Math.floor(bottom + EPS) - 1; y >= 0; y--) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (grid.isSolid(x, y, z)) {
          top = y + 1;
          break search;
        }
      }
    }
  }
  for (const body of bodies) {
    if (body === self) continue;
    const other = body.box();
    if (!overlaps(box[0], other[0]) || !overlaps(box[2], other[2])) continue;
    if (other[1][1] <= bottom + EPS) top = Math.max(top, other[1][1]);
  }
  return top;
}

/**
 * Surface height under a body given by its feet center (the player).
 * @param {number[]} pos feet center
 * @param {number[]} size
 * @param {{ isSolid(x: number, y: number, z: number): boolean }} grid
 * @param {Iterable<{ box(): number[][] }>} [bodies]
 */
export function groundBelow(pos, size, grid, bodies = []) {
  return surfaceBelow(bodyBox(pos, size), grid, bodies);
}

/** Do two boxes overlap on every axis (more than touching)? */
export function overlapsBox(a, b) {
  return a.every((range, i) => overlaps(range, b[i]));
}

/** Does box `a` rest on top of box `b`: bottom on its top, footprints overlapping? */
export function restsOn(a, b) {
  return Math.abs(a[1][0] - b[1][1]) < REST_EPS && overlaps(a[0], b[0]) && overlaps(a[2], b[2]);
}

/**
 * A body's feet center moved clear of `box` (something moving into it): `pos`
 * itself if it is clear already, else the smallest shove (at most
 * `maxShove`, along any axis) that fits between blocks and `others`, or
 * null if none does (he is pinned).
 * @param {number[]} pos feet center
 * @param {number[]} size
 * @param {number[][]} box the pusher's new box
 * @param {{ isSolid(x: number, y: number, z: number): boolean }} grid
 * @param {Iterable<{ box(): number[][] }>} others bodies he can't be shoved into
 * @param {object} self the shoved body, skipped among `others`
 * @param {number} maxShove
 * @returns {number[]|null}
 */
export function shoveClear(pos, size, box, grid, others, self, maxShove) {
  const current = bodyBox(pos, size);
  if (!overlapsBox(current, box)) return pos;
  const shoves = [];
  for (const axis of [0, 1, 2]) {
    shoves.push([axis, box[axis][1] - current[axis][0]], [axis, box[axis][0] - current[axis][1]]);
  }
  shoves.sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
  for (const [axis, amount] of shoves) {
    if (Math.abs(amount) > maxShove) break;
    const moved = [...pos];
    if (moveAxis(moved, size, axis, amount, grid, others, self) === false && !overlapsBox(bodyBox(moved, size), box)) return moved;
  }
  return null;
}

/**
 * Does box `a` touch box `b`: overlap it on at least two axes and lie
 * against or in it on the third (within `reach`)? Grazing a corner
 * diagonally doesn't count (the hazard rule, D44).
 * @param {number[][]} a
 * @param {number[][]} b
 * @param {number} [reach]
 */
export function touchesBox(a, b, reach = 0.02) {
  let inside = 0;
  for (let i = 0; i < 3; i++) {
    if (overlaps(a[i], b[i])) inside++;
    else if (a[i][0] > b[i][1] + reach || b[i][0] > a[i][1] + reach) return false;
  }
  return inside >= 2;
}
