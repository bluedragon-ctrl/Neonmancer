/**
 * Switches (D69, D75, D140): room objects that power what is linked to
 * them (a locked exit, a gate, a platform; by default every switch in the
 * room, updateSwitches() in switches.js). Their state resets with the
 * room. Pure logic.
 *
 * - Target: a fixed 1×1×1 block. A Zap bolt stopping at it switches it on,
 *   the next one off again. It is a body like a crate (the wizard, crates
 *   and enemies stand on it, bolts stop at it) but can't be pushed.
 * - Plate: a floor tile, flush with the floor like a hole. It is on while
 *   something stands on it: a crate, an enemy or the wizard, with the
 *   middle of its footprint over the tile and its feet on the floor. It is
 *   no body: things move over it as over the floor. A heavy plate (D200,
 *   `weight` 2) needs that many bodies in its column, each resting on the
 *   floor or on the one below; with some but not enough it is `partial`.
 *
 * - Socket (D194): a hole that is a switch. Its tile is a hole (the room
 *   adds it to its holes) and it is on while that hole is filled: a crate
 *   dropped in plugs it for good, a compiled crate for its 7 s. No body.
 *   A decoy can't fill a hole and a frozen enemy pushed in is lost, so
 *   only a crate powers it.
 *
 * A timed switch (a type with `timer`, D140) stays on for that many
 * seconds and then goes off by itself: a target from the bolt that
 * switched it on (another bolt starts the time again), a plate from the
 * moment nothing stands on it any more.
 */
import { REST_EPS, cellBox } from '../physics/collision.js';

/** Object kinds that are switches. */
export const SWITCH_KINDS = ['target', 'plate', 'socket'];

/** Switch kinds that may be timed (D140): a socket follows its hole. */
export const TIMED_SWITCH_KINDS = ['target', 'plate'];

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
    /** Ticks a timed switch stays on (D140), or 0 for a plain one. */
    this.timerTicks = object.timer ? Math.round(object.timer * 60) : 0;
    /** Ticks left before a timed switch goes off; 0 while it is not counting. */
    this.left = 0;
  }

  /** Is it a timed switch (D140)? */
  get timed() {
    return this.timerTicks > 0;
  }

  /** Share of its time left (1 → 0) while a timed switch counts down, else null. */
  get countdown() {
    return this.left > 0 ? this.left / this.timerTicks : null;
  }

  /**
   * Count a timed switch down one tick.
   * @returns {'switch'|null} event when it went off
   */
  tick() {
    if (this.left === 0) return null;
    this.left--;
    if (this.left > 0) return null;
    this.on = false;
    return 'switch';
  }

  /** Nothing moves: prev stays pos. */
  savePrevious() {}

  box() {
    return cellBox(this.pos);
  }

  /** The game sets plates (press()) and bolts hit targets; a timed target counts down by itself. */
  update() {
    return null;
  }
}

export class Target extends Switch {
  constructor(object) {
    super(object);
    /** Bolts that hit it so far (the view flashes on each). */
    this.hits = 0;
  }

  /**
   * A bolt stopped at it: it switches over; a timed one switches on and
   * starts its time again (D140).
   * @returns {'switch'} event
   */
  hit() {
    this.hits++;
    if (this.timed) {
      this.on = true;
      this.left = this.timerTicks;
    } else this.on = !this.on;
    return 'switch';
  }

  /** A timed target goes off once its time is up. */
  update() {
    return this.tick();
  }
}

export class Plate extends Switch {
  constructor(object) {
    super(object);
    /** Is something standing on it now (a timed plate is on a while longer)? */
    this.held = false;
    /** The weight it needs (D200): the bodies in its column. */
    this.weight = object.weight ?? 1;
    /** The bodies in its column at the last weighing. */
    this.load = 0;
  }

  /** Some weight on it but not enough (D200): a heavy plate flickers. */
  get partial() {
    return this.load > 0 && this.load < this.weight;
  }

  /** A timed plate counts down only once nothing stands on it. */
  get countdown() {
    return this.held ? null : super.countdown;
  }

  /** No body: nothing collides with it or stands on it. */
  get solid() {
    return false;
  }

  /**
   * The bodies in its column among `boxes` (collision boxes of things that
   * can stand on it): the one on the floor of its tile (footprint middle
   * over the tile), the one resting on that, and so on up the stack (D200).
   * @param {Iterable<number[][]>} boxes
   * @returns {number}
   */
  count(boxes) {
    const [x, y, z] = this.pos;
    const column = [];
    for (const box of boxes) {
      const [bx, by, bz] = box;
      const mx = (bx[0] + bx[1]) / 2;
      const mz = (bz[0] + bz[1]) / 2;
      if (mx >= x && mx < x + 1 && mz >= z && mz < z + 1) column.push(by);
    }
    column.sort((p, q) => p[0] - q[0]);
    let level = y;
    let count = 0;
    for (const by of column) {
      if (by[0] > level + REST_EPS) break;
      if (Math.abs(by[0] - level) >= REST_EPS) continue;
      count++;
      level = by[1];
    }
    return count;
  }

  /** Is it pressed by `boxes`: enough weight in its column? */
  pressedBy(boxes) {
    return this.count(boxes) >= this.weight;
  }

  /**
   * Weigh `boxes` for this tick: the load it remembers (for its flicker)
   * and whether it is pressed.
   * @param {Iterable<number[][]>} boxes
   */
  weigh(boxes) {
    this.load = this.count(boxes);
    return this.load >= this.weight;
  }

  /**
   * Set whether it is pressed. A timed plate stays on while pressed and
   * counts down from the moment it is not (D140).
   * @param {boolean} pressed
   * @returns {'switch'|null} event when it changed
   */
  press(pressed) {
    this.held = pressed;
    if (this.timed) {
      if (!pressed) return this.left > 0 ? this.tick() : null;
      this.left = this.timerTicks;
    }
    if (pressed === this.on) return null;
    this.on = pressed;
    return 'switch';
  }
}

export class Socket extends Switch {
  /** No body: its tile is a hole, and the crate that fills it is the floor. */
  get solid() {
    return false;
  }

  /**
   * Set whether its hole is filled (updateSwitches() in switches.js).
   * @param {boolean} filled
   * @returns {'switch'|null} event when it changed
   */
  fill(filled) {
    if (filled === this.on) return null;
    this.on = filled;
    return 'switch';
  }
}
