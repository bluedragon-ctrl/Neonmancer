/**
 * Switches (D69, D75): room objects that unlock the room's locked exits
 * while every switch in the room is on (Game.updateSwitches()). Their
 * state resets with the room. Pure logic.
 *
 * - Target: a fixed 1×1×1 block. A Zap bolt stopping at it switches it on,
 *   the next one off again. It is a body like a crate (the wizard, crates
 *   and enemies stand on it, bolts stop at it) but can't be pushed.
 * - Plate: a floor tile, flush with the floor like a hole. It is on while
 *   something stands on it: a crate, an enemy or the wizard, with the
 *   middle of its footprint over the tile and its feet on the floor. It is
 *   no body: things move over it as over the floor.
 */
import { REST_EPS, cellBox } from '../physics/collision.js';

/** Object kinds that are switches. */
export const SWITCH_KINDS = ['target', 'plate'];

/** Shared by both switches: a fixed cell and an on/off state. */
class Switch {
  /**
   * @param {object} object runtime room object (id, type, at, color...)
   */
  constructor(object) {
    this.object = object;
    this.id = object.id;
    this.kind = object.kind;
    this.size = [1, 1, 1];
    /** Lower corner [x, y, z]; it never moves. */
    this.pos = [...object.at];
    this.prev = [...this.pos];
    this.on = false;
  }

  /** Nothing moves: prev stays pos. */
  savePrevious() {}

  box() {
    return cellBox(this.pos);
  }

  /** Nothing happens by itself; the game sets plates (press()) and bolts hit targets. */
  update() {
    return null;
  }
}

export class Target extends Switch {
  /**
   * A bolt stopped at it: it switches over.
   * @returns {'switch'} event
   */
  hit() {
    this.on = !this.on;
    return 'switch';
  }
}

export class Plate extends Switch {
  /** No body: nothing collides with it or stands on it. */
  get solid() {
    return false;
  }

  /**
   * Is it pressed by one of `boxes` (collision boxes of things that can
   * stand on it): feet on its tile's floor, footprint middle over the tile?
   * @param {Iterable<number[][]>} boxes
   */
  pressedBy(boxes) {
    const [x, y, z] = this.pos;
    for (const [bx, by, bz] of boxes) {
      const mx = (bx[0] + bx[1]) / 2;
      const mz = (bz[0] + bz[1]) / 2;
      if (Math.abs(by[0] - y) < REST_EPS && mx >= x && mx < x + 1 && mz >= z && mz < z + 1) return true;
    }
    return false;
  }

  /**
   * Set whether it is pressed.
   * @param {boolean} pressed
   * @returns {'switch'|null} event when it changed
   */
  press(pressed) {
    if (pressed === this.on) return null;
    this.on = pressed;
    return 'switch';
  }
}
