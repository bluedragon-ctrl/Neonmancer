/**
 * Occupancy grid of a runtime room: which unit cells are solid, and which
 * floor tiles are holes.
 *
 * Solid are static block cells and everything outside the
 * room's side walls and below the floor. Above the room height is open
 * (a jump at the top of a 6-high room must not bump into nothing).
 * Exit openings in the boundary come with flip-screen exits (step 6).
 * Pushable objects are not in the grid: they move, so they collide as
 * bodies (see physics/collision.js).
 */

const key = (x, y, z) => `${x},${y},${z}`;

export class Grid {
  /**
   * @param {object} room runtime room (see world/room.js)
   * @param {number[]} room.size [x, y, z]
   * @param {number[][]} room.cells static block cells [x, y, z]
   * @param {number[][]} room.holes hole tiles [x, z]
   */
  constructor({ size, cells, holes }) {
    this.size = size;
    this.cells = new Set(cells.map(([x, y, z]) => key(x, y, z)));
    this.holes = new Set(holes.map(([x, z]) => `${x},${z}`));
  }

  /** Is the cell with integer coordinates [x, y, z] solid? */
  isSolid(x, y, z) {
    const [w, , d] = this.size;
    if (y < 0 || x < 0 || z < 0 || x >= w || z >= d) return true;
    return this.cells.has(key(x, y, z));
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
