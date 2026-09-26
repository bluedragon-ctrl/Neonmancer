/**
 * Occupancy grid of a runtime room: which unit cells are solid, and which
 * floor tiles are holes.
 *
 * Solid are static block cells and everything outside the room's side
 * walls and below the floor, except the openings of exits (the row of
 * cells just beyond the side, so the wizard can walk through). Above the
 * room height is open (a jump at the top of a 6-high room must not bump
 * into nothing).
 * Pushable objects are not in the grid: they move, so they collide as
 * bodies (see physics/collision.js).
 *
 * Collision asks isSolid() many times per tick, so cells are one flat typed
 * array covering the room plus a one-cell ring around its sides (where exit
 * openings are), not string-keyed sets.
 */
import { exitCells } from '../data/room-data.js';

export class Grid {
  /**
   * @param {object} room runtime room (see world/room.js)
   * @param {number[]} room.size [x, y, z]
   * @param {number[][]} room.cells static block cells [x, y, z]
   * @param {number[][]} room.holes hole tiles [x, z]
   * @param {object[]} [room.exits] exits with defaults applied
   */
  constructor({ size, cells, holes, exits = [] }) {
    this.size = size;
    [this.w, this.h, this.d] = size;
    const { w, h, d } = this;

    /** 1 where solid, for x in −1..w, y in 0..h−1, z in −1..d (see index()). */
    this.solid = new Uint8Array((w + 2) * h * (d + 2));
    for (let y = 0; y < h; y++) {
      for (let x = -1; x <= w; x++) {
        for (let z = -1; z <= d; z++) if (!this.isInside(x, z)) this.solid[this.index(x, y, z)] = 1;
      }
    }
    for (const exit of exits) {
      for (const [x, y, z] of exitCells(exit, size).outside) if (y >= 0 && y < h) this.solid[this.index(x, y, z)] = 0;
    }
    for (const [x, y, z] of cells) if (this.isInside(x, z) && y >= 0 && y < h) this.solid[this.index(x, y, z)] = 1;

    /** Floor tiles: 1 where there is a hole, index z * w + x. */
    this.holes = new Uint8Array(w * d);
    for (const [x, z] of holes) if (this.isInside(x, z)) this.holes[z * w + x] = 1;
  }

  /** Index into `solid` of a cell within the room or its ring. */
  index(x, y, z) {
    return (y * (this.d + 2) + z + 1) * (this.w + 2) + x + 1;
  }

  /** Is the cell with integer coordinates [x, y, z] solid? */
  isSolid(x, y, z) {
    if (y < 0 || x < -1 || z < -1 || x > this.w || z > this.d) return true;
    if (y >= this.h) return !this.isInside(x, z);
    return this.solid[this.index(x, y, z)] === 1;
  }

  /** Is the column [x, z] (integers) inside the room's sides? */
  isInside(x, z) {
    return x >= 0 && z >= 0 && x < this.w && z < this.d;
  }

  /** Is the floor tile containing the point (x, z) a hole? */
  isHole(x, z) {
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    return this.isInside(tx, tz) && this.holes[tz * this.w + tx] === 1;
  }

  /** A block dropped into the hole tile [x, z]: it is floor from now on (D18). */
  fillHole(x, z) {
    if (this.isInside(x, z)) this.holes[z * this.w + x] = 0;
  }
}
