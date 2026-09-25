/**
 * Static room geometry: blocks and the two back walls.
 *
 * Blocks are one instanced mesh of dark cubes (the occluding faces) plus one
 * merged set of neon edges from blockEdges(). Only the back walls (x = 0 and
 * z = 0) are drawn; the front sides stay open (CLAUDE.md §4). Exits are
 * doorways in the back walls and gaps in the front edges (render/walls.js).
 */
import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
} from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { blockEdges, flattenSegments } from './edges.js';
import { markSegments } from './marks.js';
import { frontChevrons, wallLayout } from './walls.js';
import { PALETTE, faceMaterial, lineMaterial, tintedFaceMaterials } from './neon.js';

/**
 * @param {object} room
 * @param {number[]} room.size [x, y, z]
 * @param {number[][]} room.cells filled block cells as [x, y, z]
 * @param {object[]} [room.exits] exits (defaults applied): doorways in the back walls, gaps in the front edges
 * @param {number|string} [room.color] room color (biome), amber by default
 */
export function createRoomView({ size, cells, exits = [], color = PALETTE.amber }) {
  const group = new Group();
  group.add(createWalls(size, exits, color));
  if (cells.length > 0) group.add(createBlockView(cells, color));
  return group;
}

/**
 * Dark occluding cubes with merged neon edges.
 * @param {number[][]} cells [x, y, z] cells
 * @param {number|string} color
 */
export function createBlockView(cells, color) {
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

function createWalls(size, exits, color) {
  const group = new Group();
  const { faces, grid, outline } = wallLayout(size, exits);

  // Dark wall faces (cells, leaving doorways open); they also hide the floor
  // grid behind the room.
  const positions = faces.flatMap(([a, b, c, d]) => [...a, ...b, ...c, ...a, ...c, ...d]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = faceMaterial();
  material.side = DoubleSide;
  group.add(new Mesh(geometry, material));

  // Faint grid on the walls; bright outline: wall tops and ends, doorway
  // frames and the open front edges of the floor.
  group.add(lines(grid, lineMaterial({ color, width: 1.5, brightness: 0.3 })));
  const edges = lines(outline, lineMaterial({ color, width: 2.5, brightness: 1.2 }));
  edges.renderOrder = 1;
  group.add(edges);

  // Exits on the open front sides: arrows on the floor pointing out.
  const chevrons = frontChevrons(size, exits);
  if (chevrons.length > 0) group.add(lines(chevrons, lineMaterial({ color, width: 2.5, brightness: 1 })));
  return group;
}

/** Thick neon lines from segments. */
function lines(segments, material) {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(flattenSegments(segments));
  return new LineSegments2(geometry, material);
}

/**
 * View of one typed object: a single cell drawn in the object's style
 * (edges, face mark, faces), so types differ by more than color. Kept
 * separate from the static blocks because objects move (pushables, step 5).
 * @param {{ at: number[], color: string, edges: string, mark: string, faces: string, tint: number }} object
 */
export function createObjectView({ at, color, edges, mark, faces, tint }) {
  const group = new Group();
  const [x, y, z] = at;

  const materials = faces === 'tinted' ? tintedFaceMaterials(color, tint) : faceMaterial();
  const box = new Mesh(new BoxGeometry(1, 1, 1), materials);
  box.position.set(x + 0.5, y + 0.5, z + 0.5);
  group.add(box);

  const dashed = edges === 'dashed';
  const outline = lines(blockEdges([at]), lineMaterial({ color, width: 2.5, brightness: 1.6, dashed }));
  if (dashed) outline.computeLineDistances();
  outline.renderOrder = 2;
  group.add(outline);

  if (mark !== 'none') {
    const marks = lines(markSegments(mark, at), lineMaterial({ color, width: 1.5, brightness: 1 }));
    marks.renderOrder = 2;
    group.add(marks);
  }
  return group;
}
