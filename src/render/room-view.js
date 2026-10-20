/**
 * Static room geometry: blocks and the two back walls.
 *
 * Each static block type (D60) is drawn in its look. Plain blocks, of
 * every plain type together, are one instanced mesh of dark cubes (the
 * occluding faces) plus neon edges worked out for them as one mass, so
 * neighbours never get an edge between them, whatever their type; each
 * edge takes the color of a type around it (D64). Fences
 * (D167, fence-view.js) have no faces and draw their own lines, outside the
 * mass: blocks next to them keep their outline; so do stairs and slabs
 * (D221, stair-view.js), which fill only part of their cell. Only
 * the back walls (x = 0 and z = 0) are drawn; the front sides stay open
 * (CLAUDE.md §4). Exits are doorways in the back walls and gaps in the
 * front edges (render/walls.js); a biome may set glass panels into the
 * back walls, windows onto the grid outside (D179).
 */
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh } from 'three';
import { STREAM_STYLE, createFenceView } from './fence-view.js';
import { createSlabView, createStairView } from './stair-view.js';
import { createPanelGlow } from './panel-glow.js';
import { UNIT_BOX } from './geometry.js';
import { blockEdges, groupedBlockEdges } from './edges.js';
import { BITS, markSegments } from './marks.js';
import { GLASS, glassBox, glassBoxes, shrinkSegments } from './glass.js';
import { spikeSegments, spikeTriangles } from './spikes.js';
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

/**
 * @param {object} room
 * @param {number[]} room.size [x, y, z]
 * @param {Record<string, number[][]>} room.blocks static block cells as [x, y, z], by block type
 * @param {Record<string, { look: string, color?: string }>} room.blockTypes block types (resolved), by id
 * @param {object[]} [room.exits] exits (defaults applied): doorways in the back walls, gaps in the front edges
 * @param {number|string} [room.color] room color (biome), amber by default
 * @param {object} [room.look] biome look (neon.js roomLook()); the walls use its wall grid brightness
 * @param {{ side: string, u: number, v: number }[]} [room.panels] glass panels in the back walls (walls.js pickPanels())
 * @returns {Group} with `userData.update(dt)` running the glass panels' glow
 */
