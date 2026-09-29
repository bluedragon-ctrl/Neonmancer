/**
 * Secret look (Phase 3 step 15, D100): a gold gem, a stretched octahedron
 * in the gold of the HUD score it raises (D94), hovering and spinning
 * like a data disk (diskMotion()). A secret already found is a gray ghost
 * like a found disk.
 *
 * Looks are reviewed in the asset showcase (`?asset=secret`) before they go
 * into the game.
 */
import { Color, Group, Mesh, OctahedronGeometry } from 'three';
import { SCORE_COLOR } from '../entities/pickup.js';
import { DISK } from './disk.js';
import { PALETTE, faceMaterial, lineMaterial, neonLines } from './neon.js';

/** Sizes in units. */
export const GEM = {
  /** Half its width and half its height. */
  radius: 0.2,
  height: 0.3,
  /** Line width and glow; share of its color in the faces. */
  width: 2.4,
  brightness: 1.8,
  tint: 0.2,
};

/** The octahedron's six points (x, y, z) and its twelve edges between them. */
const POINTS = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4], [0, 5], [1, 5], [2, 5], [3, 5]];

/** The gem's faces and neon edges. */
function gemParts(faces, lines) {
  const r = GEM.radius;
  const h = GEM.height;
  const geometry = new OctahedronGeometry(1);
  geometry.scale(r, h, r);
  const point = ([x, y, z]) => [x * r, y * h, z * r];
  const edges = neonLines(EDGES.map(([a, b]) => [point(POINTS[a]), point(POINTS[b])]), lines);
  edges.renderOrder = 2;
  return [new Mesh(geometry, faces), edges];
}

/**
 * The gem model, its middle at the disk's hover height; pose it like a disk
 * with poseDisk(diskMotion()).
 * @param {object} [options]
 * @param {boolean} [options.ghost] a secret already found
 */
export function createGem({ ghost = false } = {}) {
  const color = ghost ? DISK.ghost.color : SCORE_COLOR;
  const glow = ghost ? DISK.ghost.brightness : GEM.brightness;
  const faces = faceMaterial(new Color(PALETTE.face).lerp(new Color(color), ghost ? 0.05 : GEM.tint));
  const spin = new Group().add(...gemParts(faces, lineMaterial({ color, width: GEM.width, brightness: glow })));
  spin.position.y = DISK.hover;
  const model = new Group().add(spin);
  model.userData = { spin, color, bitColor: color };
  return model;
}
