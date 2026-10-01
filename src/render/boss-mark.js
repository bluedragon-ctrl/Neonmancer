/**
 * The boss mark (D134): three gold rings, tilted each its own way, turning
 * slowly round a boss's body, like the core's (core-view.js). A mark, not
 * a look: any enemy body gets it from its template's `boss` block, sized to
 * its height. Plate armor (D135) draws the rings in tight round it while
 * shut; open, they spread out and spin fast. A teleport squeezes the body
 * and its rings to a line and back (teleportLook()). Showcase
 * `?asset=bosses`.
 */
import { Color, Group } from 'three';
import { ENEMY } from '../entities/enemy.js';
import { FRAGMENT_COLOR } from '../entities/pickup.js';
import { ringSegments } from './core-view.js';
import { lineMaterial, neonLines } from './neon.js';

/** Tuning (units, seconds). */
export const BOSS_MARK = {
  /** Ring radius round a body of height 0 and per unit of height. */
  radius: 0.3,
  radiusPerHeight: 0.3,
  /** Middle of the rings, as a share of the body's height. */
  middle: 0.5,
  /** Turning speed (radians per second); with the armor open, this much faster. */
  spin: 0.8,
  openSpin: 3,
  /** Radius while plate armor is shut, as a share; how fast it opens and shuts (per second). */
  shut: 0.8,
  armorRate: 4,
  /** Line width and brightness. */
  width: 1.8,
  brightness: 1.8,
  /** A taller body's model is drawn at most this much bigger, so it keeps within its cell. */
  maxScale: 1.6,
};

/**
 * How much bigger a body `height` units high is drawn than a small one
 * (ENEMY.size, D134), at most BOSS_MARK.maxScale (pure).
 * @param {number} height
 */
export function bodyScale(height) {
  return Math.min(height / ENEMY.size[1], BOSS_MARK.maxScale);
}

/**
 * Where the rings go round a body `height` units high (pure).
 * @param {number} height
 * @returns {{ y: number, radius: number }}
 */
export function bossMarkSize(height) {
  return { y: height * BOSS_MARK.middle, radius: BOSS_MARK.radius + BOSS_MARK.radiusPerHeight * height };
}

/**
 * A teleport's look `tick` ticks into one of `ticks` (pure): the body
 * narrows to a line and stretches as it goes, the other way round as it
 * comes back. `width` scales it across, `height` up; hidden at the turn.
 * @param {number|null} tick null: no teleport
 * @param {number} ticks
 * @returns {{ width: number, height: number, visible: boolean }}
 */
export function teleportLook(tick, ticks) {
  if (tick === null) return { width: 1, height: 1, visible: true };
  const half = ticks / 2;
  const width = Math.min(1, Math.abs(tick - half) / half);
  return { width, height: 1 + (1 - width) * 0.8, visible: width > 0.05 };
}

/**
 * The mark round a body `height` units high, its feet at the origin.
 * `userData.update(dt, { armored })` turns it (and opens or shuts it).
 * @param {number} height
 */
export function createBossMark(height) {
  const { y, radius } = bossMarkSize(height);
  const material = lineMaterial({ color: new Color(FRAGMENT_COLOR), width: BOSS_MARK.width, brightness: BOSS_MARK.brightness });
  const group = new Group();
  const rings = [0.35, 1.05, 1.75].map((tilt, i) => {
    const holder = new Group().add(neonLines(ringSegments(radius - i * 0.03, tilt), material));
    holder.position.y = y;
    group.add(holder);
    return { holder, angle: (i * 2 * Math.PI) / 3, turn: i % 2 ? -1 : 1 };
  });
  const state = { time: 0, open: 1 };
  group.userData.update = (dt, { armored = false } = {}) => {
    const want = armored ? 0 : 1;
    state.open += Math.sign(want - state.open) * Math.min(Math.abs(want - state.open), dt * BOSS_MARK.armorRate);
    // Only plate-armored bosses ever shut; the rest spin at the calm speed.
    const spin = BOSS_MARK.spin * (1 + (BOSS_MARK.openSpin - 1) * (armored === null ? 0 : state.open));
    state.time += dt * spin;
    const scale = BOSS_MARK.shut + (1 - BOSS_MARK.shut) * state.open;
    for (const ring of rings) {
      ring.holder.rotation.y = ring.angle + state.time * ring.turn;
      ring.holder.scale.set(scale, 1, scale);
    }
  };
  group.userData.update(0);
  return group;
}
