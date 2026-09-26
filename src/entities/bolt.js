/**
 * A Zap bolt: a small box flying level from the wizard's hands the way he
 * aims, until something stops it: the first live enemy it touches, a
 * block, a room object (crate, platform, standing collapsing block) or the
 * room's side. The enemy or object it stops at takes the hit
 * (Game.updateBolts(); only destructible objects mind). It never goes
 * through a thing: it moves in short sub-steps. Pure logic, one call to
 * update() per fixed tick.
 */
import { DT } from '../core/loop.js';
import { overlapsBox, overlapsSolid } from '../physics/collision.js';

/** Tuning values (units). */
export const BOLT = {
  /** Height of its middle above the wizard's feet: his hands (WIZARD.hands.y), low enough to hit a bug. */
  height: 0.48,
  /** How far in front of his feet center it starts. */
  reach: 0.34,
  /** Edge of its (cube) hitbox. */
  size: 0.3,
  /** Longest move between two checks, so it can't skip past anything. */
  maxStep: 0.1,
};

export class Bolt {
  /**
   * @param {number[]} feet the wizard's feet center
   * @param {number[]} dir aim [dx, dz], normalized
   * @param {{ speed: number, damage: number }} spell the Zap's tuning (defs.json spells.zap)
   */
  constructor(feet, [dx, dz], { speed, damage }) {
    this.dir = [dx, dz];
    this.speed = speed;
    this.damage = damage;
    /** Its middle [x, y, z]. */
    this.pos = [feet[0] + dx * BOLT.reach, feet[1] + BOLT.height, feet[2] + dz * BOLT.reach];
    /** Position at the previous tick, for render interpolation. */
    this.prev = [...this.pos];
    /** Ticks since it was cast, and units flown. */
    this.age = 0;
    this.traveled = 0;
    /** Set once it stopped: the enemy or room object it hit, or null for anything else. */
    this.stopped = false;
    this.target = null;
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
   * @param {import('../game.js').Game} game grid, `liveEnemies` and `objects`
   * @returns {boolean} whether it stopped this tick
   */
  update(game) {
    this.savePrevious();
    if (this.stopped) return false;
    if (this.age++ === 0 && this.blocked(game)) return true;
    const distance = this.speed * DT;
    const steps = Math.ceil(distance / BOLT.maxStep);
    for (let i = 0; i < steps; i++) {
      this.pos[0] += (this.dir[0] * distance) / steps;
      this.pos[2] += (this.dir[1] * distance) / steps;
      this.traveled += distance / steps;
      if (this.blocked(game)) return true;
    }
    return false;
  }

  /**
   * Does something stop it where it is now? An enemy first, then a room
   * object (either is its `target`), a block or the room's side (an exit
   * included). Marks it stopped.
   */
  blocked({ grid, liveEnemies, objects }) {
    const box = this.box();
    const hits = (body) => overlapsBox(box, body.box());
    // Every live enemy counts (solid or not); objects only while there (not collapsed or broken).
    this.target = liveEnemies.find(hits) ?? objects.find((object) => object.solid !== false && hits(object)) ?? null;
    const [x, , z] = this.pos;
    const outside = x < 0 || z < 0 || x > grid.w || z > grid.d;
    this.stopped = this.target !== null || outside || overlapsSolid(box, grid);
    return this.stopped;
  }
}
