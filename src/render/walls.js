/**
 * Layout of the room outline: the two back walls (x = 0 and z = 0) with
 * doorways where exits are, and the open front edges of the floor with gaps
 * where exits are (pure, tested). room-view.js turns it into meshes.
 *
 * A wall is a grid of unit cells (u along the wall, v up). Each unit edge
 * between two cells is drawn by what is on either side of it:
 *   wall | wall       faint grid line
 *   wall | doorway    bright doorway frame
 *   wall | nothing    bright wall outline (top and ends; the foot is on the floor)
 *   doorway | nothing bright threshold at the foot, nothing at the top or ends
 */
import { mergeUnitSegments } from './edges.js';

/** Chevrons float this far above the floor, so they never fight with it. */
const FLOOR_LIFT = 0.01;

/** The back walls: exit side, size in cells and the world point of wall coordinates (u, v). */
function backWalls([w, h, d]) {
  return [
    { side: '-x', length: d, height: h, point: (u, v) => [0, v, u] },
    { side: '-z', length: w, height: h, point: (u, v) => [u, v, 0] },
  ];
}

/**
 * @param {number[]} size room size [x, y, z]
 * @param {{ side: string, at: number, width: number, y: number, height: number }[]} exits
 *   exits with defaults applied
 * @returns {{ faces: number[][][], grid: number[][][], outline: number[][][] }}
 *   `faces` are wall cells as four corners, `grid` and `outline` line segments
 *   [[x, y, z], [x, y, z]]
 */
export function wallLayout(size, exits) {
  const faces = [];
  const grid = [];
  const outline = [];

  for (const wall of backWalls(size)) {
    const doors = exits.filter((exit) => exit.side === wall.side);
    const inWall = (u, v) => u >= 0 && v >= 0 && u < wall.length && v < wall.height;
    const isDoor = (u, v) => doors.some((e) => u >= e.at && u < e.at + e.width && v >= e.y && v < e.y + e.height);
    /** 'wall', 'door' or 'none' for the cell (u, v). */
    const kind = (u, v) => (!inWall(u, v) ? 'none' : isDoor(u, v) ? 'door' : 'wall');

    for (let u = 0; u < wall.length; u++) {
      for (let v = 0; v < wall.height; v++) {
        if (kind(u, v) === 'wall') faces.push([[u, v], [u + 1, v], [u + 1, v + 1], [u, v + 1]].map(([a, b]) => wall.point(a, b)));
      }
    }

    /**
     * Sort the unit edge from (u0, v0) to (u1, v1), lying between cells `a`
     * and `b`; `foot` says whether it is on the floor.
     */
    const edge = (u0, v0, u1, v1, a, b, foot) => {
      const pair = [a, b].sort().join('|');
      const segment = [wall.point(u0, v0), wall.point(u1, v1)];
      if (pair === 'wall|wall') grid.push(segment);
      else if (pair === 'door|wall') outline.push(segment);
      else if (pair === 'none|wall' && !foot) outline.push(segment);
      else if (pair === 'door|none' && foot) outline.push(segment);
    };
    for (let u = 0; u <= wall.length; u++) {
      for (let v = 0; v < wall.height; v++) edge(u, v, u, v + 1, kind(u - 1, v), kind(u, v), false);
    }
    for (let v = 0; v <= wall.height; v++) {
      for (let u = 0; u < wall.length; u++) edge(u, v, u + 1, v, kind(u, v - 1), kind(u, v), v === 0);
    }
  }

  // Open front edges of the floor, with gaps at floor-level exits.
  const [w, , d] = size;
  const fronts = [
    { side: '+z', length: w, point: (u) => [u, 0, d] },
    { side: '+x', length: d, point: (u) => [w, 0, u] },
  ];
  for (const front of fronts) {
    const gaps = exits.filter((e) => e.side === front.side && e.y === 0);
    for (let u = 0; u < front.length; u++) {
      if (!gaps.some((e) => u >= e.at && u < e.at + e.width)) outline.push([front.point(u), front.point(u + 1)]);
    }
  }

  return { faces, grid: mergeUnitSegments(grid), outline: mergeUnitSegments(outline) };
}

/** Arrow tip distance from the side, and half its width (= its depth). */
const ARROW_TIP = 0.15;
const ARROW_HALF = 0.2;

/**
 * Arrows on the floor of exits on the open front sides (+x, +z), where
 * there is no wall to cut a doorway into: one small arrow per tile of exit
 * width, side by side, pointing out of the room, just above its floor. They
 * stay in the first row of tiles (the exit effect glides them out to here).
 * @param {number[]} size room size [x, y, z]
 * @param {{ side: string, at: number, width: number, y: number }[]} exits
 * @returns {number[][][]} line segments
 */
export function frontChevrons([w, , d], exits) {
  const segments = [];
  for (const { side, at, width, y } of exits) {
    if (side !== '+x' && side !== '+z') continue;
    // (a, c): a along the side, c inwards from it.
    const point = (a, c) => (side === '+x' ? [w - c, y + FLOOR_LIFT, a] : [a, y + FLOOR_LIFT, d - c]);
    for (let i = 0; i < width; i++) {
      const center = at + i + 0.5;
      segments.push([point(center - ARROW_HALF, ARROW_TIP + ARROW_HALF), point(center, ARROW_TIP)]);
      segments.push([point(center, ARROW_TIP), point(center + ARROW_HALF, ARROW_TIP + ARROW_HALF)]);
    }
  }
  return segments;
}

/** How deep the dark tunnel behind a doorway reaches, in blocks. */
export const TUNNEL_DEPTH = 1.2;

/** Length of the fading lines running into a tunnel from the doorway corners. */
export const TUNNEL_LINE = 0.45;

/**
 * Dark tunnels behind the doorways in the back walls (like the pits of
 * holes): the doorway leads into darkness instead of showing the floor grid
 * outside. Each face is a quad whose corners carry a shade: 0 at the
 * doorway, 1 (black) at the far end.
 * @param {number[]} size room size [x, y, z]
 * @param {{ side: string, at: number, width: number, y: number, height: number }[]} exits
 * @returns {{ quads: { points: number[][], shade: number[] }[], lines: number[][][] }}
 *   `lines` run from each doorway corner into the tunnel (bright to black)
 */
export function doorwayTunnels(size, exits) {
  const quads = [];
  const lines = [];
  for (const { side, at, width, y, height } of exits) {
    if (side !== '-x' && side !== '-z') continue;
    // (a, c, h): a along the wall, c outwards from it, h height.
    const point = (a, c, h) => (side === '-x' ? [0 - c, h, a] : [a, h, 0 - c]); // 0 - c: no -0
    const [a0, a1, top, D] = [at, at + width, y + height, TUNNEL_DEPTH];
    const quad = (a, b, c, d) => quads.push({ points: [a, b, c, d].map(([u, v, h]) => point(u, v, h)), shade: [a, b, c, d].map(([, v]) => v / D) });
    quad([a0, 0, y], [a1, 0, y], [a1, D, y], [a0, D, y]); // floor
    quad([a0, 0, top], [a1, 0, top], [a1, D, top], [a0, D, top]); // ceiling
    quad([a0, 0, y], [a0, 0, top], [a0, D, top], [a0, D, y]); // side
    quad([a1, 0, y], [a1, 0, top], [a1, D, top], [a1, D, y]); // side
    quad([a0, D, y], [a1, D, y], [a1, D, top], [a0, D, top]); // far end
    for (const a of [a0, a1]) for (const h of [y, top]) lines.push([point(a, 0, h), point(a, TUNNEL_LINE, h)]);
  }
  return { quads, lines };
}
