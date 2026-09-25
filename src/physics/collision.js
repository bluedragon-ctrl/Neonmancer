/**
 * Axis-separated AABB movement against the solid cells of a grid.
 *
 * A body is a box given by its feet center `pos` [x, y, z] (bottom middle)
 * and `size` [x, y, z]. It moves one axis at a time; after each axis move
 * any overlap with a solid cell is resolved by pushing the box back to the
 * cell face. Speeds stay below one unit per tick, so no swept test is needed.
 */

/** Overlaps smaller than this don't count, so touching faces never collide. */
const EPS = 1e-6;

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
 * Move a body along one axis, stopping at the first solid cell face.
 * Changes `pos` in place and returns true if the move was blocked.
 * @param {number[]} pos feet center, updated
 * @param {number[]} size
 * @param {0|1|2} axis
 * @param {number} delta
 * @param {{ isSolid(x: number, y: number, z: number): boolean }} grid
 */
export function moveAxis(pos, size, axis, delta, grid) {
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
  pos[axis] = limit;
  return blocked;
}

/**
 * Height of the highest solid surface under the body's footprint, at or
 * below its feet (the floor is at 0). Used for the drop shadow.
 * @param {number[]} pos feet center
 * @param {number[]} size
 * @param {{ isSolid(x: number, y: number, z: number): boolean }} grid
 */
export function groundBelow(pos, size, grid) {
  const box = bodyBox(pos, size);
  const [x0, x1] = cellRange(box[0]);
  const [z0, z1] = cellRange(box[2]);
  for (let y = Math.floor(pos[1] + EPS) - 1; y >= 0; y--) {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (grid.isSolid(x, y, z)) return y + 1;
  }
  return 0;
}
