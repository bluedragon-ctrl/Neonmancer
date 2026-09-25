/**
 * Holes in the floor: pits that look bottomless. The floor shader cuts the
 * hole tiles out; this view adds the pit (walls fading to a black bottom),
 * a bright rim and short vertical lines that fade downwards for depth.
 * There is no real space below the floor: the pit is only a look.
 */
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { flattenSegments } from './edges.js';
import { PALETTE, lineMaterial } from './neon.js';

/** How far the pit walls reach below the floor, in blocks. */
const PIT_DEPTH = 1.2;

/**
 * The outline of a set of hole tiles: every tile side that borders a
 * non-hole tile (pure logic, tested).
 * @param {number[][]} holes hole tiles as [x, z]
 * @returns {number[][][]} sides as [[x1, z1], [x2, z2]] on the floor
 */
export function holeSides(holes) {
  const isHole = new Set(holes.map(([x, z]) => `${x},${z}`));
  const sides = [];
  for (const [x, z] of holes) {
    if (!isHole.has(`${x - 1},${z}`)) sides.push([[x, z], [x, z + 1]]);
    if (!isHole.has(`${x + 1},${z}`)) sides.push([[x + 1, z], [x + 1, z + 1]]);
    if (!isHole.has(`${x},${z - 1}`)) sides.push([[x, z], [x + 1, z]]);
    if (!isHole.has(`${x},${z + 1}`)) sides.push([[x, z + 1], [x + 1, z + 1]]);
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
  const pit = new BufferGeometry();
  pit.setAttribute('position', new Float32BufferAttribute(positions, 3));
  pit.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const pitMaterial = new MeshBasicMaterial({
    vertexColors: true,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  group.add(new Mesh(pit, pitMaterial));

  // Bright rim along the floor edge of the hole.
  const rimAt = (y) => flattenSegments(sides.map(([[x1, z1], [x2, z2]]) => [[x1, y, z1], [x2, y, z2]]));
  const rim = new LineSegmentsGeometry();
  rim.setPositions(rimAt(0));
  const rimLines = new LineSegments2(rim, lineMaterial({ color, width: 2.5, brightness: 1.6 }));
  rimLines.renderOrder = 2;
  group.add(rimLines);

  // Fainter copies of the rim further down, and vertical lines at the rim
  // corners fading to black: the eye reads them as depth.
  for (const [depth, brightness] of [[0.3, 0.35], [0.6, 0.15]]) {
    const ring = new LineSegmentsGeometry();
    ring.setPositions(rimAt(-depth));
    group.add(new LineSegments2(ring, lineMaterial({ color, width: 1.5, brightness })));
  }
  const corners = new Map();
  for (const side of sides) for (const [x, z] of side) corners.set(`${x},${z}`, [x, z]);
  const glow = new Color(color).multiplyScalar(0.6);
  const drops = new LineSegmentsGeometry();
  drops.setPositions(flattenSegments([...corners.values()].map(([x, z]) => [[x, 0, z], [x, -PIT_DEPTH, z]])));
  drops.setColors([...corners.values()].flatMap(() => [glow.r, glow.g, glow.b, 0, 0, 0]));
  const dropMaterial = lineMaterial({ color: 0xffffff, width: 1.5 });
  dropMaterial.vertexColors = true;
  group.add(new LineSegments2(drops, dropMaterial));

  return group;
}
