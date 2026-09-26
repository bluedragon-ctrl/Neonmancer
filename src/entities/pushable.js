/**
 * A pushable object: one 1×1×1 block that rests, slides one cell when
 * pushed, falls when nothing holds it, and plugs a hole it drops into.
 * Pure logic, one call to update() per fixed tick.
 *
 *   rest ──push──► slide ──arrive──► rest
 *   rest ──no support──► fall ──land──► rest
 *                               └─into a hole──► plugged (floor from now on)
 */
import { DT } from '../core/loop.js';
import { overlaps, surfaceBelow } from '../physics/collision.js';

/** Tuning values (units, seconds). */
export const PUSHABLE = {
  /** Sliding speed in units per second; slower than walking, so the wizard visibly pushes. */
  slideSpeed: 3,
  gravity: 30,
  maxFall: 18,
};

/** Heights closer than this count as equal. */
const EPS = 1e-4;

export class Pushable {
  /**
   * @param {object} object runtime room object (id, type, at, style...)
   */
  constructor(object) {
    this.object = object;
    this.id = object.id;
    this.kind = object.kind;
    this.size = [1, 1, 1];
    /** Lower corner [x, y, z]; x and z stay on the grid except while sliding. */
    this.pos = [...object.at];
    /** Position at the previous tick, for render interpolation. */
    this.prev = [...this.pos];
    /** 'rest' | 'slide' | 'fall' | 'plugged' */
    this.state = 'rest';
    this.vy = 0;
    /** While sliding: the cell it slides into. */
    this.target = null;
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
   * Does something rest on top of this object (D4)? Anything whose bottom
   * touches our top over our footprint counts, including the player.
   * @param {Iterable<{ box(): number[][] }>} bodies
   */
  hasLoad(bodies) {
    const [bx, by, bz] = this.box();
    for (const body of bodies) {
      if (body === this) continue;
      const [ox, oy, oz] = body.box();
      if (Math.abs(oy[0] - by[1]) < EPS && overlaps(bx, ox) && overlaps(bz, oz)) return true;
    }
    return false;
  }

  /**
   * Try to push the object one cell along [dx, dz]. Only a resting,
   * supported object with nothing on top moves, into a free cell (D4).
   * @param {number[]} dir [dx, dz], one of them ±1
   * @param {{ grid: import('../world/grid.js').Grid, bodies: Iterable<{ box(): number[][] }> }} world
   * @returns {boolean} whether it started sliding
   */
  push([dx, dz], { grid, bodies }) {
    if (this.state !== 'rest' || this.hasLoad(bodies)) return false;
    const [x, y, z] = this.pos;
    const target = [x + dx, y, z + dz];
    // Resting objects sit on whole cells, except on top of the player.
    if (!Number.isInteger(y) || grid.isSolid(...target)) return false;
    // Objects never leave through an exit: rooms reset, so they would be lost.
    if (!grid.isInside(target[0], target[2])) return false;
    if (this.support(grid, bodies) < y - EPS) return false; // about to fall
    if (overlapsAny(boxAt(target), bodies, this)) return false;
    this.state = 'slide';
    this.target = target;
    return true;
  }

  /**
   * One fixed tick.
   * @param {{ grid: import('../world/grid.js').Grid, bodies: Iterable<{ box(): number[][] }> }} world
   * @returns {string|null} event: 'land', 'plug' or null
   */
  update({ grid, bodies }) {
    this.savePrevious();

    if (this.state === 'slide') {
      const step = PUSHABLE.slideSpeed * DT;
      const next = this.pos.map((p, i) => {
        const t = this.target[i];
        return Math.abs(t - p) <= step ? t : p + Math.sign(t - p) * step;
      });
      // Something stepped into the way (the player jumping in): wait.
      if (overlapsAny(boxAt(next), bodies, this)) return null;
      this.pos = next;
      if (next.every((p, i) => p === this.target[i])) {
        this.state = 'rest';
        this.target = null;
        this.startFalling(grid, bodies); // off a ledge or onto a hole: fall right away
      }
      return null;
    }

    if (this.state === 'rest') {
      this.startFalling(grid, bodies);
      return null;
    }

    if (this.state === 'fall') {
      const support = this.support(grid, bodies);
      this.vy = Math.max(this.vy - PUSHABLE.gravity * DT, -PUSHABLE.maxFall);
      const y = this.pos[1] + this.vy * DT;
      if (y > support) {
        this.pos[1] = y;
        return null;
      }
      this.pos[1] = support;
      this.vy = 0;
      if (support < 0) {
        // Dropped into a hole: it fills it and becomes floor (D18).
        this.state = 'plugged';
        grid.fillHole(this.pos[0], this.pos[2]);
        return 'plug';
      }
      this.state = 'rest';
      return 'land';
    }

    return null; // plugged: part of the floor now
  }

  /** Start falling if nothing holds the object up. */
  startFalling(grid, bodies) {
    if (this.support(grid, bodies) < this.pos[1] - EPS) {
      this.state = 'fall';
      this.vy = 0;
    }
  }

  /**
   * Height this object would rest at: the highest surface under it, or −1
   * (the bottom of a hole) above a hole tile at floor level.
   */
  support(grid, bodies) {
    const top = surfaceBelow(this.box(), grid, bodies, this);
    const [x, , z] = this.pos;
    if (top === 0 && grid.isHole(x + 0.5, z + 0.5)) return -1;
    return top;
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

/** Does the box overlap any body except `self`? */
function overlapsAny(box, bodies, self) {
  for (const body of bodies) {
    if (body === self) continue;
    const other = body.box();
    if (box.every((range, i) => overlaps(range, other[i]))) return true;
  }
  return false;
}