export function createRoomView({ size, blocks, blockTypes, exits = [], color = PALETTE.amber, look = {}, panels = [] }) {
  const group = new Group();
  const walls = createWalls(size, exits, color, roomLook(look).wallGrid, panels);
  group.add(walls);
  group.userData.update = (dt) => walls.userData.glow?.userData.update(dt);
  const types = Object.values(blockTypes).filter((type) => blocks[type.id]?.length > 0);
  // In defs.json order: where plain types meet, the later one's color wins the edge.
  const plain = types.filter((type) => type.look === 'plain');
  if (plain.length > 0) group.add(createBlockView(plain.map((type) => ({ cells: blocks[type.id], color: type.color ?? color }))));
  // Stairs and slabs (D221) draw themselves.
  for (const type of types) {
    if (type.look === 'stair') group.add(createStairView(blocks[type.id], type.rise, type.color ?? color));
    if (type.look === 'slab') group.add(createSlabView(blocks[type.id], type.color ?? color));
  }
  // Fences (D167): a run ending at another block or a back wall needs no post.
  const fences = types.filter((type) => type.look === 'fence');
  if (fences.length > 0) {
    const others = new Set(types.filter((type) => type.look !== 'fence').flatMap((type) => blocks[type.id].map((cell) => cell.join())));
    const solid = (x, y, z) => x < 0 || z < 0 || others.has(`${x},${y},${z}`);
    for (const type of fences) group.add(createFenceView(blocks[type.id], type.color ?? color, solid, type.passes ? STREAM_STYLE : undefined));
  }
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

function createWalls(size, exits, color, gridBrightness, panels) {
  const group = new Group();
  const { faces, grid, outline, frames, glass } = wallLayout(size, exits, panels);

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

  // Glass panels (D179): see-through, so the grid outside shows, in a
  // frame, glowing softly and flickering now and then (D181).
  if (glass.length > 0) {
    group.add(glassBoxes(glass, color, GLASS.panel));
    group.userData.glow = createPanelGlow(panels, color);
    group.add(group.userData.glow);
    const frame = neonLines(frames, lineMaterial({ color, width: 2, brightness: 0.9 }));
    frame.renderOrder = 1;
    group.add(frame);
  }

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

/** The spiked shape (D82) at the origin, shared by every spiked object view. */
const SPIKED_BODY = shared(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(spikeTriangles(), 3)));
SPIKED_BODY.computeVertexNormals();

/** Outline width of a spiked shape: its ridges are short, so thinner than a cube's edges. */
const SPIKED_EDGE_WIDTH = 2;
/** How much brighter a spiked shape's outline gets at the peak of its flare. */
const SPIKED_FLARE = 1.5;
/** Seconds the flare takes to fade after it hurt the wizard. */
const SPIKED_FLARE_TIME = 0.4;

/**
 * The core of a glass object: a small dark cube in the middle of its cell
 * wearing the object's mark, seen through the glass.
 * @param {string} mark
 * @param {number[]} at cell
 * @param {Parameters<typeof lineMaterial>[0]} style mark line style
 */
function glassCore(mark, at, style) {
  const size = GLASS.coreSize;
  const core = new Mesh(UNIT_BOX, faceMaterial());
  core.scale.setScalar(size);
  core.position.set(...at.map((v) => v + (1 - size) / 2));
  const marks = neonLines(shrinkSegments(markSegments(mark, at), at, size), lineMaterial(style));
  marks.renderOrder = 2;
  return new Group().add(core, marks);
}

/** Outline width by object kind, where it differs: step gates (collapsing blocks) look fragile. */
const EDGE_WIDTH = { gate: 1.5 };

/**
 * View of one typed object: a single cell drawn in the object's style
 * (edges, face mark, faces), so types differ by more than color. Kept
 * separate from the static blocks because objects move (D40). A
 * destructible object (with `integrity`) shows its data bits with some
 * missing instead of its mark. A spiked shape (D82, spikes.js) has dark
 * faces, its own outline and no mark; its outline brightens when it hurts
 * the wizard: `userData.flare(since)` sets the flare for `since` seconds
 * after it hurt him. Glass faces (D96, glass.js) are see-through, with the
 * mark on a small dark core inside; a destructible glass object is an
 * empty shell of thinner glass (D99).
 * @param {{ at: number[], kind?: string, color: string, edges: string, mark: string, faces: string, shape?: string, tint: number, integrity?: number }} object
 */
export function createObjectView({ at, kind, color, edges, mark, faces, shape = 'cube', tint, integrity }) {
  const group = new Group();
  const spiked = shape === 'spiked';
  const geometry = spiked ? SPIKED_BODY : UNIT_BOX;

  if (faces === 'glass' && !spiked) {
    // See-through (D96, glass.js): drawn after everything opaque.
    group.add(glassBox(at, at.map((v) => v + 1), color, integrity !== undefined ? GLASS.hollow : {}));
  } else {
    const materials = faces === 'tinted' && !spiked ? tintedFaceMaterials(color, tint) : faceMaterial();
    const body = new Mesh(geometry, materials);
    body.position.set(...at);
    group.add(body);
  }

  const dashed = edges === 'dashed';
  const segments = spiked ? spikeSegments(at) : blockEdges([at]);
  const width = spiked ? SPIKED_EDGE_WIDTH : EDGE_WIDTH[kind] ?? 2.5;
  const outline = neonLines(segments, lineMaterial({ color, width, brightness: 1.6, dashed }));
  outline.renderOrder = 2;
  group.add(outline);
  if (spiked) {
    const base = outline.material.color.clone();
    group.userData.flare = (since) => {
      const flare = Math.max(0, 1 - since / SPIKED_FLARE_TIME);
      outline.material.color.copy(base).multiplyScalar(1 + SPIKED_FLARE * flare);
    };
    return group;
  }

  // A destructible object shows its data bits with some missing, whatever its mark.
  const drawn = integrity !== undefined ? 'bitsBroken' : mark;
  if (drawn !== 'none') {
    const bits = drawn === 'bits' || drawn === 'bitsBroken';
    const style = bits
      ? { color: new Color(color).lerp(new Color(0xffffff), BITS.whiten), width: BITS.width, brightness: BITS.brightness }
      : { color, width: 1.5, brightness: 1 };
    if (faces === 'glass') {
      // Behind glass the mark sits on a small dark core inside it; a
      // destructible object is empty (D99).
      if (drawn !== 'bitsBroken') group.add(glassCore(drawn, at, style));
      return group;
    }
    const marks = neonLines(markSegments(drawn, at), lineMaterial(style));
    marks.renderOrder = 2;
    group.add(marks);
  }
  return group;
}
