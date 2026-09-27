/**
 * Static room geometry: blocks and the two back walls.
 *
 * Each static block type (D60) is drawn in its look. Plain blocks, of
 * every plain type together, are one instanced mesh of dark cubes (the
 * occluding faces) plus neon edges worked out for them as one mass, so
 * neighbours never get an edge between them, whatever their type; each
 * edge takes the color of a type around it (D64). The hazard and void
 * looks are animated (block-fx.js) and outline themselves; a line they
 * share with plain blocks (or a lethal type with a hurting one) is drawn
 * once, by the more dangerous look, so the seam is theirs alone. Only
 * the back walls (x = 0 and z = 0) are drawn; the front sides stay open
 * (CLAUDE.md §4). Exits are doorways in the back walls and gaps in the
 * front edges (render/walls.js).
 */
import { BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh } from 'three';
import { createActiveBlockView } from './block-fx.js';
import { blockEdges, edgeUnitKeys, groupedBlockEdges } from './edges.js';
import { BITS, markSegments } from './marks.js';
import { doorwayTunnels, wallLayout } from './walls.js';
import {
  PALETTE,
  fadingLines,
  faceMaterial,
  lineMaterial,
  neonLines,
  roomLook,
  shadedFaces,
  shared,
  tintedFaceMaterials,
} from './neon.js';

/** Unit cube with its corner at the origin, shared by every block and object view. */
const UNIT_BOX = shared(new BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5));

/**
 * @param {object} room
 * @param {number[]} room.size [x, y, z]
 * @param {Record<string, number[][]>} room.blocks static block cells as [x, y, z], by block type
 * @param {Record<string, { look: string, color?: string }>} room.blockTypes block types (resolved), by id
 * @param {object[]} [room.exits] exits (defaults applied): doorways in the back walls, gaps in the front edges
 * @param {number|string} [room.color] room color (biome), amber by default
 * @param {object} [room.look] biome look (neon.js roomLook()); the walls use its wall grid brightness
 * @returns {Group} with `userData.flares`: "x,y,z" of each hazard-look
 *   block → its face material (for flareHazard())
 */
export function createRoomView({ size, blocks, blockTypes, exits = [], color = PALETTE.amber, look = {} }) {
  const group = new Group();
  group.add(createWalls(size, exits, color, roomLook(look).wallGrid));
  group.userData.flares = new Map();
  const types = Object.values(blockTypes).filter((type) => blocks[type.id]?.length > 0);
  // A line two looks would both draw is drawn once, by the more dangerous
  // one (D64): lethal types first, then those that hurt; each leaves out
  // the lines already claimed, and plain blocks come last.
  const danger = (type) => (type.lethal ? 2 : type.damage ? 1 : 0);
  const active = types.filter((type) => type.look !== 'plain').sort((a, b) => danger(b) - danger(a));
  const claimed = new Set();
  for (const type of active) {
    const cells = blocks[type.id];
    const view = createActiveBlockView(cells, type.look, type.color ?? color, claimed);
    if (type.look === 'hazard') for (const cell of cells) group.userData.flares.set(cell.join(), view.userData.faces);
    group.add(view);
    for (const key of edgeUnitKeys(cells)) claimed.add(key);
  }
  // In defs.json order: where plain types meet, the later one's color wins the edge.
  const plain = types.filter((type) => type.look === 'plain');
  if (plain.length > 0) group.add(createBlockView(plain.map((type) => ({ cells: blocks[type.id], color: type.color ?? color })), claimed));
  return group;
}

/**
 * Dark occluding cubes with neon edges, for plain blocks of one or more
 * types drawn as one mass (edges.js groupedBlockEdges()).
 * @param {{ cells: number[][], color: number|string }[]} groups cells and edge color of each type, lowest rank first
 * @param {Set<string>} [claimed] unit edges drawn by an animated look, left out (edges.js)
 */
export function createBlockView(groups, claimed = new Set()) {
  const group = new Group();
  const cells = groups.flatMap((g) => g.cells);

  const faces = new InstancedMesh(UNIT_BOX, faceMaterial(), cells.length);
  const matrix = new Matrix4();
  cells.forEach(([x, y, z], i) => faces.setMatrixAt(i, matrix.makeTranslation(x, y, z)));
  group.add(faces);

  groupedBlockEdges(groups.map((g) => g.cells), claimed).forEach((segments, i) => {
    if (segments.length === 0) return;
    const edges = neonLines(segments, lineMaterial({ color: groups[i].color, width: 2.5, brightness: 1.6 }));
    edges.renderOrder = 2; // drawn over wall lines lying in the same spot
    group.add(edges);
  });
  return group;
}

function createWalls(size, exits, color, gridBrightness) {
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
  group.add(neonLines(grid, lineMaterial({ color, width: 1.5, brightness: gridBrightness })));
  const edges = neonLines(outline, lineMaterial({ color, width: 2.5, brightness: 1.2 }));
  edges.renderOrder = 1;
  group.add(edges);

  // Doorways lead into darkness: dark tunnel faces fading to black, and
  // short corner lines fading into them (like the pits of holes).
  const tunnels = doorwayTunnels(size, exits);
  if (tunnels.quads.length > 0) group.add(createTunnels(tunnels, color));

  return group;
}

/**
 * @param {ReturnType<typeof doorwayTunnels>} tunnels
 * @param {number|string} color room color
 */
function createTunnels({ quads, lines: corners }, color) {
  const near = new Color(PALETTE.void);
  const far = new Color(0x000000);
  const positions = [];
  const colors = [];
  const shade = new Color();
  for (const { points, shade: amounts } of quads) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(...points[i]);
      shade.copy(near).lerp(far, amounts[i]);
      colors.push(shade.r, shade.g, shade.b);
    }
  }
  return new Group().add(shadedFaces(positions, colors), fadingLines(corners, { color, width: 1.5, brightness: 0.6 }));
}

/** Outline width by object kind, where it differs: collapsing blocks look fragile. */
const EDGE_WIDTH = { collapsing: 1.5 };

/**
 * View of one typed object: a single cell drawn in the object's style
 * (edges, face mark, faces), so types differ by more than color. Kept
 * separate from the static blocks because objects move (D40). A
 * destructible object (with `integrity`) shows its data bits with some
 * missing instead of its mark.
 * @param {{ at: number[], kind?: string, color: string, edges: string, mark: string, faces: string, tint: number, integrity?: number }} object
 */
export function createObjectView({ at, kind, color, edges, mark, faces, tint, integrity }) {
  const group = new Group();

  const materials = faces === 'tinted' ? tintedFaceMaterials(color, tint) : faceMaterial();
  const box = new Mesh(UNIT_BOX, materials);
  box.position.set(...at);
  group.add(box);

  const dashed = edges === 'dashed';
  const outline = neonLines(blockEdges([at]), lineMaterial({ color, width: EDGE_WIDTH[kind] ?? 2.5, brightness: 1.6, dashed }));
  outline.renderOrder = 2;
  group.add(outline);

  // A destructible object shows its data bits with some missing, whatever its mark.
  const drawn = integrity !== undefined ? 'bitsBroken' : mark;
  if (drawn !== 'none') {
    const bits = drawn === 'bits' || drawn === 'bitsBroken';
    const style = bits
      ? { color: new Color(color).lerp(new Color(0xffffff), BITS.whiten), width: BITS.width, brightness: BITS.brightness }
      : { color, width: 1.5, brightness: 1 };
    const marks = neonLines(markSegments(drawn, at), lineMaterial(style));
    marks.renderOrder = 2;
    group.add(marks);
  }
  return group;
}
