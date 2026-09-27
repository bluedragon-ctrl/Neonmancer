/**
 * Visible edges of a set of unit blocks (pure logic, unit tested).
 *
 * An edge of the grid is drawn when the four cells around it form a corner:
 * one or three of them filled (outer or inner corner), or two filled
 * diagonally. Two filled side by side means the faces are coplanar, so the
 * edge between neighbouring blocks is dropped. Collinear pieces are merged
 * into single segments.
 */
import { cellKey } from '../data/room-data.js';

/** For each axis, the two other axes. */
const OTHER_AXES = [
  [1, 2],
  [0, 2],
  [0, 1],
];

/**
 * @param {Iterable<number[]>} cells filled cells as [x, y, z]
 * @param {Set<string>} [claimed] unit edges (edgeUnitKeys()) drawn by
 *   something else, left out
 * @returns {number[][][]} segments as [[x1, y1, z1], [x2, y2, z2]]
 */
export function blockEdges(cells, claimed = null) {
  const units = cornerUnits(cells).map(({ segment }) => segment);
  return mergeUnitSegments(claimed ? units.filter((unit) => !claimed.has(unitKey(unit))) : units);
}

/**
 * Keys of the unit edges blockEdges() draws for `cells`, so blocks drawn
 * after them can leave those out (D64: where two looks would draw the same
 * line, only one does).
 * @param {Iterable<number[]>} cells
 * @returns {Set<string>}
 */
export function edgeUnitKeys(cells) {
  return new Set(cornerUnits(cells).map(({ segment }) => unitKey(segment)));
}

/** Key of a unit segment: its axis and start corner. */
function unitKey([start, end]) {
  return `${start.findIndex((v, i) => v !== end[i])}:${start}`;
}

/**
 * Edges of several block types drawn as one mass (D64): the corner rule
 * runs over all their cells together, so there is no edge between two
 * neighbours of different types either; each edge goes to the highest
 * ranked type among the filled cells around it (later groups rank higher).
 * @param {number[][][]} groups cells of each type, lowest rank first
 * @param {Set<string>} [claimed] unit edges (edgeUnitKeys()) drawn by
 *   something else, left out
 * @returns {number[][][][]} merged segments of each group, in the same order
 */
export function groupedBlockEdges(groups, claimed = new Set()) {
  const rank = new Map();
  groups.forEach((cells, i) => {
    for (const cell of cells) rank.set(cellKey(cell), i);
  });
  const units = groups.map(() => []);
  for (const { segment, around } of cornerUnits(groups.flat())) {
    if (claimed.has(unitKey(segment))) continue;
    const owner = Math.max(...around.map((cell) => rank.get(cellKey(cell)) ?? -1));
    units[owner].push(segment);
  }
  return units.map(mergeUnitSegments);
}

/**
 * Unit edges of a set of blocks that form a corner, each with the four
 * cells around it.
 * @param {Iterable<number[]>} cells
 * @returns {{ segment: number[][], around: number[][] }[]}
 */
function cornerUnits(cells) {
  const filled = new Set();
  for (const cell of cells) filled.add(cellKey(cell));
  const has = (p) => filled.has(cellKey(p));

  const units = [];
  const seen = new Set();

  for (const key of filled) {
    const cell = key.split(',').map(Number);
    for (let axis = 0; axis < 3; axis++) {
      const [b, c] = OTHER_AXES[axis];
      // The 4 edges of this cell that run along `axis`.
      for (const db of [0, 1]) {
        for (const dc of [0, 1]) {
          const start = [...cell];
          start[b] += db;
          start[c] += dc;
          const edgeKey = `${axis}:${start}`;
          if (seen.has(edgeKey)) continue;
          seen.add(edgeKey);
          const around = cellsAround(start, b, c);
          if (!isCorner(around.map(has))) continue;
          const end = [...start];
          end[axis] += 1;
          units.push({ segment: [start, end], around });
        }
      }
    }
  }
  return units;
}

/**
 * Merge axis-aligned unit segments that continue each other into single
 * segments (duplicates count once), so thick lines have no seams.
 * @param {number[][][]} units segments of length 1 along one axis
 * @returns {number[][][]}
 */
export function mergeUnitSegments(units) {
  // Keyed by line (axis + the two fixed coordinates), each holding the start
  // positions along the axis.
  const lines = new Map();
  for (const [p, q] of units) {
    const axis = p.findIndex((v, i) => v !== q[i]);
    const start = p[axis] < q[axis] ? p : q;
    const [b, c] = OTHER_AXES[axis];
    const lineKey = `${axis}:${start[b]},${start[c]}`;
    if (!lines.has(lineKey)) lines.set(lineKey, { axis, start, positions: new Set() });
    lines.get(lineKey).positions.add(start[axis]);
  }

  const segments = [];
  for (const { axis, start, positions: unique } of lines.values()) {
    const positions = [...unique].sort((p, q) => p - q);
    let runStart = positions[0];
    for (let i = 1; i <= positions.length; i++) {
      // A run ends at a gap or after the last piece.
      if (i < positions.length && positions[i] === positions[i - 1] + 1) continue;
      const from = [...start];
      const to = [...start];
      from[axis] = runStart;
      to[axis] = positions[i - 1] + 1;
      segments.push([from, to]);
      runStart = positions[i];
    }
  }
  return segments;
}

/** The four cells around the edge starting at `start` (b, c: the other two axes), diagonal pairs at 0/3 and 1/2. */
function cellsAround(start, b, c) {
  return [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([db, dc]) => {
    const p = [...start];
    p[b] -= db;
    p[c] -= dc;
    return p;
  });
}

/** Do the four cells around an edge (filled or not) form a visible corner? */
function isCorner([a, e, f, d]) {
  const n = a + e + f + d;
  if (n === 1 || n === 3) return true;
  return n === 2 && a === d; // diagonal pair
}

/**
 * Flatten segments into [x1, y1, z1, x2, y2, z2, ...] for line geometry.
 * @param {number[][][]} segments
 */
export function flattenSegments(segments) {
  return segments.flatMap(([from, to]) => [...from, ...to]);
}
