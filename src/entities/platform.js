/**
 * A moving platform: one 1×1×1 block following a path (world/path.js) that
 * the wizard and pushables ride (D46). Pure logic, one call to update() per
 * fixed tick.
 *
 * Each tick it works out the whole move before making it:
 * - what rides on it: resting pushables and the wizard standing on top, and
 *   whatever stands on those (stacks ride along);
 * - a pushable or another platform in the way, or a rider that would be
 *   carried into something: it waits (the path doesn't move on);
 * - the wizard in the way (or carried into a ceiling): he is shoved out of
 *   the way, along the motion or aside, by at most PLATFORM.maxShove; with
 *   no room for that it hurts him and waits. It never kills outright.
 */
import { DT } from '../core/loop.js';
import { bodyBox, moveAxis, overlaps, overlapsSolid } from '../physics/collision.js';
import { advance, buildTrack, positionOf, startState } from '../world/path.js';

/** Tuning values (units, integrity). */
export const PLATFORM = {
  /** Integrity lost when a platform squeezes the wizard with no room to shove him aside. */
  crushDamage: 1,
  /** Farthest a platform shoves the wizard in one tick; more than that and he is squeezed. */
  maxShove: 0.35,
};

/** Heights closer than this count as touching (one resting on the other). */
const EPS = 1e-4;

export class Platform {
  /**
   * @param {object} object runtime room object (id, type, at, path, style...)
   */
  constructor(object) {
    this.object = object;
    this.id = object.id;
    this.kind = object.kind;
    this.size = [1, 1, 1];
    this.track = buildTrack(object.at, object.path);
    /** Where it is on its path (world/path.js). */
    this.pathState = startState();
    /** Lower corner [x, y, z]; on whole cells at the path's points. */
    this.pos = positionOf(this.track, this.pathState);
    /** Position at the previous tick, for render interpolation. */
    this.prev = [...this.pos];
  }

  /** Keep this tick's start for render interpolation (copied in place: no new array every tick). */
  savePrevious() {
    for (let i = 0; i < 3; i++) this.prev[i] = this.pos[i];
  }

  /** Collision box [[minX, maxX], [minY, maxY], [minZ, maxZ]]. */
  box() {
    return boxAt(this.pos);
  }

  /**
   * One fixed tick: move on along the path, carrying riders, or wait.
   * @param {import('../game.js').Game} game grid, solid objects, player and hurt()
   * @returns {null} platforms report no events of their own (a squeeze is a 'hurt')
   */
  update(game) {
    this.savePrevious();
    const next = advance(this.track, this.pathState, this.track.speed * DT);
    const to = positionOf(this.track, next);
    const delta = to.map((v, i) => v - this.pos[i]);
    if (delta.every((d) => d === 0)) {
      this.pathState = next; // pausing at a stop
      return null;
    }

    const move = this.plan(to, delta, game);
    if (move.squeezed) game.hurt(PLATFORM.crushDamage);
    if (!move.ok) return null;

    this.pathState = next;
    this.pos = to;
    for (const rider of move.crates) rider.pos = rider.pos.map((v, i) => snap(v + delta[i]));
    if (move.player) game.player.pos = move.player;
    return null;
  }

  /**
   * Work out a move to `to` without making it.
   * @returns {{ ok: boolean, squeezed?: boolean, crates?: object[], player?: number[]|null }}
   *   `crates` ride along; `player` is the wizard's new feet center (null: he stays put)
   */
  plan(to, delta, { grid, solids: objects, player }) {
    const box = boxAt(to);
    const alive = !player.dead;
    const { crates, carriesPlayer } = this.riders(objects, alive ? player : null);
    const moving = new Set([this, ...crates]);
    if (carriesPlayer) moving.add(player);

    // Anything else in the way (a pushable, another platform, a collapsing block) stops it.
    for (const object of objects) {
      if (!moving.has(object) && overlapsBox(box, object.box())) return { ok: false };
    }
    // Riders must fit where they are carried: clear of blocks and other bodies.
    const still = objects.filter((object) => !moving.has(object));
    if (alive && !carriesPlayer) still.push(player);
    for (const crate of crates) {
      const moved = crate.box().map(([min, max], i) => [min + delta[i], max + delta[i]]);
      if (overlapsSolid(moved, grid) || still.some((body) => overlapsBox(moved, body.box()))) return { ok: false };
    }
    if (!alive) return { ok: true, crates, player: null };

    // The wizard rides along (clamped by walls and bodies), or stays; then
    // he must be clear of the platform's new box, shoved out if need be.
    const others = objects.filter((object) => !moving.has(object));
    const pos = [...player.pos];
    if (carriesPlayer) for (const axis of [0, 1, 2]) moveAxis(pos, player.size, axis, delta[axis], grid, others, player);
    const shoved = this.shove(pos, player.size, box, grid, others, player);
    if (!shoved) return { ok: false, squeezed: true };
    return { ok: true, crates, player: shoved };
  }

  /**
   * What rides on the platform: resting pushables on top of it, and
   * whatever rests on those; and whether the wizard stands on any of them.
   * @param {object[]} objects room objects
   * @param {object|null} player the wizard, or null when he can't ride (dead)
   */
  riders(objects, player) {
    const carriers = [this];
    const crates = [];
    for (let i = 0; i < carriers.length; i++) {
      const under = carriers[i].box();
      for (const object of objects) {
        if (object.state !== 'rest' || carriers.includes(object)) continue;
        if (restsOn(object.box(), under)) {
          carriers.push(object);
          crates.push(object);
        }
      }
    }
    const carriesPlayer = !!player && carriers.some((carrier) => restsOn(player.box(), carrier.box()));
    return { crates, carriesPlayer };
  }

  /**
   * The wizard's feet center clear of the platform box `box`: `pos` itself
   * if it already is, else the smallest shove (at most PLATFORM.maxShove,
   * along any axis) that fits, or null if none does.
   * @param {number[]} pos feet center
   * @param {number[]} size
   * @param {number[][]} box the platform's new box
   */
  shove(pos, size, box, grid, others, player) {
    const current = bodyBox(pos, size);
    if (!overlapsBox(current, box)) return pos;
    const shoves = [];
    for (const axis of [0, 1, 2]) {
      shoves.push([axis, box[axis][1] - current[axis][0]], [axis, box[axis][0] - current[axis][1]]);
    }
    shoves.sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
    for (const [axis, amount] of shoves) {
      if (Math.abs(amount) > PLATFORM.maxShove) break;
      const moved = [...pos];
      if (moveAxis(moved, size, axis, amount, grid, others, player) === false && !overlapsBox(bodyBox(moved, size), box)) return moved;
    }
    return null;
  }
}

/** Box of a unit block with its lower corner at `pos`. */
function boxAt([x, y, z]) {
  return [
    [x, x + 1],
    [y, y + 1],
    [z, z + 1],
  ];
}

/** Do two boxes overlap (more than touching)? */
function overlapsBox(a, b) {
  return a.every((range, i) => overlaps(range, b[i]));
}

/** Does box `a` rest on top of box `b`: bottom on its top, footprints overlapping? */
function restsOn(a, b) {
  return Math.abs(a[1][0] - b[1][1]) < EPS && overlaps(a[0], b[0]) && overlaps(a[2], b[2]);
}

/** Round a coordinate that is a hair off a whole cell, so carried objects stay on the grid. */
function snap(v) {
  const whole = Math.round(v);
  return Math.abs(v - whole) < 1e-9 ? whole : v;
}
