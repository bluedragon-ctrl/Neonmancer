/**
 * The spiked shape of an object (D82): a smaller core cube with a grid of
 * pyramids on each of its six sides, their tips reaching the faces of the
 * object's cell. The shape stays inside the cell, so what the wizard sees
 * is what hurts him: touching a tip is touching the object's box.
 *
 * Pure geometry (tested): triangles for the faces (the pyramids' sides
 * close the shape; the core's own faces are all under pyramid bases) and
 * line segments for the outline.
 */

/** Tuning: how far the core sits in from the cell's faces (the spike height), pyramids per side along each edge. */
export const SPIKES = { inset: 0.22, grid: 2 };

/**
 * The pyramids of a spiked unit cell with its corner at `cell`: each as
 * its four base corners (in order round the base) and its tip.
 * @param {number[]} [cell] [x, y, z]
 * @returns {{ base: number[][], tip: number[] }[]}
 */
export function spikePyramids(cell = [0, 0, 0], { inset, grid } = SPIKES) {
  const pyramids = [];
  const size = (1 - 2 * inset) / grid;
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    for (const side of [0, 1]) {
      const point = (a, pu, pv) => {
        const p = [...cell];
        p[axis] += a;
        p[u] += pu;
        p[v] += pv;
        return p;
      };
      const face = side === 0 ? inset : 1 - inset;
      for (let i = 0; i < grid; i++) {
        for (let j = 0; j < grid; j++) {
          const u0 = inset + i * size;
          const v0 = inset + j * size;
          pyramids.push({
            base: [point(face, u0, v0), point(face, u0 + size, v0), point(face, u0 + size, v0 + size), point(face, u0, v0 + size)],
            tip: point(side, u0 + size / 2, v0 + size / 2),
          });
        }
      }
    }
  }
  return pyramids;
}

/**
 * Face triangles of the spiked shape, wound so each faces out of its
 * pyramid, as a flat position list (x, y, z per corner) for a BufferGeometry.
 * @param {number[]} [cell]
 * @returns {number[]}
 */
export function spikeTriangles(cell = [0, 0, 0], options = SPIKES) {
  const positions = [];
  for (const { base, tip } of spikePyramids(cell, options)) {
    const center = base.reduce((sum, p) => sum.map((s, i) => s + p[i] / 4), [0, 0, 0]);
    for (let k = 0; k < 4; k++) {
      let a = base[k];
      let b = base[(k + 1) % 4];
      // Outward: the normal points away from the middle of the base.
      const normal = cross(sub(b, a), sub(tip, a));
      const middle = [0, 1, 2].map((i) => (a[i] + b[i] + tip[i]) / 3 - center[i]);
      if (dot(normal, middle) < 0) [a, b] = [b, a];
      positions.push(...a, ...b, ...tip);
    }
  }
  return positions;
}

/**
 * Outline segments of the spiked shape: the core cube's edges and each
 * pyramid's four ridges up to its tip (the valleys between pyramids on
 * one side are left out, they only clutter it). Segments as
 * [[x1, y1, z1], [x2, y2, z2]].
 * @param {number[]} [cell]
 * @returns {number[][][]}
 */
export function spikeSegments(cell = [0, 0, 0], options = SPIKES) {
  const segments = [];
  const seen = new Set();
  const add = (a, b) => {
    const key = [a, b].map((p) => p.map((v) => v.toFixed(6)).join()).sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    segments.push([a, b]);
  };
  const { inset } = options;
  // A base line on the core's edge has two coordinates at the core's faces.
  const onCoreEdge = (a, b) =>
    [0, 1, 2].filter((i) => a[i] === b[i] && [inset, 1 - inset].some((f) => Math.abs(a[i] - cell[i] - f) < 1e-9)).length === 2;
  for (const { base, tip } of spikePyramids(cell, options)) {
    for (let k = 0; k < 4; k++) {
      const next = base[(k + 1) % 4];
      if (onCoreEdge(base[k], next)) add(base[k], next);
      add(base[k], tip);
    }
  }
  return segments;
}

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
