/**
 * The central core (D101): a room object that takes the key fragments. It
 * is a fixed body 1×2×1, too high to jump onto with a single jump, so the
 * wizard walks up to it; things bump into it and bolts stop at it like at
 * a target. Placed with the room editor like any object; at most one lies
 * in the world. Touching it is what counts (touchCore() in game.js). Pure
 * logic.
 */
export class Core {
  /**
   * @param {object} object runtime room object (id, type, at, color, look...)
   */
  constructor(object) {
    this.object = object;
    this.id = object.id;
    this.kind = object.kind;
    this.size = [1, 2, 1];
    /** Lower corner [x, y, z]; it never moves. */
    this.pos = [...object.at];
    this.prev = [...this.pos];
  }

  /** Nothing moves: prev stays pos. */
  savePrevious() {}

  box() {
    return this.pos.map((p, i) => [p, p + this.size[i]]);
  }

  /** Nothing happens by itself. */
  update() {
    return null;
  }
}
