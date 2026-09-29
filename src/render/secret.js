/**
 * Secret look (D100): a thick five-pointed star in the
 * wizard's magenta (SECRET_COLOR, D98), hovering and spinning like a data
 * disk (diskMotion()); a secret already found is a gray ghost like a found
 * disk.
 *
 * Showcase: `?asset=secret`.
 */
import { Color, ExtrudeGeometry, Group, Mesh, Shape, Vector2 } from 'three';
import { SECRET_COLOR } from '../entities/pickup.js';
import { DISK } from './disk.js';
import { PALETTE, faceMaterial, lineMaterial, neonLines } from './neon.js';

/** Sizes in units. */
export const SECRET = {
  /** The star's outer and inner radius and its thickness. */
  outer: 0.28,
  inner: 0.12,
  thickness: 0.1,
  /** Line width and glow; share of its color in the faces. */
  width: 2.4,
  brightness: 1.8,
  tint: 0.2,
};

/**
 * The secret's model, its middle at the disk's hover height; pose it like a
 * disk with poseDisk(diskMotion()).
 * @param {object} [options]
 * @param {boolean} [options.ghost] a secret already found
 */
export function createSecret({ ghost = false } = {}) {
  const color = ghost ? DISK.ghost.color : SECRET_COLOR;
  const { outer, inner, thickness } = SECRET;
  const outline = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    outline.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const geometry = new ExtrudeGeometry(new Shape(outline.map(([x, y]) => new Vector2(x, y))), { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  const faces = faceMaterial(new Color(PALETTE.face).lerp(new Color(color), ghost ? 0.05 : SECRET.tint));

  // Edges: the outline on both faces and the edges between them.
  const [front, back] = [thickness / 2, -thickness / 2];
  const next = (i) => outline[(i + 1) % outline.length];
  const segments = [
    ...outline.map((p, i) => [[...p, front], [...next(i), front]]),
    ...outline.map((p, i) => [[...p, back], [...next(i), back]]),
    ...outline.map((p) => [[...p, front], [...p, back]]),
  ];
  const edges = neonLines(segments, lineMaterial({ color, width: SECRET.width, brightness: ghost ? DISK.ghost.brightness : SECRET.brightness }));
  edges.renderOrder = 2;

  const spin = new Group().add(new Mesh(geometry, faces), edges);
  spin.position.y = DISK.hover;
  const model = new Group().add(spin);
  model.userData = { spin, color, bitColor: color };
  return model;
}
