/**
 * A jump pad (D221): a floor tile, flush with the floor or the top of a
 * block like a plate, and the one place the wizard may jump in a room
 * without a free jump (room data `"jump": "pads"`). It is no body: things
 * move over it as over the floor, and a crate on it just stands there.
 * Pure logic.
 */

/** Feet this close to a pad's level count as standing on it. */
const LEVEL_EPS = 1e-3;

export class Pad {
  /**
   * @param {object} object runtime room object (id, type, at, color...)
   */
  constructor(object) {
    this.object = object;
    this.id = object.id;
    this.kind = object.kind;
    this.size = [1, 1, 1];
    /** Lower corner [x, y, z] of the cell he stands in on it; it never moves. */
    this.pos = [...object.at];
    this.prev = [...this.pos];
    /** Jumps off it so far (the view flashes on each). */
    this.jumps = 0;
  }

  /** No body: nothing collides with it or stands on it. */
  get solid() {
    return false;
  }

  /** Nothing moves: prev stays pos. */
  savePrevious() {}

  box() {
    const [x, y, z] = this.pos;
    return [
      [x, x + 1],
      [y, y + 0.05],
      [z, z + 1],
    ];
  }

  /**
   * Is a body with its feet center at `pos` standing on it: the middle of
   * its footprint over the tile, its feet at the tile's level?
   * @param {number[]} pos feet center
   */
  under([px, py, pz]) {
    const [x, y, z] = this.pos;
    return px >= x && px < x + 1 && pz >= z && pz < z + 1 && Math.abs(py - y) < LEVEL_EPS;
  }

  update() {
    return null;
  }
}
