/**
 * A gate block (D140, D141): one 1×1×1 block of a block type with kind
 * "gate" that comes and goes. Pure logic, one call to update() per tick.
 * What makes it go is its type's `trigger`:
 *
 * - "switch" (a gate): solid until its switches are all on, then gone
 *   until one goes off. Which switches: the `switches` of its room block
 *   entry (ids of the room's targets and plates), or every switch in the
 *   room. An `inverted` one (a bridge) is the other way round: there
 *   only while they are all on. The game powers it (power(),
 *   updateSwitches() in switches.js).
 * - "step" (a collapsing block, D47): the wizard standing on it makes it
 *   shake, then it is gone; with `regrow` it comes back that many seconds
 *   later. Only the wizard triggers it: crates resting on it don't, and
 *   fall when it goes. Once shaking it goes even if he steps off.
 *
 *   solid ──trigger──► (shake, a step block) ──► gone ──back──► solid
 *
 * Coming back it never traps anything: while the wizard, his decoy, a
 * crate or an enemy is in its cell it waits, and comes back once the cell
 * is clear. While gone it is no body at all (`solid` false: the game
 * leaves it out of the bodies others collide with).
 */
import { cellBox, overlapsBox, restsOn } from '../physics/collision.js';

/** Tuning values (ticks, 60 per second). */
export const GATE = {
  /** Ticks a step block shakes after the wizard steps on it, before it goes. */
  shakeTicks: 30,
};

export class Gate {
  /**
   * @param {object} object runtime room object (id, type, at, trigger, inverted, regrow, switches, style...)
   */
  constructor(object) {
    this.object = object;
    this.id = object.id;
    this.kind = object.kind;
    this.size = [1, 1, 1];
    /** Lower corner [x, y, z]; it never moves. */
    this.pos = [...object.at];
    this.prev = [...this.pos];
    /** 'switch' (powered by switches) or 'step' (gives way under the wizard). */
    this.trigger = object.trigger ?? 'switch';
    /** A bridge: there only while powered (switch gates only). */
    this.inverted = !!object.inverted;
    /** Ids of the switches that power it, or null for every switch in the room (switch gates only). */
    this.switches = object.switches ?? null;
    /** Ticks from going to coming back (step blocks with `regrow`), or null if it stays gone. */
    this.regrowTicks = object.regrow === undefined ? null : Math.round(object.regrow * 60);
    /** 'solid' | 'shake' | 'gone'. Every switch starts off, so a gate starts solid and a bridge gone. */
    this.state = this.inverted ? 'gone' : 'solid';
    /** Ticks spent in the current state. */
    this.timer = 0;
  }

  /** Whether it is there to collide with and stand on: not while gone. */
  get solid() {
    return this.state !== 'gone';
  }

  /** Will it come back once gone: a switch gate always can, a step block only with `regrow`. */
  get returns() {
    return this.trigger === 'switch' || this.regrowTicks !== null;
  }

  /** Nothing moves: prev stays pos. */
  savePrevious() {}

  box() {
    return cellBox(this.pos);
  }

  /** Go to `state`, starting its timer. */
  enter(state) {
    this.state = state;
    this.timer = 0;
  }

  /** Is its cell clear of every one of `bodies` (but itself)? */
  clear(bodies) {
    const box = this.box();
    for (const body of bodies) if (body !== this && overlapsBox(body.box(), box)) return false;
    return true;
  }

  /**
   * One fixed tick. A step block shakes, goes and comes back; a switch
   * gate only counts its time (power() switches it).
   * @param {import('../game.js').Game} game the wizard and the bodies
   * @returns {'shake'|'collapse'|'regrow'|null} event
   */
  update({ player, bodies }) {
    this.timer++;
    if (this.trigger !== 'step') return null;
    if (this.state === 'solid') {
      if (player.dead || !player.grounded || !restsOn(player.box(), this.box())) return null;
      this.enter('shake');
      return 'shake';
    }
    if (this.state === 'shake') {
      if (this.timer < GATE.shakeTicks) return null;
      this.enter('gone');
      return 'collapse';
    }
    if (this.regrowTicks === null || this.timer < this.regrowTicks || !this.clear(bodies)) return null;
    this.enter('solid');
    return 'regrow';
  }

  /**
   * A switch gate's switches are all on (`powered`) or not: go or come
   * back to match, but come back only once nothing is in its cell.
   * @param {boolean} powered
   * @param {Iterable<{ box(): number[][] }>} bodies what it must not trap
   * @returns {'open'|'close'|null} what it did: open (gone) or close (solid)
   */
  power(powered, bodies) {
    if (this.trigger !== 'switch') return null;
    const solid = this.inverted ? powered : !powered;
    if (solid === this.solid) return null;
    if (solid && !this.clear(bodies)) return null;
    this.enter(solid ? 'solid' : 'gone');
    return solid ? 'close' : 'open';
  }
}
