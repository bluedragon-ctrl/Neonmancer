/**
 * Face marks: small line patterns drawn on every face of a unit cube, so
 * object types differ by shape and not only by color (pure logic, tested).
 */

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

/** Names of the available marks. */
export const MARKS = Object.keys(PATTERNS);

/**
 * Mark segments on all six faces of the unit cube at `cell`.
 * @param {string} mark one of MARKS
 * @param {number[]} [cell] cube corner [x, y, z]
 * @returns {number[][][]} segments as [[x1, y1, z1], [x2, y2, z2]]
 */
export function markSegments(mark, cell = [0, 0, 0]) {
  const pattern = PATTERNS[mark] ?? [];
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
      for (const [from, to] of pattern) segments.push([toWorld(from), toWorld(to)]);
    }
  }
  return segments;
}
