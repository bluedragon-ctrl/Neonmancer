/**
 * Patrol behavior: walk the waypoints of a path (the shared path format,
 * world/path.js), cell by cell, and turn back when the way is blocked.
 * Pure logic.
 *
 * Only x and z of the waypoints count: an enemy walks on whatever ground
 * it finds (it may have fallen off a ledge on the way), and heads for the
 * next waypoint's column. It pauses `pause` seconds at the ends: both ends
 * of a ping-pong path, the start of a loop. Knocked off its path (a
 * chaser that was after the wizard), it finds its way back round walls
 * (the enemy's route(), D80).
 *
 * Its own waypoint stepping, not world/path.js: platforms glide along a
 * path by distance, an enemy steps cell by cell and turns back when blocked.
 */
import { DT } from '../core/loop.js';

export class Patrol {
  /**
   * @param {number[]} at the enemy's start cell [x, y, z]
   * @param {{ points: number[][], mode?: string, pause?: number }} [path] none: it stays put
   */
  constructor(at, path) {
    /** Waypoint columns [x, z], starting with `at`. */
    this.waypoints = path ? [at, ...path.points].map(([x, , z]) => [x, z]) : [];
    this.loop = path?.mode === 'loop';
    this.pauseTicks = Math.round((path?.pause ?? 0) / DT);
    /** Index of the waypoint it heads for. */
    this.target = 1;
    /** +1 forwards through the waypoints, −1 back. */
    this.dir = 1;
    /** Ticks left to wait at an end. */
    this.wait = 0;
  }

  /**
   * The next step from the column [x, z]: [dx, dz] with one of them ±1, or
   * null to stay (no path, or pausing at an end).
   * @param {number} x
   * @param {number} z
   * @param {object} [senses] unused (see behaviors.js)
   * @param {(column: number[]) => number[]|null} [route] first step of a
   *   shortest walk to a column (Enemy.route()), used off the path
   * @returns {number[]|null}
   */
  next(x, z, senses, route) {
    if (this.waypoints.length < 2) return null;
    if (this.wait > 0) {
      this.wait--;
      return null;
    }
    if (this.at(x, z)) {
      const end = this.isEnd(this.target);
      this.advance();
      if (end && this.pauseTicks > 0) {
        this.wait = this.pauseTicks - 1;
        return null;
      }
      if (this.at(x, z)) return null; // hemmed in on a one-cell path
    }
    const [tx, tz] = this.waypoints[this.target];
    // Off its path: the way back round walls, if there is one.
    const back = route && !this.onPath(x, z) ? route([tx, tz]) : null;
    if (back) return back;
    // Along x first, then z: a leg runs along one axis.
    return tx !== x ? [Math.sign(tx - x), 0] : [0, Math.sign(tz - z)];
  }

  /** Is the column [x, z] on one of its legs (between two waypoints, or back to the start on a loop)? */
  onPath(x, z) {
    const { waypoints } = this;
    const legs = this.loop ? waypoints.length : waypoints.length - 1;
    for (let i = 0; i < legs; i++) {
      const [ax, az] = waypoints[i];
      const [bx, bz] = waypoints[(i + 1) % waypoints.length];
      const between = (v, a, b) => v >= Math.min(a, b) && v <= Math.max(a, b);
      if ((ax === bx && x === ax && between(z, az, bz)) || (az === bz && z === az && between(x, ax, bx))) return true;
    }
    return false;
  }

  /** The way was blocked: head back for the waypoint it came from. */
  turnBack() {
    if (this.waypoints.length < 2) return;
    this.target = this.wrap(this.target - this.dir);
    this.dir = -this.dir;
  }

  /** Is the column [x, z] the waypoint it heads for? */
  at(x, z) {
    const [tx, tz] = this.waypoints[this.target];
    return tx === x && tz === z;
  }

  /** Is waypoint `i` an end, where it pauses? */
  isEnd(i) {
    return this.loop ? i === 0 : i === 0 || i === this.waypoints.length - 1;
  }

  /** Head for the waypoint after the current target (ping-pong turns at the ends). */
  advance() {
    const n = this.waypoints.length;
    if (!this.loop && (this.target + this.dir < 0 || this.target + this.dir >= n)) this.dir = -this.dir;
    this.target = this.wrap(this.target + this.dir);
  }

  /** A waypoint index kept in range: wrapped on a loop, bounced on a ping-pong path. */
  wrap(i) {
    const n = this.waypoints.length;
    if (this.loop) return (i + n) % n;
    return Math.min(Math.max(i, 0), n - 1);
  }
}
