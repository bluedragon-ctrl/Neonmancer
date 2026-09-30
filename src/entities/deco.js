/**
 * A decoration (D117): a data pillar, a screen. A fixed body as big as its
 * look (DECO_LOOKS): the wizard walks round it or stands on it, things
 * bump into it and bolts stop at it. It does nothing else. Pure logic.
 */
import { DECO_LOOKS } from '../data/room-data.js';

export class Deco {
  /**
   * @param {object} object runtime room object (id, type, at, look, face, color...)
   */
  constructor(object) {
    this.object = object;
    this.id = object.id;
    this.kind = object.kind;
    this.size = [...DECO_LOOKS[object.look].size];
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
