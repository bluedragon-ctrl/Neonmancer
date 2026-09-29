/**
 * Key fragment look (Phase 3 step 16, D101): a gold crystal shard, broken
 * off at the top, hovering and spinning like a data disk (diskMotion()); a
 * fragment already found is a gray ghost like a found disk. Gold
 * (FRAGMENT_COLOR) is the color of fragments and access levels: the core's
 * crystal, the access lock's digit and the bands on the wizard's hat.
 *
 * Reviewed in the asset showcase (`?asset=fragment`).
 */
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { FRAGMENT_COLOR } from '../entities/pickup.js';
import { DISK } from './disk.js';
import { PALETTE, faceMaterial, lineMaterial, neonLines } from './neon.js';

/** Sizes in units. */
export const FRAGMENT = {
  /** Radius round the middle; the tip below; the broken top, a slanted cut (heights of its low and high side). */
  r: 0.14,
  down: 0.24,
  top: [0.14, 0.3],
  /** Tilt of the shard, radians. */
  tilt: 0.25,
  /** Line width and glow; share of its color in the faces; glow of the inner light. */
  width: 2.4,
  brightness: 1.8,
  tint: 0.25,
  glow: 0.35,
};

/**
 * The shard's corners (pure): five round its middle, each with a top
 * corner on the slanted break, and the tip below.
 * @returns {{ middle: number[][], top: number[][], tip: number[] }}
 */
export function shardCorners() {
  const { r, down, top } = FRAGMENT;
  const middle = [];
  const upper = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    middle.push([x, 0, z]);
    // The break slants across: high on one side, low on the other; narrower than the middle.
    const h = top[0] + ((top[1] - top[0]) * (1 + Math.cos(a))) / 2;
    upper.push([x * 0.7, h, z * 0.7]);
  }
  return { middle, top: upper, tip: [0, -down, 0] };
}

/**
 * The fragment's model, its middle at the disk's hover height; pose it like
 * a disk with poseDisk(diskMotion()).
 * @param {object} [options]
 * @param {boolean} [options.ghost] a fragment already found
 */
export function createFragment({ ghost = false } = {}) {
  const color = ghost ? DISK.ghost.color : FRAGMENT_COLOR;
  const { middle, top, tip } = shardCorners();
  const next = (i) => (i + 1) % 5;
  const segments = [
    ...middle.map((p, i) => [p, middle[next(i)]]),
    ...top.map((p, i) => [p, top[next(i)]]),
    ...middle.map((p, i) => [p, top[i]]),
    ...middle.map((p) => [p, tip]),
  ];
  // Faces: the sides up to the break, the break itself, the facets down to the tip.
  const triangles = [];
  for (let i = 0; i < 5; i++) {
    triangles.push(middle[i], middle[next(i)], top[next(i)], middle[i], top[next(i)], top[i]);
    triangles.push(middle[i], tip, middle[next(i)]);
  }
  for (let i = 1; i < 4; i++) triangles.push(top[0], top[i], top[i + 1]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(triangles.flat(), 3));
  const faces = faceMaterial(new Color(PALETTE.face).lerp(new Color(color), ghost ? 0.05 : FRAGMENT.tint));
  faces.side = DoubleSide;
  const edges = neonLines(segments, lineMaterial({ color, width: FRAGMENT.width, brightness: ghost ? DISK.ghost.brightness : FRAGMENT.brightness }));
  edges.renderOrder = 2;
  const shard = new Group().add(new Mesh(geometry, faces), edges);
  // A soft inner light (not on a ghost).
  if (!ghost) {
    const glow = new Mesh(geometry, new MeshBasicMaterial({ color, transparent: true, opacity: FRAGMENT.glow, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    glow.scale.setScalar(0.6);
    shard.add(glow);
  }
  shard.rotation.z = FRAGMENT.tilt;

  const spin = new Group().add(shard);
  spin.position.y = DISK.hover;
  const model = new Group().add(spin);
  model.userData = { spin, color, bitColor: color };
  return model;
}
