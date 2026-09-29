/**
 * Secret look (Phase 3 step 15, D100), in the gold of the HUD score it
 * raises (D94), hovering and spinning like a data disk (diskMotion()); a
 * secret already found is a gray ghost like a found disk. Three variants
 * are up for review (`?asset=secrets-row`); the one chosen stays:
 * - `egg`: an Easter egg, a hidden secret in software, a wireframe egg
 *   with a bright zigzag band round its middle;
 * - `question`: a chunky pixel "?" of voxels;
 * - `star`: a thick five-pointed star.
 * The octahedron of the first draft read as an energy refill.
 */
import { BoxGeometry, Color, ExtrudeGeometry, Group, LatheGeometry, Mesh, Shape, Vector2 } from 'three';
import { SCORE_COLOR } from '../entities/pickup.js';
import { DISK } from './disk.js';
import { blockEdges } from './edges.js';
import { PALETTE, faceMaterial, lineMaterial, neonLines } from './neon.js';

/** The variants, the game's own first. */
export const SECRET_VARIANTS = ['egg', 'question', 'star'];

/** Sizes in units. */
export const SECRET = {
  /** The egg: half its height, its widest radius, how much narrower the top is, its rings and meridians. */
  egg: { height: 0.26, radius: 0.19, taper: 0.18, rings: 4, meridians: 6, band: { teeth: 8, depth: 0.05 } },
  /** The "?": the edge of one voxel. */
  voxel: 0.075,
  /** The star: outer and inner radius, thickness. */
  star: { outer: 0.28, inner: 0.12, thickness: 0.1 },
  width: 2.4,
  brightness: 1.8,
  bandBrightness: 2.8,
  tint: 0.2,
};

/** The "?" in voxels, bottom row first (x right, y up). */
const QUESTION = ['..#..', '.....', '..#..', '..##.', '....#', '#...#', '.###.'];

/** Radius of the egg at height t (-1 bottom, 1 top). */
function eggRadius(t) {
  const { radius, taper } = SECRET.egg;
  return radius * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - taper * t);
}

/** The Easter egg: faces, latitude rings, meridians and the zigzag band. */
function eggParts(faces, lines, band) {
  const { height, rings, meridians, band: zig } = SECRET.egg;
  const steps = 24;
  const profile = [];
  for (let i = 0; i <= steps; i++) {
    const t = -1 + (2 * i) / steps;
    profile.push(new Vector2(eggRadius(t), t * height));
  }
  const segments = [];
  const around = 32;
  const ring = (t, r = eggRadius(t)) => {
    for (let i = 0; i < around; i++) {
      const a = (i / around) * Math.PI * 2;
      const b = ((i + 1) / around) * Math.PI * 2;
      segments.push([[Math.cos(a) * r, t * height, Math.sin(a) * r], [Math.cos(b) * r, t * height, Math.sin(b) * r]]);
    }
  };
  for (let i = 1; i <= rings; i++) {
    const t = -1 + (2 * i) / (rings + 1);
    if (Math.abs(t) > 0.2) ring(t); // the band takes the middle
  }
  for (let m = 0; m < meridians; m++) {
    const a = (m / meridians) * Math.PI * 2;
    for (let i = 0; i < steps; i++) {
      const [p, q] = [profile[i], profile[i + 1]];
      segments.push([[Math.cos(a) * p.x, p.y, Math.sin(a) * p.x], [Math.cos(a) * q.x, q.y, Math.sin(a) * q.x]]);
    }
  }
  // The band: a zigzag round the middle, standing a little proud of the shell.
  const zigzag = [];
  const points = zig.teeth * 2;
  for (let i = 0; i < points; i++) {
    const at = (k) => {
      const a = (k / points) * Math.PI * 2;
      const t = (k % 2 === 0 ? 1 : -1) * (zig.depth / height);
      const r = eggRadius(t) * 1.03;
      return [Math.cos(a) * r, t * height, Math.sin(a) * r];
    };
    zigzag.push([at(i), at(i + 1)]);
  }
  const shell = neonLines(segments, lines);
  const stripe = neonLines(zigzag, band);
  shell.renderOrder = 2;
  stripe.renderOrder = 2;
  return [new Mesh(new LatheGeometry(profile, around), faces), shell, stripe];
}

/** The pixel "?": voxels with their outline, centered. */
function questionParts(faces, lines) {
  const cells = [];
  QUESTION.forEach((row, y) => [...row].forEach((c, x) => c === '#' && cells.push([x, y, 0])));
  const shape = new Group();
  const box = new BoxGeometry(1, 1, 1);
  for (const [x, y, z] of cells) {
    const voxel = new Mesh(box, faces);
    voxel.position.set(x + 0.5, y + 0.5, z + 0.5);
    shape.add(voxel);
  }
  const outline = neonLines(blockEdges(cells), lines);
  outline.renderOrder = 2;
  shape.add(outline);
  shape.scale.setScalar(SECRET.voxel);
  shape.position.set(-2.5 * SECRET.voxel, -3.5 * SECRET.voxel, -0.5 * SECRET.voxel);
  return [shape];
}

/** The star: an extruded five-pointed outline and its edges. */
function starParts(faces, lines) {
  const { outer, inner, thickness } = SECRET.star;
  const outline = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    outline.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const geometry = new ExtrudeGeometry(new Shape(outline.map(([x, y]) => new Vector2(x, y))), { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  const front = thickness / 2;
  const back = -thickness / 2;
  const next = (i) => outline[(i + 1) % outline.length];
  const segments = [
    ...outline.map((p, i) => [[...p, front], [...next(i), front]]),
    ...outline.map((p, i) => [[...p, back], [...next(i), back]]),
    ...outline.map((p) => [[...p, front], [...p, back]]),
  ];
  const edges = neonLines(segments, lines);
  edges.renderOrder = 2;
  return [new Mesh(geometry, faces), edges];
}

const PARTS = { egg: eggParts, question: questionParts, star: starParts };

/**
 * The secret's model, its middle at the disk's hover height; pose it like a
 * disk with poseDisk(diskMotion()).
 * @param {object} [options]
 * @param {'egg'|'question'|'star'} [options.variant]
 * @param {boolean} [options.ghost] a secret already found
 */
export function createSecret({ variant = SECRET_VARIANTS[0], ghost = false } = {}) {
  const color = ghost ? DISK.ghost.color : SCORE_COLOR;
  const glow = ghost ? DISK.ghost.brightness : SECRET.brightness;
  const faces = faceMaterial(new Color(PALETTE.face).lerp(new Color(color), ghost ? 0.05 : SECRET.tint));
  const lines = lineMaterial({ color, width: SECRET.width, brightness: glow });
  const band = lineMaterial({ color, width: SECRET.width, brightness: ghost ? glow : SECRET.bandBrightness });
  const spin = new Group().add(...PARTS[variant](faces, lines, band));
  spin.position.y = DISK.hover;
  const model = new Group().add(spin);
  model.userData = { spin, color, bitColor: color };
  return model;
}
