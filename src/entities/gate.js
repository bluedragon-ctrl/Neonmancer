/**
 * A gate (D140): a 1×1×1 block that switches power. A plain gate is solid
 * until its switches are all on, then open (no body at all); an inverted
 * one (a bridge) is the other way round, there only while they are on.
 * Which switches: its own `switches` list (ids of the room's targets and
 * plates), or every switch in the room. Pure logic; the game powers it
 * (updateSwitches() in switches.js).
 *
 * It never closes on anything: while the wizard, his decoy, a crate or an
 * enemy is in its cell it waits, and closes once the cell is clear.
 */
import { cellBox, overlapsBox } from '../physics/collision.js';

export class Gate {
  /**
   * @param {object} object runtime room object (id, type, at, inverted, switches, color...)
   */
  constructor(object) {
    this.object = object;
    this.id = object.id;
    this.kind = object.kind;
    this.size = [1, 1, 1];
    /** Lower corner [x, y, z]; it never moves. */
    this.pos = [...object.at];
    this.prev = [...this.pos];
    /** A bridge: there only while powered. */
    this.inverted = !!object.inverted;
    /** Ids of the switches that power it, or null for every switch in the room. */
    this.switches = object.switches ?? null;
    /** Solid now? Every switch starts off, so a gate starts closed and a bridge open. */
    this.closed = !this.inverted;
  }

  /** Whether it is there to collide with and stand on. */
  get solid() {
    return this.closed;
  }

  /** Nothing moves: prev stays pos. */
  savePrevious() {}

  box() {
    return cellBox(this.pos);
  }

  /** Power comes from the game (power()); nothing happens by itself. */
  update() {
    return null;
  }

  /**
   * Its switches are all on (`powered`) or not: open or close to match,
   * but close only once nothing is in its cell.
   * @param {boolean} powered
   * @param {Iterable<{ box(): number[][] }>} bodies what it must not close on
   * @returns {'open'|'close'|null} what it did
   */
  power(powered, bodies) {
    const closed = this.inverted ? powered : !powered;
    if (closed === this.closed) return null;
    if (closed) {
      const box = this.box();
      for (const body of bodies) if (body !== this && overlapsBox(body.box(), box)) return null;
    }
    this.closed = closed;
    return closed ? 'close' : 'open';
  }
}
