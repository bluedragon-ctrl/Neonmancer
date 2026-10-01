/**
 * A pickup in a room (D71): it hovers in its cell and the wizard takes it
 * by touching it. Permanent ones (data disks, buff chips, upgrade cards,
 * fragments, secrets) have a save bit; one already found shows as a ghost
 * and can't be taken again. Temporary ones (refills) have none and come
 * back when the room resets. A boss's drop (D104) is held, unseen and out
 * of reach, until the boss is beaten; then it falls into its cell. Pure logic.
 */

/** Sizes in units. */
export const PICKUP = {
  /** The box he must touch: this far in from the cell's sides, and from its bottom and top. */
  inset: 0.2,
  insetY: 0.1,
  /** Ticks a boss's drop takes to fall into its cell (D104). */
  dropTicks: 36,
};

/**
 * A buff's color by the stat it raises (D93, D94): the color of the HUD bar
 * it improves, as the refills have, so the player reads it at a glance:
 * integrity light blue; energy and its recharge yellow-green. Its chip,
 * install animation and banner use it.
 */
export const BUFF_COLORS = { integrity: '#00f0ff', energy: '#b6ff3c', recharge: '#b6ff3c' };

/** The score's gold in the HUD (D100); the CSS has it as --gold. */
export const SCORE_COLOR = '#ffe23d';

/**
 * A secret's color (D100): the wizard's magenta (D98), for its star,
 * install animation and banner.
 */
export const SECRET_COLOR = '#ff2bd6';

/**
 * Key fragments and access levels (D101) in the score's gold: a fragment's
 * shard, its banner, the core's crystal, the digit on an access lock and
 * the bands on the wizard's hat. Only accents: the core itself is white (a
 * mechanism, D99), as gold is too close to Home Lattice's amber for an object.
 */
export const FRAGMENT_COLOR = SCORE_COLOR;

export class Pickup {
  /**
   * @param {object} data built by buildRoom(): kind, spell or stat and amount, id, type, at
   * @param {number|null} bit its save bit, null for a temporary one
   * @param {boolean} found permanent and found already: a ghost
   */
  constructor(data, bit, found) {
    this.data = data;
    this.bit = bit;
    /** 'idle' (can be taken), 'ghost' (found before), 'taken' (this visit) or 'held' (by a boss, D104). */
    this.state = found ? 'ghost' : 'idle';
    /** Ticks since he took it, for its pick-up effect; null until then. */
    this.takenTicks = null;
    /** Ticks since a boss dropped it (it falls into its cell), or null. */
    this.droppedTicks = null;
  }

  /** A boss holds it until it is beaten (D104): unseen, and it can't be taken. */
  hold() {
    this.state = 'held';
  }

  /** The boss holding it was beaten: it falls into its cell, and he can take it once it is there. */
  release() {
    this.state = 'idle';
    this.droppedTicks = 0;
  }

  /** Can he take it now: not taken, found or held, and not still falling? */
  get takeable() {
    return this.state === 'idle' && (this.droppedTicks === null || this.droppedTicks >= PICKUP.dropTicks);
  }

  /** Box he takes it by touching. */
  box() {
    const { inset, insetY } = PICKUP;
    const [x, y, z] = this.data.at;
    return [
      [x + inset, x + 1 - inset],
      [y + insetY, y + 1 - insetY],
      [z + inset, z + 1 - inset],
    ];
  }

  /** He took it. */
  take() {
    this.state = 'taken';
    this.takenTicks = 0;
  }

  /** One tick: its pick-up effect runs on. */
  update() {
    if (this.takenTicks !== null) this.takenTicks++;
    if (this.droppedTicks !== null) this.droppedTicks++;
  }
}
