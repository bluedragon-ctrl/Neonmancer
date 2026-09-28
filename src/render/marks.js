/**
 * Face marks: small line patterns drawn on every face of a unit cube, so
 * object types differ by shape and not only by color (pure logic, tested).
 * The data bits are a grid of small squares (`bits`); a destructible
 * object shows them with some missing (`bitsBroken`, bitLayout()).
 */
import { hash } from './hash.js';

/** Patterns in face coordinates (0..1 on both axes), as 2D segments. */
const PATTERNS = {
  none: [],
  // A smaller square inside each face.
  inset: square(0.22),
  // Both diagonals, stopping short of the corners.
  cross: [
    [[0.18, 0.18], [0.82, 0.82]],
    [[0.18, 0.82], [0.82, 0.18]],
  ],
  // Corner brackets: an L in each corner.
  brackets: [
    [0.15, 0.15, 1, 1],
    [0.85, 0.15, -1, 1],
    [0.15, 0.85, 1, -1],
    [0.85, 0.85, -1, -1],
  ].flatMap(([u, v, du, dv]) => [
    [[u, v], [u + 0.25 * du, v]],
    [[u, v], [u, v + 0.25 * dv]],
  ]),
  // Data bits: a full grid of small squares.
  bits: () => bitSquares(null),
  // Destructible objects (not a style: drawn for any object with integrity,
  // in place of its mark): the grid with bits missing, per face.
  bitsBroken: (face) => bitSquares(face),
};

function square(margin) {
  const a = margin;
  const b = 1 - margin;
  return [
    [[a, a], [b, a]],
    [[b, a], [b, b]],
    [[b, b], [a, b]],
    [[a, b], [a, a]],
  ];
}

/**
 * Data bits: a grid of small squares on each face, drawn pale (the object
 * color mixed `whiten` towards white) and a little dimmer than a mark
 * (`brightness`), so the grid doesn't outshine the edges. A destructible object misses
 * `off` of them per face, different on every face, so it reads as a
 * corrupted data block next to a whole one.
 */
export const BITS = { grid: 4, margin: 0.14, size: 0.1, off: 6, whiten: 0.35, width: 1.6, brightness: 0.85 };

/**
 * Which bits of a face are there, row by row; null for a whole grid.
 * @param {number|null} face 0..5 (see markSegments()) for a destructible
 *   object's grid with bits missing, null for a whole one
 * @returns {boolean[]} grid × grid entries
 */
export function bitLayout(face) {
  const count = BITS.grid * BITS.grid;
  const on = Array(count).fill(true);
  if (face === null) return on;
  const order = [...Array(count).keys()].sort((a, b) => hash(a, face + 20) - hash(b, face + 20));
  for (const i of order.slice(0, BITS.off)) on[i] = false;
  return on;
}

/** Outlines of a face's bits (bitLayout()), as 2D segments. */
function bitSquares(face) {
  const { grid, margin, size } = BITS;
  const pitch = (1 - 2 * margin) / grid;
  return bitLayout(face).flatMap((on, i) => {
    if (!on) return [];
    const cu = margin + pitch * ((i % grid) + 0.5);
    const cv = margin + pitch * (Math.floor(i / grid) + 0.5);
    const [a, b, c, d] = [cu - size / 2, cu + size / 2, cv - size / 2, cv + size / 2];
    return [
      [[a, c], [b, c]],
      [[b, c], [b, d]],
      [[b, d], [a, d]],
      [[a, d], [a, c]],
    ];
  });
}

/** Names of the marks an object type can choose (its `mark` style); `bitsBroken` is not one. */
export const MARKS = ['none', 'inset', 'cross', 'brackets', 'bits'];

/**
 * Mark segments on all six faces of the unit cube at `cell`.
 * @param {string} mark one of MARKS, or 'bitsBroken'
 * @param {number[]} [cell] cube corner [x, y, z]
 * @returns {number[][][]} segments as [[x1, y1, z1], [x2, y2, z2]]
 */
export function markSegments(mark, cell = [0, 0, 0]) {
  const segments = [];
  for (let axis = 0; axis < 3; axis++) {
    // The face's own two axes.
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    for (const side of [0, 1]) {
      const toWorld = ([pu, pv]) => {
        const p = [...cell];
        p[axis] += side;
        p[u] += pu;
        p[v] += pv;
        return p;
      };
      const pattern = PATTERNS[mark] ?? [];
      for (const [from, to] of typeof pattern === 'function' ? pattern(axis * 2 + side) : pattern) {
        segments.push([toWorld(from), toWorld(to)]);
      }
    }
  }
  return segments;
}
