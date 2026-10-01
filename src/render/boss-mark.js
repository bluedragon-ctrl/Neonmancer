/**
 * The boss mark (D134): three gold rings, tilted each its own way, turning
 * slowly round a boss's body, like the core's (core-view.js). A mark, not
 * a look: any enemy body gets it from its template's `boss` block, sized to
 * its height. Plate armor (D135) draws the rings in tight round it while
 * shut; open, they spread out and spin fast. Its shell (createArmorShell())
 * shows the armor itself. A teleport squeezes the body
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

/** Plate armor's shell (D135): tuning (units, seconds). */
export const ARMOR_SHELL = {
  /** Width round the body and headroom over it. */
  width: 0.82,
  over: 0.12,
  /** How fast it opens and shuts (per second); how far it lifts and grows open. */
  rate: 5,
  lift: 0.5,
  grow: 0.35,
  /** Line brightness, and on a glancing hit (a white flash of `flash` seconds). */
  brightness: 1.2,
  hit: 3,
  flash: 0.25,
};

/**
 * Plate armor's shell round a body `height` units high, its feet at the
 * origin: a white dashed box, the floor plates' own look (a mechanism,
 * D99), so the two read as one. Shut, it holds round the body and flashes
 * when a hit glances off; open (on a plate), it lifts, grows and fades.
 * `userData.update(dt, { shut, hit })`: `hit` seconds since a glancing
 * hit, or null.
 * @param {number} height
 */
export function createArmorShell(height) {
  const w = ARMOR_SHELL.width / 2;
  const h = height + ARMOR_SHELL.over;
  const c = (i) => [i & 1 ? w : -w, i & 2 ? h : 0, i & 4 ? w : -w];
  const pairs = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const material = lineMaterial({ color: 0xffffff, width: 2, dashed: true });
  const lines = neonLines(pairs.map(([a, b]) => [c(a), c(b)]), material);
  const group = new Group().add(lines);
  const state = { open: 0 };
  const white = new Color(0xffffff);
  group.userData.update = (dt, { shut = true, hit = null } = {}) => {
    const want = shut ? 0 : 1;
    state.open += Math.sign(want - state.open) * Math.min(Math.abs(want - state.open), dt * ARMOR_SHELL.rate);
    const { lift, grow } = armorShellLook(state.open);
    lines.position.y = lift;
    lines.scale.setScalar(grow);
    const flash = hit !== null && hit < ARMOR_SHELL.flash ? 1 - hit / ARMOR_SHELL.flash : 0;
    const level = (ARMOR_SHELL.brightness + (ARMOR_SHELL.hit - ARMOR_SHELL.brightness) * flash) * (1 - state.open);
    material.color.copy(white).multiplyScalar(level);
    group.visible = state.open < 0.99;
  };
  group.userData.update(0);
  return group;
}

/**
 * How far open plate armor's shell is drawn at `open` (0 shut, 1 open;
 * pure): how high it has lifted, how much it has grown.
 * @param {number} open
 */
export function armorShellLook(open) {
  return { lift: ARMOR_SHELL.lift * open, grow: 1 + ARMOR_SHELL.grow * open };
}
