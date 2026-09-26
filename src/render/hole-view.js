/**
 * Holes in the floor: pits that look bottomless. The floor shader cuts the
 * hole tiles out; this view adds the pit (walls fading to a black bottom),
 * a bright rim and short corner lines that quickly fade to black for depth.
 * There is no real space below the floor: the pit is only a look.
 */
import { Color, Group } from 'three';
import { cellKey } from '../data/room-data.js';
import { PALETTE, fadingLines, lineMaterial, neonLines, shadedFaces } from './neon.js';

/** How far the pit walls reach below the floor, in blocks. */
const PIT_DEPTH = 1.2;

/** Length of the fading corner lines in the pit, in blocks. */
export const DROP_LENGTH = 0.45;

/**
 * The outline of a set of hole tiles: every tile side that borders a
 * non-hole tile (pure logic, tested).
 * @param {number[][]} holes hole tiles as [x, z]
 * @returns {number[][][]} sides as [[x1, z1], [x2, z2]] on the floor
 */
export function holeSides(holes) {
  const hole = new Set(holes.map(cellKey));
  const isHole = (x, z) => hole.has(cellKey([x, z]));
  const sides = [];
  for (const [x, z] of holes) {
    if (!isHole(x - 1, z)) sides.push([[x, z], [x, z + 1]]);
    if (!isHole(x + 1, z)) sides.push([[x + 1, z], [x + 1, z + 1]]);
    if (!isHole(x, z - 1)) sides.push([[x, z], [x + 1, z]]);
    if (!isHole(x, z + 1)) sides.push([[x, z + 1], [x + 1, z + 1]]);
  }
  return sides;
}

/**
 * @param {number[][]} holes hole tiles as [x, z]
 * @param {number|string} color room color
 */
export function createHoleView(holes, color) {
  const group = new Group();
  if (holes.length === 0) return group;
  const sides = holeSides(holes);

  // Pit walls: a quad below each side, dark at the top, full black at the
  // bottom; plus a black bottom under every tile. Darker than the (faintly
  // tinted) room floor, so it reads as a hole.
  const top = new Color(PALETTE.void);
  const black = new Color(0x000000);
  const positions = [];
  const colors = [];
  const vertex = (x, y, z, c) => {
    positions.push(x, y, z);
    colors.push(c.r, c.g, c.b);
  };
  for (const [[x1, z1], [x2, z2]] of sides) {
    vertex(x1, 0, z1, top);
    vertex(x2, 0, z2, top);
    vertex(x2, -PIT_DEPTH, z2, black);
    vertex(x1, 0, z1, top);
    vertex(x2, -PIT_DEPTH, z2, black);
    vertex(x1, -PIT_DEPTH, z1, black);
  }
  for (const [x, z] of holes) {
    const y = -PIT_DEPTH;
    vertex(x, y, z, black);
    vertex(x + 1, y, z, black);
    vertex(x + 1, y, z + 1, black);
    vertex(x, y, z, black);
    vertex(x + 1, y, z + 1, black);
    vertex(x, y, z + 1, black);
  }
  group.add(shadedFaces(positions, colors));

  // Bright rim along the floor edge of the hole.
  const rim = sides.map(([[x1, z1], [x2, z2]]) => [[x1, 0, z1], [x2, 0, z2]]);
  const rimLines = neonLines(rim, lineMaterial({ color, width: 2.5, brightness: 1.6 }));
  rimLines.renderOrder = 2;
  group.add(rimLines);

  // Short vertical lines at the rim corners, fading to black quickly: the
  // eye reads them as depth.
  const corners = new Map();
  for (const side of sides) for (const corner of side) corners.set(cellKey(corner), corner);
  group.add(fadingDrops([...corners.values()], 0, color, 0.6));

  return group;
}

/**
 * Short vertical lines going down from `top` at the given [x, z] corners,
 * fading from the color to black within DROP_LENGTH: they read as depth.
 * Also used for the corners of an object plugging a hole.
 * @param {number[][]} corners [x, z] points
 * @param {number} top height the lines start at
 * @param {number|string} color
 * @param {number} brightness of the top end
 * @param {number} [width] in pixels at 1080p
 */
export function fadingDrops(corners, top, color, brightness, width = 1.5) {
  const drops = corners.map(([x, z]) => [[x, top, z], [x, top - DROP_LENGTH, z]]);
  return fadingLines(drops, { color, width, brightness });
}
