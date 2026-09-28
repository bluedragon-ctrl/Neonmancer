/**
 * The discharge attack's look (Phase 3 step 5): one electric attack for
 * every enemy that has it, set per enemy template by data — its color, shape
 * and range, and how long it charges. It charges (the enemy's own model
 * shakes and glows; here: crackle round its middle, and for an `arc` a
 * dashed aim line), then discharges lightning for a few ticks:
 *
 * - `burst`: jagged arcs all round it, out to the range (close range);
 * - `arc`: one bolt at the wizard, as long as the distance (long range).
 *
 * Lightning is a double line like the Shield ring (the color outside,
 * white-hot inside), swapping prebuilt zigzags to flicker.
 */
import { Group } from 'three';
import { ENEMY } from '../entities/enemy.js';
import { hash } from './hash.js';
import { lineMaterial, neonLines } from './neon.js';

/** Timing in ticks, sizes in units. */
export const DISCHARGE = {
  /** Ticks the lightning lasts once charged (the game's). */
  ticks: ENEMY.dischargeTicks,
  /** Burst: arcs round it, kinks per arc, jitter; zigzag variants and how often they swap. */
  arcs: 8,
  kinks: 6,
  jitter: 0.09,
  variants: 4,
  flickerTicks: 2,
  /** Arc: kinks per unit of length, and the reach of the crackle while charging. */
  kinksPerUnit: 8,
  crackle: 0.42,
};

/** Discharge shapes, as enemy templates name them. */
export const DISCHARGE_SHAPES = ['burst', 'arc'];

const SEED = [57.1, 143.9];

/**
 * How far into its attack an enemy is: 0..1 through the charge (then 1
 * while discharging), whether it is discharging, and how hard it shakes.
 * @param {number|null} tick ticks since the attack started, or null
 * @param {number} chargeTicks how long it charges
 * @returns {{ charge: number, discharging: boolean, shake: number }}
 */
export function dischargeLook(tick, chargeTicks) {
  if (tick === null || tick < 0 || tick >= chargeTicks + DISCHARGE.ticks) return { charge: 0, discharging: false, shake: 0 };
  const c = Math.min(tick / chargeTicks, 1);
  return { charge: c, discharging: tick >= chargeTicks, shake: tick < chargeTicks ? 0.012 + c * c * 0.03 : 0.02 };
}

/**
 * How much an enemy glows white during its attack (its hologram flash):
 * rising while it charges, bright while it discharges.
 * @param {ReturnType<typeof dischargeLook>} look
 */
export function chargeGlow({ charge, discharging }) {
  return discharging ? 0.8 : charge * 0.45;
}

/**
 * The zigzags of a `burst`, one variant: `arcs` jagged lines from near the
 * middle out to `reach`, round it in the xz plane and sloping down a
 * little, as segments [[x, y, z], [x, y, z]] relative to the middle.
 * @param {number} variant
 * @param {number} reach
 */
export function burstSegments(variant, reach) {
  const { arcs, kinks, jitter } = DISCHARGE;
  const segments = [];
  for (let a = 0; a < arcs; a++) {
    const base = ((a + hash(a, variant, SEED) * 0.5) / arcs) * Math.PI * 2;
    let prev = null;
    for (let k = 0; k <= kinks; k++) {
      const t = k / kinks;
      const r = 0.2 + (reach - 0.2) * t;
      const side = k === 0 ? 0 : (hash(a * 13 + k, variant * 2, SEED) - 0.5) * 4 * jitter;
      const up = k === 0 ? 0 : (hash(a * 13 + k, variant * 2 + 1, SEED) - 0.5) * 2 * jitter;
      const angle = base + side / r;
      const point = [Math.cos(angle) * r, up - t * 0.25 * reach, Math.sin(angle) * r];
      if (prev) segments.push([prev, point]);
      prev = point;
    }
  }
  return segments;
}

/**
 * The zigzag of an `arc`, one variant: a bolt along +z from 0 to `length`
 * (stretched to the distance when placed), with a short branch every unit
 * or so.
 * @param {number} variant
 * @param {number} length
 */
