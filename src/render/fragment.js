/**
 * Key fragment look (D101): a thin gold tile carrying the
 * boot key, the 8×8 code the 64 fragments make up (world/boot-key.js),
 * dim, with its own module lit: filled for a dark module, a bright outline
 * for a light one, as a data disk lights its bit. It hovers and spins like
 * a disk (diskMotion()); a fragment already found is a gray ghost. Gold
 * (FRAGMENT_COLOR) is the color of fragments and access: the core's
 * crystal, the key in the HUD and the bands on the wizard's hat.
 *
 * Showcase: `?asset=fragment`.
 */
import { AdditiveBlending, BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { FRAGMENT_COLOR } from '../entities/pickup.js';
import { BOOT_KEY_SIZE, keyModule } from '../world/boot-key.js';
import { DISK } from './disk.js';
import { blockEdges } from './edges.js';
import { PALETTE, faceMaterial, lineMaterial, neonLines } from './neon.js';

/** Sizes in units. */
export const FRAGMENT = {
  /** Edge of the square tile, its thickness, the margin round the code. */
  size: 0.56,
  thickness: 0.05,
  margin: 0.06,
  /** Share of a module cell its square fills. */
  fill: 0.78,
  /** Line width and glow; share of its color in the faces; the dim modules' and the lit one's brightness. */
  width: 2.2,
  brightness: 1.8,
  tint: 0.18,
  dim: 0.3,
  lit: 2.6,
};

/**
 * Where the modules sit on the tile's face (pure): the square of each one,
 * centered on the tile, as [x0, y0, x1, y1] (y up, row 0 at the top).
 * @param {number} col
 * @param {number} row
 */
export function moduleSquare(col, row) {
  const { size, margin, fill } = FRAGMENT;
  const cell = (size - 2 * margin) / BOOT_KEY_SIZE;
  const inset = (cell * (1 - fill)) / 2;
  const x0 = -size / 2 + margin + col * cell + inset;
  const y1 = size / 2 - margin - row * cell - inset;
  const side = cell * fill;
  return [x0, y1 - side, x0 + side, y1];
}

/** Two triangles of a square on the face at depth z. */
const squareTriangles = ([x0, y0, x1, y1], z) => [x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z];

/**
 * The fragment's model, its middle at the disk's hover height; pose it like
 * a disk with poseDisk(diskMotion()).
 * @param {object} [options]
 * @param {number} [options.slot] which fragment, 0–63: the module lit
 * @param {boolean} [options.ghost] a fragment already found
 */
export function createFragment({ slot = 0, ghost = false } = {}) {
  const color = new Color(ghost ? DISK.ghost.color : FRAGMENT_COLOR);
  const { size, thickness } = FRAGMENT;
  const faces = faceMaterial(new Color(PALETTE.face).lerp(color, ghost ? 0.05 : FRAGMENT.tint));
  const tile = new Mesh(new BoxGeometry(size, size, thickness), faces);
  const edges = neonLines(
    blockEdges([[0, 0, 0]]).map((segment) => segment.map(([x, y, z]) => [(x - 0.5) * size, (y - 0.5) * size, (z - 0.5) * thickness])),
    lineMaterial({ color, width: FRAGMENT.width, brightness: ghost ? DISK.ghost.brightness : FRAGMENT.brightness }),
  );
  edges.renderOrder = 2;

  // The key on both faces: every dark module dim, its own lit.
  const dim = [];
  const lit = [];
  const outline = [];
  for (const z of [thickness / 2 + 0.003, -thickness / 2 - 0.003]) {
    for (let n = 0; n < BOOT_KEY_SIZE * BOOT_KEY_SIZE; n++) {
      const { col, row, dark } = keyModule(n);
      const square = moduleSquare(col, row);
      if (n === slot) {
        if (dark) lit.push(...squareTriangles(square, z));
        else {
          const [x0, y0, x1, y1] = square;
          outline.push([[x0, y0, z], [x1, y0, z]], [[x1, y0, z], [x1, y1, z]], [[x1, y1, z], [x0, y1, z]], [[x0, y1, z], [x0, y0, z]]);
        }
      } else if (dark) dim.push(...squareTriangles(square, z));
    }
  }
  const mesh = (positions, brightness, additive) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new MeshBasicMaterial({ color: color.clone().multiplyScalar(brightness), side: DoubleSide, ...(additive && { blending: AdditiveBlending, transparent: true, depthWrite: false }) });
    return new Mesh(geometry, material);
  };
  const shard = new Group().add(tile, edges, mesh(dim, ghost ? 0.15 : FRAGMENT.dim, true));
  // A found one keeps its place in the key, but nothing lights.
  const litBrightness = ghost ? DISK.ghost.brightness : FRAGMENT.lit;
  if (lit.length > 0) shard.add(mesh(lit, litBrightness, false));
  if (outline.length > 0) shard.add(neonLines(outline, lineMaterial({ color, width: 1.6, brightness: litBrightness })));

  const spin = new Group().add(shard);
  spin.position.y = DISK.hover;
  const model = new Group().add(spin);
  model.userData = { spin, color: ghost ? DISK.ghost.color : FRAGMENT_COLOR, bitColor: ghost ? DISK.ghost.color : FRAGMENT_COLOR };
  return model;
}
