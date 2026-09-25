/**
 * Static room geometry: blocks and the two back walls.
 *
 * Blocks are one instanced mesh of dark cubes (the occluding faces) plus one
 * merged set of neon edges from blockEdges(). Only the back walls (x = 0 and
 * z = 0) are drawn; the front sides stay open (CLAUDE.md §4).
 */
import {
  BoxGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
} from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { blockEdges, flattenSegments } from './edges.js';
import { PALETTE, faceMaterial, lineMaterial } from './neon.js';

/**
 * @param {object} room
 * @param {number[]} room.size [x, y, z]
 * @param {number[][]} room.cells filled block cells as [x, y, z]
 * @param {number} [room.color] palette color of the room
 */
export function createRoomView({ size, cells, color = PALETTE.amber }) {
  const group = new Group();
  group.add(createWalls(size, color));
  if (cells.length > 0) group.add(createBlocks(cells, color));
  return group;
}

function createBlocks(cells, color) {
  const group = new Group();

  const faces = new InstancedMesh(new BoxGeometry(1, 1, 1), faceMaterial(), cells.length);
  const matrix = new Matrix4();
  cells.forEach(([x, y, z], i) => {
    faces.setMatrixAt(i, matrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5));
  });
  group.add(faces);

  const edges = lines(blockEdges(cells), lineMaterial({ color, width: 2.5, brightness: 1.6 }));
  edges.renderOrder = 2; // drawn over wall lines lying in the same spot
  group.add(edges);
  return group;
}

function createWalls([w, h, d], color) {
  const group = new Group();

  // Dark wall faces; they also hide the floor grid behind the room.
  const material = faceMaterial();
  material.side = DoubleSide;
  const wallX = new Mesh(new PlaneGeometry(d, h), material); // x = 0 plane
  wallX.rotation.y = Math.PI / 2;
  wallX.position.set(0, h / 2, d / 2);
  const wallZ = new Mesh(new PlaneGeometry(w, h), material); // z = 0 plane
  wallZ.position.set(w / 2, h / 2, 0);
  group.add(wallX, wallZ);

  // Faint grid on the walls.
  const grid = [];
  for (let z = 1; z < d; z++) grid.push([[0, 0, z], [0, h, z]]);
  for (let x = 1; x < w; x++) grid.push([[x, 0, 0], [x, h, 0]]);
  for (let y = 1; y < h; y++) {
    grid.push([[0, y, 0], [0, y, d]]);
    grid.push([[0, y, 0], [w, y, 0]]);
  }
  group.add(lines(grid, lineMaterial({ color, width: 1.5, brightness: 0.3 })));

  // Bright outline: wall tops, corners and the open front edges of the floor.
  const outline = [
    [[0, 0, 0], [0, h, 0]],
    [[0, h, 0], [0, h, d]],
    [[0, h, 0], [w, h, 0]],
    [[0, 0, d], [0, h, d]],
    [[w, 0, 0], [w, h, 0]],
    [[0, 0, d], [w, 0, d]],
    [[w, 0, 0], [w, 0, d]],
  ];
  const edges = lines(outline, lineMaterial({ color, width: 2.5, brightness: 1.2 }));
  edges.renderOrder = 1;
  group.add(edges);
  return group;
}

/** Thick neon lines from segments. */
function lines(segments, material) {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(flattenSegments(segments));
  return new LineSegments2(geometry, material);
}
