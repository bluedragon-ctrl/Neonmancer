/**
 * A bolt: a small box flying straight on until something stops it. Pure
 * logic, one call to update() per fixed tick. Two kinds (D80):
 * - the wizard's Zap or Pause (Bolt.cast()): level from his hands the way
 *   he aims; it stops at the first live enemy it touches, a block, a room
 *   object (crate, platform, standing collapsing block) or the room's side.
 *   A Pause bolt freezes the enemy it stops at instead of hurting it (D85);
 * - an enemy's shot (`attack: "bolt"`, Bolt.shoot()): slow, from its eyes
 *   (boltDirections(): at the wizard's middle, or four ways); it stops at
 *   the wizard, another live enemy (not the one that fired it), a block, a
 *   room object or the room's side. While his Shield or Firewall is up,
 *   it stops at the ring instead, absorbed (D84).
 * A bouncing bolt (an enemy's `boltBounces`, D81) glances off blocks, the
 * room's sides and room objects that many times, turning back along the
 * axis it ran into; after its first bounce it can hit its own shooter too.
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

/** The four level grid directions a "cross" pattern fires along (D81). */
const CROSS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * The directions an enemy's bolts fly off in (D80, D81), normalized: four
 * level shots along the grid axes (`boltPattern` "cross"), or one at
 * `target`: straight at it, or level towards it for a bouncing bolt (it
 * glances off walls in the level plane only). Straight above or below
 * it, a level shot flies the way it faces.
 * @param {{ boltPattern: string, boltBounces: number }} values the enemy's
 * @param {number[]} from its eyes
 * @param {number[]} target the wizard's middle
 * @param {number} facing radians around y (0 looks along +z)
 * @returns {number[][]}
 */
export function boltDirections({ boltPattern, boltBounces }, from, target, facing) {
  if (boltPattern === 'cross') return CROSS.map((dir) => [...dir]);
  const d = [target[0] - from[0], boltBounces > 0 ? 0 : target[1] - from[1], target[2] - from[2]];
  const length = Math.hypot(...d);
  if (length === 0) return [[Math.sin(facing), 0, Math.cos(facing)]];
  return [d.map((c) => c / length)];
}

export class Bolt {
  /**
   * @param {number[]} pos its middle [x, y, z] where it starts
   * @param {number[]} dir flight direction [dx, dy, dz], normalized
   * @param {{ speed: number, damage?: number, color?: number|string, owner?: object, bounces?: number, freeze?: number }} options
   *   `owner`: the enemy that fired it (none: the wizard's spell); `color`
   *   its color (the Zap's cyan by default); `bounces`: how often it
   *   glances off walls and objects before they stop it; `freeze`: ticks a
   *   Pause bolt freezes an enemy for (0: not a Pause bolt)
   */
  constructor(pos, dir, { speed, damage = 0, color = null, owner = null, bounces = 0, freeze = 0 }) {
    this.dir = [...dir];
    this.speed = speed;
    this.damage = damage;
    this.freeze = freeze;
    this.color = color;
    this.owner = owner;
    /** Bounces left, and whether it has bounced at all (then its owner is fair game). */
    this.bounces = bounces;
    this.bounced = false;
    /** Where it bounced this tick: { pos, dir } with the direction it came in (for sparks). */
    this.rebounds = [];
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
   * The wizard's Zap or Pause, from his hands.
   * @param {number[]} feet the wizard's feet center
   * @param {number[]} aim [dx, dz], normalized
   * @param {{ speed: number, damage?: number, color: string, freeze?: number }} spell the spell's
   *   tuning (defs.json spells.zap), or Pause's with the ticks it freezes for
   */
  static cast(feet, [dx, dz], spell) {
    const pos = [feet[0] + dx * BOLT.reach, feet[1] + BOLT.height, feet[2] + dz * BOLT.reach];
    return new Bolt(pos, [dx, 0, dz], spell);
  }

  /**
   * An enemy's shot from its eyes along `dir`, with its damage, bolt
   * speed, bounces and attack color.
   * @param {import('./enemy.js').Enemy} enemy
   * @param {number[]} dir [dx, dy, dz], normalized (boltDirections())
   */
  static shoot(enemy, dir) {
    const eyes = enemy.middle();
    const pos = eyes.map((v, i) => v + dir[i] * BOLT.reach);
    const { boltSpeed, boltBounces, damage, attackColor } = enemy.data;
    return new Bolt(pos, dir, { speed: boltSpeed, damage, color: attackColor, owner: enemy, bounces: boltBounces });
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
   * so a bolt cast into a wall stops at once), one axis at a time, so a
   * bouncing bolt knows which way it ran into a wall.
   * @param {import('../game.js').Game} game grid, player, `liveEnemies` and `objects`
   * @returns {boolean} whether it stopped this tick
   */
  update(game) {
    this.savePrevious();
    this.rebounds.length = 0;
    if (this.stopped) return false;
    if (this.age++ === 0 && this.blocked(game)) return true;
    const distance = this.speed * DT;
    const steps = Math.ceil(distance / BOLT.maxStep);
    const step = distance / steps;
    for (let i = 0; i < steps; i++) {
      for (let k = 0; k < 3; k++) {
        this.pos[k] += this.dir[k] * step;
        // Bouncing: it glances off a wall or an object along a level axis.
        if (this.bounces > 0 && k !== 1 && this.dir[k] !== 0 && this.walled(game)) {
          this.pos[k] -= this.dir[k] * step;
          this.rebounds.push({ pos: [...this.pos], dir: [...this.dir] });
          this.dir[k] = -this.dir[k];
          this.bounces--;
          this.bounced = true;
        }
      }
      this.traveled += step;
      if (this.blocked(game)) return true;
    }
    return false;
  }

  /** Would a wall stop it where it is: a block, the room's side (a closed exit too) or a room object? */
  walled({ grid, objects }) {
    const box = this.box();
    return overlapsSolid(box, grid) || objects.some((object) => object.solid !== false && overlapsBox(box, object.box()));
  }

  /**
   * Does something stop it where it is now? A body first (an enemy; for a
   * shot the wizard or his ring, then an enemy other than its own until it bounced),
   * then a room object (either is its `target`), a block or the room's
   * side (an exit included), or its range running out. Marks it stopped.
   */
  blocked({ grid, player, liveEnemies, objects }) {
    const box = this.box();
    const hits = (body) => overlapsBox(box, body.box());
    const { owner } = this;
    // A shot stops at his ring while it is up (D84), else at him.
    const wizardBox = player.shield ? player.shieldBox() : player.box();
    const wizard = owner && !player.dead && overlapsBox(box, wizardBox) ? player : null;
    // Every live enemy counts (solid or not); objects only while there (not collapsed or broken).
    this.target =
      wizard ??
      liveEnemies.find((enemy) => (enemy !== owner || this.bounced) && hits(enemy)) ??
      objects.find((object) => object.solid !== false && hits(object)) ??
      null;
    const [x, , z] = this.pos;
    const outside = x < 0 || z < 0 || x > grid.w || z > grid.d || this.traveled >= BOLT.range;
    this.stopped = this.target !== null || outside || overlapsSolid(box, grid);
    return this.stopped;
  }
}