export function arcSegments(variant, length) {
  const { jitter, kinksPerUnit } = DISCHARGE;
  const n = Math.max(4, Math.round(length * kinksPerUnit));
  const points = [];
  for (let k = 0; k <= n; k++) {
    const end = k === 0 || k === n;
    const x = end ? 0 : (hash(k, variant * 2, SEED) - 0.5) * 2.8 * jitter;
    const y = end ? 0 : (hash(k, variant * 2 + 1, SEED) - 0.5) * 2 * jitter;
    points.push([x, y, (k / n) * length]);
  }
  const segments = points.slice(1).map((p, i) => [points[i], p]);
  for (let k = 3; k < n - 1; k += 6) {
    const [x, y, z] = points[k];
    const dir = hash(k, variant + 9, SEED) > 0.5 ? 1 : -1;
    segments.push([points[k], [x + dir * 0.12, y - 0.05, z + 0.08]]);
  }
  return segments;
}

/**
 * The lightning of one enemy's discharge (placeDischarge()).
 * @param {object} attack
 * @param {number|string} attack.color
 * @param {'burst'|'arc'} attack.shape
 * @param {number} attack.range units
 */
export function createDischarge({ color, shape, range }) {
  const outer = lineMaterial({ color, width: 3, brightness: 2.6 });
  const inner = lineMaterial({ color: 0xffffff, width: 0.9, brightness: 1.4 });
  const variants = (make) =>
    Array.from({ length: DISCHARGE.variants }, (_, v) => {
      const lines = make(v);
      lines.visible = false;
      return lines;
    });
  const shapes = variants((v) => {
    const segments = shape === 'burst' ? burstSegments(v, range) : arcSegments(v, range);
    return new Group().add(neonLines(segments, outer), neonLines(segments, inner));
  });
  // Crackle round its middle while charging: a small burst.
  const crackle = variants((v) => new Group().add(neonLines(burstSegments(v + 7, DISCHARGE.crackle), inner)));
  // An arc aims first: a thin dashed line along the bolt's path.
  const aimMaterial = lineMaterial({ color, width: 1.2, dashed: true });
  const aim = neonLines([[[0, 0, 0], [0, 0, range]]], aimMaterial);
  aim.visible = false;
  const bolt = new Group().add(...shapes, aim);
  const group = new Group().add(bolt, ...crackle);
  Object.assign(group.userData, { shape, range, bolt, shapes, crackle, aim, aimColor: aimMaterial.color.clone(), aimMaterial });
  group.visible = false;
  return group;
}

/**
 * Show a discharge `tick` ticks after the attack started (null: none),
 * from the enemy's middle `from` towards `target` (an arc's aim: where the
 * wizard was when it started charging), in the same space.
 * @param {Group} view from createDischarge()
 * @param {number|null} tick
 * @param {number} chargeTicks
 * @param {number[]} from
 * @param {number[]} [target]
 */
export function placeDischarge(view, tick, chargeTicks, from, target) {
  const look = dischargeLook(tick, chargeTicks);
  const { shape, range, shapes, crackle, bolt, aim, aimColor, aimMaterial } = view.userData;
  const arc = shape === 'arc';
  const attacking = tick !== null && tick >= 0 && tick < chargeTicks + DISCHARGE.ticks;
  // A burst shows only late in its charge (crackle); an arc aims from the start.
  view.visible = attacking && (arc || look.discharging || look.charge > 0.3);
  if (!view.visible) return;
  view.position.set(...from);
  const variant = Math.floor(tick / DISCHARGE.flickerTicks) % DISCHARGE.variants;
  // Crackle flickers in and out while charging, more often towards the end.
  const crackling = !look.discharging && look.charge > 0.3 && hash(Math.floor(tick / 2), 3) < look.charge;
  crackle.forEach((lines, v) => (lines.visible = crackling && v === variant));
  shapes.forEach((lines, v) => (lines.visible = look.discharging && v === variant));
  // The aim line brightens while charging and blinks just before it fires.
  aim.visible = arc && !look.discharging && !(look.charge > 0.8 && Math.floor(tick / 3) % 2 === 1);
  aimMaterial.color.copy(aimColor).multiplyScalar(0.3 + look.charge * 1.5);
  if (arc && target) {
    const dx = target[0] - from[0];
    const dy = target[1] - from[1];
    const dz = target[2] - from[2];
    const length = Math.hypot(dx, dy, dz) || 1;
    bolt.rotation.set(-Math.asin(dy / length), Math.atan2(dx, dz), 0, 'YXZ');
    bolt.scale.set(1, 1, length / range);
  }
}
