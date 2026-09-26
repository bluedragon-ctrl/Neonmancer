/**
 * Patrol behavior: walk the waypoints of a path (the shared path format,
 * world/path.js), cell by cell, and turn back when the way is blocked.
 * Pure logic.
 *
 * Only x and z of the waypoints count: an enemy walks on whatever ground
 * it finds (it may have fallen off a ledge on the way), and heads for the
 * next waypoint's column. It pauses `pause` seconds at the ends: both ends
 * of a ping-pong path, the start of a loop.
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
   * @returns {number[]|null}
   */
  next(x, z) {
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
    // Along x first, then z: a leg runs along one axis, and after a fall
    // off the path it finds its way back to the line the same way.
    return tx !== x ? [Math.sign(tx - x), 0] : [0, Math.sign(tz - z)];
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
