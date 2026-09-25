// Temporary hand-made room for the renderer demo. Replaced by rooms loaded
// from data/rooms/*.json in the next Phase 1 step.

/** Every cell of the box from `from` to `to` (inclusive). */
function fill([x1, y1, z1], [x2, y2, z2] = [x1, y1, z1]) {
  const cells = [];
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) cells.push([x, y, z]);
  return cells;
}

export const DEMO_ROOM = {
  size: [12, 4, 12],
  cells: [
    // Ledge along the left back wall with a step up at its end.
    ...fill([0, 0, 3], [1, 0, 8]),
    ...fill([0, 1, 7], [1, 1, 8]),
    // Staircase against the right back wall.
    ...fill([6, 0, 0], [9, 0, 0]),
    ...fill([7, 1, 0], [9, 1, 0]),
    ...fill([8, 2, 0], [9, 2, 0]),
    // Free-standing pillar and an L-shaped wall in the middle.
    ...fill([4, 0, 4], [4, 2, 4]),
    ...fill([7, 0, 6], [9, 0, 6]),
    ...fill([9, 0, 7], [9, 0, 8]),
    // Two blocks touching only at an edge.
    [5, 0, 9],
    [4, 0, 10],
  ],
};
