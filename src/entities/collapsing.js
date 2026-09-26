/**
 * A collapsing block: one 1×1×1 block that gives way under the wizard
 * (D47). Pure logic, one call to update() per fixed tick.
 *
 *   solid ──wizard stands on it──► shake ──shakeTicks──► gone
 *     ▲                                                   │
 *     └───── regrow seconds passed and its cell is clear ─┘ (only with "regrow")
 *
 * Only the wizard triggers it: pushables resting on it don't, and fall
 * when it goes. Once shaking it vanishes even if he steps off. While gone
 * it is no body at all (`solid` false: the game leaves it out of the
 * bodies others collide with).
 */
import { cellBox, overlapsBox, restsOn } from '../physics/collision.js';

/** Tuning values (ticks, 60 per second). */
export const COLLAPSING = {
  /** Ticks it shakes after the wizard steps on it, before it vanishes. */
  shakeTicks: 30,
};

export class Collapsing {
  /**
   * @param {object} object runtime room object (id, type, at, regrow, style...)
   */
  constructor(object) {
    this.object = object;
    this.id = object.id;
    this.kind = object.kind;
    this.size = [1, 1, 1];
    /** Lower corner [x, y, z]; it never moves. */
    this.pos = [...object.at];
    /** Position at the previous tick, for render interpolation (always the same). */
    this.prev = [...this.pos];
    /** Ticks from vanishing to growing back, or null if it never does. */
    this.regrowTicks = object.regrow === undefined ? null : Math.round(object.regrow * 60);
    /** 'solid' | 'shake' | 'gone' */
    this.state = 'solid';
    /** Ticks spent in the current state. */
    this.timer = 0;
    /** Whether it has grown back at least once (the view plays the regrow). */
    this.regrown = false;
  }

  /** Whether it is there to collide with and stand on: not while gone. */
  get solid() {
    return this.state !== 'gone';
  }

  /** Keep this tick's start for render interpolation. */
  savePrevious() {
    for (let i = 0; i < 3; i++) this.prev[i] = this.pos[i];
  }

  /** Collision box [[minX, maxX], [minY, maxY], [minZ, maxZ]]. */
  box() {
    return cellBox(this.pos);
  }

  /** Start shaking (the wizard stepped on it); nothing happens unless it is solid and still. */
  trigger() {
    if (this.state !== 'solid') return false;
    this.state = 'shake';
    this.timer = 0;
    return true;
  }

  /**
   * One fixed tick.
   * @param {import('../game.js').Game} game the wizard and the bodies
   * @returns {'shake'|'collapse'|'regrow'|null} event
   */
  update({ player, bodies }) {
    this.savePrevious();
    this.timer++;
    if (this.state === 'solid') return this.stoodOnBy(player) && this.trigger() ? 'shake' : null;
    if (this.state === 'shake') {
      if (this.timer < COLLAPSING.shakeTicks) return null;
      this.state = 'gone';
      this.timer = 0;
      return 'collapse';
    }
    // Gone: grow back once the time is up and nothing is in its cell (it
    // would trap the wizard or a crate inside).
    if (this.regrowTicks === null || this.timer < this.regrowTicks) return null;
    const box = this.box();
    for (const body of bodies) {
      if (body !== this && overlapsBox(body.box(), box)) return null;
    }
    this.state = 'solid';
    this.timer = 0;
    this.regrown = true;
    return 'regrow';
  }

  /** Is the wizard standing on top: alive, grounded, feet on its top, footprints overlapping? */
  stoodOnBy(player) {
    if (player.dead || !player.grounded) return false;
    return restsOn(player.box(), this.box());
  }
}
