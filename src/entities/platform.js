/**
 * A moving platform: one 1×1×1 block following a path (world/path.js) that
 * the wizard and pushables ride (D46). Pure logic, one call to update() per
 * fixed tick.
 *
 * Each tick it works out the whole move before making it:
 * - what rides on it: resting pushables and enemies and the wizard standing
 *   on top, and whatever stands on those (stacks ride along);
 * - a pushable, an enemy or another platform in the way, a rider that would
 *   be carried into something, or an enemy stepping on or off: it waits
 *   (the path doesn't move on);
 * - the wizard in the way (or carried into a ceiling): he is shoved out of
 *   the way, along the motion or aside, by at most PLATFORM.maxShove; with
 *   no room for that it hurts him and waits. It never kills outright.
 */
import { DT } from '../core/loop.js';
import { moveAxis, overlaps, overlapsBox, overlapsSolid, shoveClear } from '../physics/collision.js';
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
    // Riders: pushables and enemies (and whatever rests on them).
    for (const rider of move.crates) rider.pos = rider.pos.map((v, i) => snap(v + delta[i]));
    if (move.player) game.player.pos = move.player;
    return null;
  }

  /**
   * Work out a move to `to` without making it.
   * @returns {{ ok: boolean, squeezed?: boolean, crates?: object[], player?: number[]|null }}
   *   `crates` ride along; `player` is the wizard's new feet center (null: he stays put)
   */
  plan(to, delta, { grid, solids, liveEnemies = [], player }) {
    const box = boxAt(to);
    const alive = !player.dead;
    const objects = [...new Set([...solids, ...liveEnemies])];
    const { crates, carriesPlayer, stepping } = this.riders(objects, alive ? player : null);
    if (stepping) return { ok: false };
    const moving = new Set([this, ...crates]);
    if (carriesPlayer) moving.add(player);

    // Anything else in the way (a pushable, an enemy, another platform, a collapsing block) stops it.
    for (const object of objects) {
      if (!moving.has(object) && overlapsBox(box, object.box())) return { ok: false };
    }
    // Riders must fit where they are carried: clear of blocks and other
    // bodies (an enemy may overlap the wizard, it doesn't block him).
    const still = objects.filter((object) => !moving.has(object));
    const stillAndPlayer = alive && !carriesPlayer ? [...still, player] : still;
    for (const crate of crates) {
      const moved = crate.box().map(([min, max], i) => [min + delta[i], max + delta[i]]);
      const others = crate.behavior ? still : stillAndPlayer;
      if (overlapsSolid(moved, grid) || others.some((body) => overlapsBox(moved, body.box()))) return { ok: false };
    }
    if (!alive) return { ok: true, crates, player: null };

    // The wizard rides along (clamped by walls and bodies), or stays; then
    // he must be clear of the platform's new box, shoved out if need be.
    const others = solids.filter((object) => !moving.has(object));
    const pos = [...player.pos];
    if (carriesPlayer) for (const axis of [0, 1, 2]) moveAxis(pos, player.size, axis, delta[axis], grid, others, player);
    const shoved = this.shove(pos, player.size, box, grid, others, player);
    if (!shoved) return { ok: false, squeezed: true };
    return { ok: true, crates, player: shoved };
  }

  /**
   * What rides on the platform: resting pushables and enemies on top of it,
   * and whatever rests on those; whether the wizard stands on any of them;
   * and whether an enemy is stepping on or off (the platform waits for it).
   * @param {object[]} objects room objects and live enemies
   * @param {object|null} player the wizard, or null when he can't ride (dead)
   */
  riders(objects, player) {
    const carriers = [this];
    const crates = [];
    let stepping = false;
    for (let i = 0; i < carriers.length; i++) {
      const under = carriers[i].box();
      for (const object of objects) {
        if (carriers.includes(object) || !restsOn(object.box(), under)) continue;
        if (object.state === 'walk') stepping = true;
        if (object.state !== 'rest') continue;
        carriers.push(object);
        crates.push(object);
      }
    }
    const carriesPlayer = !!player && carriers.some((carrier) => restsOn(player.box(), carrier.box()));
    return { crates, carriesPlayer, stepping };
  }

  /**
   * The wizard's feet center clear of the platform box `box`, shoved by at
   * most PLATFORM.maxShove, or null if he is pinned (physics/collision.js).
   */
  shove(pos, size, box, grid, others, player) {
    return shoveClear(pos, size, box, grid, others, player, PLATFORM.maxShove);
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

/** Does box `a` rest on top of box `b`: bottom on its top, footprints overlapping? */
function restsOn(a, b) {
  return Math.abs(a[1][0] - b[1][1]) < EPS && overlaps(a[0], b[0]) && overlaps(a[2], b[2]);
}

/** Round a coordinate that is a hair off a whole cell, so carried objects stay on the grid. */
function snap(v) {
  const whole = Math.round(v);
  return Math.abs(v - whole) < 1e-9 ? whole : v;
}
