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
 */
import { exitCells } from '../data/room-data.js';

const key = (x, y, z) => `${x},${y},${z}`;

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
    this.cells = new Set(cells.map(([x, y, z]) => key(x, y, z)));
    this.holes = new Set(holes.map(([x, z]) => `${x},${z}`));
    /** Cells beyond the sides that are open because an exit is there. */
    this.openings = new Set(exits.flatMap((exit) => exitCells(exit, size).outside.map((c) => key(...c))));
  }

  /** Is the cell with integer coordinates [x, y, z] solid? */
  isSolid(x, y, z) {
    if (y < 0) return true;
    if (!this.isInside(x, z)) return !this.openings.has(key(x, y, z));
    return this.cells.has(key(x, y, z));
  }

  /** Is the column [x, z] (integers) inside the room's sides? */
  isInside(x, z) {
    const [w, , d] = this.size;
    return x >= 0 && z >= 0 && x < w && z < d;
  }

  /** Is the floor tile containing the point (x, z) a hole? */
  isHole(x, z) {
    return this.holes.has(`${Math.floor(x)},${Math.floor(z)}`);
  }

  /** A block dropped into the hole tile [x, z]: it is floor from now on (D18). */
  fillHole(x, z) {
    this.holes.delete(`${x},${z}`);
  }
}
