/**
 * What enemies see and reach (D78): rays through the room grid and its
 * solid bodies, the line of sight between two points, and how far a point
 * is from a box. Pure logic.
 *
 * A ray marches in short steps and stops in the first solid cell (blocks,
 * the room's edge and floor, closed exits) or inside the first body box
 * it meets. Holes don't stop it (it passes over them).
 */

/** Ray step in units: short enough not to skip a corner of a 0.6 body. */
const STEP = 0.05;

/**
 * Cast a ray from `from` along the unit vector `dir`, at most `range` far.
 * @param {number[]} from
 * @param {number[]} dir unit length
 * @param {number} range
 * @param {import('../world/grid.js').Grid} grid
 * @param {{ box(): number[][] }[]} [bodies] bodies it stops at (their boxes are read once)
 * @returns {{ distance: number, point: number[], body: object|null, blocked: boolean }}
 *   where it stopped; `body` is the body it stopped in, `blocked` whether a
 *   solid cell stopped it (neither: it ran its full range)
 */
export function castRay(from, dir, range, grid, bodies = []) {
  const boxes = bodies.map((body) => [body, body.box()]);
  const point = [0, 0, 0];
  range = Math.max(0, range || 0);
  for (let t = 0; ; t = Math.min(t + STEP, range)) {
    for (let i = 0; i < 3; i++) point[i] = from[i] + dir[i] * t;
    if (grid.isSolid(Math.floor(point[0]), Math.floor(point[1]), Math.floor(point[2]))) {
      return { distance: t, point: [...point], body: null, blocked: true };
    }
    for (const [body, box] of boxes) {
      if (inBox(point, box)) return { distance: t, point: [...point], body, blocked: false };
    }
    if (t >= range) return { distance: range, point: [...point], body: null, blocked: false };
  }
}

/**
 * Can a ray get from `from` to `to` without a solid cell or one of
 * `bodies` in the way?
 * @param {number[]} from
 * @param {number[]} to
 * @param {import('../world/grid.js').Grid} grid
 * @param {{ box(): number[][] }[]} [bodies]
 */
export function lineOfSight(from, to, grid, bodies = []) {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  if (d === 0) return true;
  const dir = direction(from, to);
  // The last step lands on `to` itself; a body there (the target) doesn't count.
  return castRay(from, dir, Math.max(0, d - STEP), grid, bodies).distance >= d - STEP - 1e-9;
}

/**
 * The unit vector from `from` towards `to` (zero if they are the same).
 * @param {number[]} from
 * @param {number[]} to
 */
export function direction(from, to) {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  return d === 0 ? [0, 0, 0] : [0, 1, 2].map((i) => (to[i] - from[i]) / d);
}

/**
 * The grid cells a ray from `from` along `dir` passes through over
 * `length`, in order, each once.
 * @param {number[]} from
 * @param {number[]} dir unit length
 * @param {number} length
 * @returns {number[][]} cells [x, y, z]
 */
export function cellsAlong(from, dir, length) {
  const cells = [];
  const seen = new Set();
  length = Math.max(0, length || 0);
  for (let t = 0; ; t = Math.min(t + STEP, length)) {
    const cell = [0, 1, 2].map((i) => Math.floor(from[i] + dir[i] * t));
    const key = cell.join();
    if (!seen.has(key)) {
      seen.add(key);
      cells.push(cell);
    }
    if (t >= length) return cells;
  }
}

/**
 * Distance from a point to the nearest point of a box (0 inside it).
 * @param {number[]} point
 * @param {number[][]} box [[minX, maxX], [minY, maxY], [minZ, maxZ]]
 */
export function reach(point, box) {
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    const [min, max] = box[i];
    const out = point[i] < min ? min - point[i] : point[i] > max ? point[i] - max : 0;
    sum += out * out;
  }
  return Math.sqrt(sum);
}

/** The middle of a box. @param {number[][]} box */
export function boxCenter(box) {
  return box.map(([min, max]) => (min + max) / 2);
}

/** Is the point inside the box (edges included)? */
function inBox(point, box) {
  return box.every(([min, max], i) => point[i] >= min && point[i] <= max);
}
