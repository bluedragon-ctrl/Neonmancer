/**
 * A bolt: a small box flying straight on until something stops it. Pure
 * logic, one call to update() per fixed tick. Two kinds (D80):
 * - the wizard's Zap (Bolt.cast()): level from his hands the way he aims;
 *   it stops at the first live enemy it touches, a block, a room object
 *   (crate, platform, standing collapsing block) or the room's side;
 * - an enemy's shot (`attack: "bolt"`, Bolt.shoot()): slow, from its eyes
 *   at the wizard's middle; it stops at the wizard, another live enemy (not
 *   the one that fired it), a block, a room object or the room's side.
 * The body it stops at (its `target`) takes the hit (Game.updateBolts():
 * enemies and the wizard; room objects only mind the wizard's Zap). It
 * never goes through a thing: it moves in short sub-steps; it gives up
 * after BOLT.range (a shot fired up out of the room).
 */
import { DT } from '../core/loop.js';
import { overlapsBox, overlapsSolid } from '../physics/collision.js';

/** Tuning values (units). */
export const BOLT = {
  /** Height of its middle above the wizard's feet: his hands (WIZARD.hands.y), low enough to hit a bug. */
  height: 0.48,
  /** How far in front of his feet center (or an enemy's eyes) it starts. */
  reach: 0.34,
  /** Edge of its (cube) hitbox. */
  size: 0.3,
  /** Longest move between two checks, so it can't skip past anything. */
  maxStep: 0.1,
  /** Farthest it flies (a room's diagonal). */
  range: 32,
};

export class Bolt {
  /**
   * @param {number[]} pos its middle [x, y, z] where it starts
   * @param {number[]} dir flight direction [dx, dy, dz], normalized
   * @param {{ speed: number, damage: number, color?: number|string, owner?: object }} options
   *   `owner`: the enemy that fired it (none: the wizard's Zap); `color`
   *   its color (the Zap's cyan by default)
   */
  constructor(pos, dir, { speed, damage, color = null, owner = null }) {
    this.dir = [...dir];
    this.speed = speed;
    this.damage = damage;
    this.color = color;
    this.owner = owner;
    /** Its middle [x, y, z]. */
    this.pos = [...pos];
    /** Position at the previous tick, for render interpolation. */
    this.prev = [...this.pos];
    /** Ticks since it was cast, and units flown. */
    this.age = 0;
    this.traveled = 0;
    /** Set once it stopped: the body or room object it hit, or null for anything else. */
    this.stopped = false;
    this.target = null;
  }

  /**
   * The wizard's Zap, from his hands.
   * @param {number[]} feet the wizard's feet center
   * @param {number[]} aim [dx, dz], normalized
   * @param {{ speed: number, damage: number }} spell the Zap's tuning (defs.json spells.zap)
   */
  static cast(feet, [dx, dz], spell) {
    const pos = [feet[0] + dx * BOLT.reach, feet[1] + BOLT.height, feet[2] + dz * BOLT.reach];
    return new Bolt(pos, [dx, 0, dz], spell);
  }

  /**
   * An enemy's shot from its eyes along `dir`, with its damage, bolt
   * speed and attack color.
   * @param {import('./enemy.js').Enemy} enemy
   * @param {number[]} dir [dx, dy, dz], normalized
   */
  static shoot(enemy, dir) {
    const eyes = enemy.middle();
    const pos = eyes.map((v, i) => v + dir[i] * BOLT.reach);
    const { boltSpeed, damage, attackColor } = enemy.data;
    return new Bolt(pos, dir, { speed: boltSpeed, damage, color: attackColor, owner: enemy });
  }

  /** Keep this tick's start for render interpolation (copied in place). */
  savePrevious() {
    for (let i = 0; i < 3; i++) this.prev[i] = this.pos[i];
  }

  /** Collision box [[minX, maxX], [minY, maxY], [minZ, maxZ]]. */
  box() {
    const half = BOLT.size / 2;
    return this.pos.map((p) => [p - half, p + half]);
  }

  /**
   * One fixed tick: fly on (checking where it starts, on its first tick,
   * so a bolt cast into a wall stops at once).
   * @param {import('../game.js').Game} game grid, player, `liveEnemies` and `objects`
   * @returns {boolean} whether it stopped this tick
   */
  update(game) {
    this.savePrevious();
    if (this.stopped) return false;
    if (this.age++ === 0 && this.blocked(game)) return true;
    const distance = this.speed * DT;
    const steps = Math.ceil(distance / BOLT.maxStep);
    for (let i = 0; i < steps; i++) {
      for (let k = 0; k < 3; k++) this.pos[k] += (this.dir[k] * distance) / steps;
      this.traveled += distance / steps;
      if (this.blocked(game)) return true;
    }
    return false;
  }

  /**
   * Does something stop it where it is now? A body first (an enemy; for a
   * shot the wizard, then an enemy other than its own), then a room object
   * (either is its `target`), a block or the room's side (an exit
   * included), or its range running out. Marks it stopped.
   */
  blocked({ grid, player, liveEnemies, objects }) {
    const box = this.box();
    const hits = (body) => overlapsBox(box, body.box());
    const { owner } = this;
    const wizard = owner && !player.dead && hits(player) ? player : null;
    // Every live enemy counts (solid or not); objects only while there (not collapsed or broken).
    this.target =
      wizard ??
      liveEnemies.find((enemy) => enemy !== owner && hits(enemy)) ??
      objects.find((object) => object.solid !== false && hits(object)) ??
      null;
    const [x, , z] = this.pos;
    const outside = x < 0 || z < 0 || x > grid.w || z > grid.d || this.traveled >= BOLT.range;
    this.stopped = this.target !== null || outside || overlapsSolid(box, grid);
    return this.stopped;
  }
}
