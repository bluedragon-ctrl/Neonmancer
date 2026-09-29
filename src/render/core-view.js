/**
 * The central core (D101), a reactor: a gold crystal floating
 * and spinning over a white pedestal (a mechanism, D99) in its 1×2×1 cell,
 * inside orbit rings, one per access level, each turning gold once reached;
 * the crystal glows brighter with the fragments found. A touch that raises
 * the level (or reboots the Grid) flashes it. Showcase `?asset=core`.
 */
import { AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { FRAGMENT_COLOR } from '../entities/pickup.js';
import { faceMaterial, lineMaterial, neonLines } from './neon.js';

/** Tuning (units, seconds). */
export const CORE_FX = {
  /** Pedestal: height, margin from the cell's sides. */
  pedestal: 0.32,
  margin: 0.1,
  /** Line brightness of the white parts; of gold parts not reached yet, and reached. */
  white: 1.4,
  dim: 0.35,
  lit: 2,
  /** Seconds a flash lasts; extra brightness at its start. */
  flash: 1.2,
  boost: 2.5,
  /** The crystal (radius, tip up, tip down), its height, bob and spin; the rings' radius and turning speed. */
  crystal: [0.17, 0.42, 0.3],
  y: 1.12,
  bob: 0.05,
  spin: 0.9,
  ring: 0.44,
  ringSpin: 0.6,
};

const WHITE_FACE = new Color(0x070916);
const UNLIT = new Color(0xffffff);

/** Line segments of a box's 12 edges. */
function boxEdges([x0, y0, z0], [x1, y1, z1]) {
  const c = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const pairs = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  return pairs.map(([a, b]) => [c(a), c(b)]);
}

/** Dark faces of a box. */
function boxFaces([x0, y0, z0], [x1, y1, z1], color = WHITE_FACE) {
  const c = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const positions = quads.flatMap(([a, b, d, e]) => [a, b, d, a, d, e].flatMap((i) => c(i)));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = faceMaterial(color);
  material.side = DoubleSide;
  return new Mesh(geometry, material);
}

/**
 * A circle of segments round the y axis, turned by `tilt` (radians about x).
 * @param {number} r
 * @param {number} [tilt]
 * @param {number} [n]
 */
export function ringSegments(r, tilt = 0, n = 40) {
  const point = (a) => {
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    return [x, -z * Math.sin(tilt), z * Math.cos(tilt)];
  };
  return Array.from({ length: n }, (_, i) => [point((i / n) * 2 * Math.PI), point(((i + 1) / n) * 2 * Math.PI)]);
}

/**
 * How lit each of `levels` level markers is: 1 for those reached (pure).
 * @param {number} level access level reached
 * @param {number} levels access levels the world has
 */
export function levelMarks(level, levels) {
  return Array.from({ length: levels }, (_, i) => (i < level ? 1 : 0));
}

/**
 * The flash of a touch that raised the level, `since` seconds ago: 1 at
 * once, fading to 0 (pure).
 * @param {number} since
 */
export function coreFlash(since) {
  if (!(since >= 0) || since >= CORE_FX.flash) return 0;
  return (1 - since / CORE_FX.flash) ** 2;
}

/** A line material whose color is set every frame. */
function liveLines(segments, width) {
  const material = lineMaterial({ color: 0xffffff, width });
  return { lines: neonLines(segments, material), material };
}

/**
 * The core, its lower corner at the origin, 1×2×1.
 * `userData.set({ level, share })`: the access level and the share of the
 * fragments found (0..1); `userData.flash()` flashes it; `userData.update(dt)`
 * animates it.
 * @param {object} [options]
 * @param {number|string} [options.color] its white (the object type's color)
 * @param {number} [options.levels] access levels the world has (world.json)
 */
export function createCore({ color = '#eef3ff', levels = 3 } = {}) {
  const base = new Color(color);
  const gold = new Color(FRAGMENT_COLOR);
  const group = new Group();
  const { pedestal: h, margin: m } = CORE_FX;
  const white = liveLines(boxEdges([m, 0, m], [1 - m, h, 1 - m]), 2);
  group.add(boxFaces([m, 0, m], [1 - m, h, 1 - m]), white.lines);

  const [r, up, down] = CORE_FX.crystal;
  const tips = [[0, up, 0], [0, -down, 0]];
  const around = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * r, 0, Math.sin((i * Math.PI) / 3) * r]);
  const segments = around.flatMap((p, i) => [[p, around[(i + 1) % 6]], [p, tips[0]], [p, tips[1]]]);
  const crystal = liveLines(segments, 2.6);
  const positions = around.flatMap((p, i) => tips.flatMap((tip) => [...tip, ...p, ...around[(i + 1) % 6]]));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const glow = new MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const spin = new Group().add(new Mesh(geometry, glow), crystal.lines);
  spin.position.set(0.5, CORE_FX.y, 0.5);
  group.add(spin);
  // Rings round the crystal, tilted each its own way; they turn slowly.
  const rings = Array.from({ length: levels }, (_, i) => {
    const ring = liveLines(ringSegments(CORE_FX.ring - i * 0.04, 1.05 - (i * 0.9) / Math.max(1, levels - 1)), 1.8);
    const holder = new Group().add(ring.lines);
    holder.position.set(0.5, CORE_FX.y, 0.5);
    group.add(holder);
    return { ...ring, holder, angle: (i * 2 * Math.PI) / Math.max(3, levels), turn: CORE_FX.ringSpin * (i % 2 ? -1 : 1) };
  });
  const state = { level: 0, share: 0, time: 0, since: Infinity };
  group.userData.set = ({ level = 0, share = 0 } = {}) => {
    state.level = level;
    state.share = share;
  };
  group.userData.flash = () => {
    state.since = 0;
  };
  group.userData.update = (dt) => {
    state.time += dt;
    state.since += dt;
    const { level, share, time } = state;
    const boost = 1 + CORE_FX.boost * coreFlash(state.since);
    white.material.color.copy(base).multiplyScalar(CORE_FX.white * boost);
    spin.position.y = CORE_FX.y + CORE_FX.bob * Math.sin(time * 2);
    spin.rotation.y = time * CORE_FX.spin;
    crystal.material.color.copy(gold).multiplyScalar(goldLevel(0.4 + 0.6 * share) * boost);
    glow.opacity = (0.15 + 0.35 * share) * Math.min(boost, 2);
    levelMarks(level, levels).forEach((lit, i) => {
      const ring = rings[i];
      ring.holder.rotation.y = ring.angle + time * ring.turn;
      ring.material.color.copy(lit ? gold : UNLIT).multiplyScalar((lit ? CORE_FX.lit : 0.5) * boost);
    });
  };
  group.userData.update(0);
  return group;
}

/** Brightness of a gold part lit `t` (0..1). */
const goldLevel = (t) => CORE_FX.dim + (CORE_FX.lit - CORE_FX.dim) * t;

/** The core in the room (entities/core.js): its level and fragments, and a flash when it raises the level. */
export class CoreView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/core.js').Core} core
   */
  constructor(game, core) {
    this.game = game;
    this.core = core;
    this.group = createCore({ color: core.object.color, levels: game.fragmentRules.access.length });
    this.group.position.set(...core.pos);
    this.sync(0);
  }

  /** The core took fragments: a level raised, or the Grid rebooted. */
  flash() {
    this.group.userData.flash();
  }

  /**
   * @param {number} alpha unused: it never moves
   * @param {number} [dt] seconds since the last frame
   */
  sync(alpha, dt = 0) {
    const { progress, fragmentRules } = this.game;
    this.group.userData.set({ level: progress.accessLevel, share: Math.min(1, progress.count('fragments') / fragmentRules.required) });
    this.group.userData.update(dt);
  }
}
