/**
 * What the wizard has for the whole game (D67, D71): the permanent pickups
 * he found, one save bit each. Room resets and death leave it alone; the
 * save key (Phase 4) holds exactly these bits, and his access level (D91,
 * D101), which only the core raises. Spells he knows follow from the data
 * disks found, how much stronger he is from the buffs found.
 * Plain logic, no browser.
 *
 * A bit identifies an item, not a placement: the same item may lie in
 * several rooms, and finding it anywhere grays it out everywhere.
 */

/**
 * The save bits in blocks (D71): where each block starts and how many bits
 * it has. A block's index comes from what the item unlocks: a spell's
 * `slot` (defs.json spells) for its data disk; a buff's or an upgrade's
 * `slot` on its pickup type (D88, D95); a secret's or a fragment's `slot`
 * on its pickup type (D100, D101).
 */
export const SAVE_BLOCKS = {
  spells: { start: 0, size: 16 },
  buffs: { start: 16, size: 16 },
  upgrades: { start: 32, size: 16 },
  fragments: { start: 48, size: 64 },
  secrets: { start: 112, size: 16 },
};

/** Bits for permanent pickups in all. */
export const PICKUP_BITS = Object.values(SAVE_BLOCKS).reduce((sum, { size }) => sum + size, 0);

/**
 * Bit number of an item: its block's start plus its index.
 * @param {keyof SAVE_BLOCKS} block
 * @param {number} index
 */
export function saveBit(block, index) {
  const { start, size } = SAVE_BLOCKS[block];
  if (!Number.isInteger(index) || index < 0 || index >= size) throw new RangeError(`${block} index ${index} is outside 0–${size - 1}`);
  return start + index;
}

/**
 * The save bit of a pickup, or null for a temporary one (refills).
 * @param {object} type its pickup type (defs.json "pickups")
 * @param {Record<string, { slot: number }>} spells defs.json "spells"
 * @returns {number|null}
 */
export function pickupBit(type, spells) {
  if (type.kind === 'disk') return saveBit('spells', spells[type.spell].slot);
  if (type.kind === 'buff') return saveBit('buffs', type.slot);
  if (type.kind === 'upgrade') return saveBit('upgrades', type.slot);
  if (type.kind === 'secret') return saveBit('secrets', type.slot);
  if (type.kind === 'fragment') return saveBit('fragments', type.slot);
  return null;
}

export class Progress {
  /**
   * @param {Iterable<number>} [found] bits found so far (a loaded save)
   * @param {number} [accessLevel] his access level (a loaded save)
   */
  constructor(found = [], accessLevel = 0) {
    /** @type {Set<number>} */
    this.found = new Set(found);
    /**
     * Access level (D91, D101), 0–15: stored on its own, not counted from
     * the fragment bits, as the core raises it only when he touches it.
     */
    this.accessLevel = accessLevel;
  }

  /** @param {number} bit */
  has(bit) {
    return this.found.has(bit);
  }

  /**
   * Mark an item found.
   * @param {number} bit
   * @returns {boolean} whether it is new
   */
  collect(bit) {
    if (this.found.has(bit)) return false;
    this.found.add(bit);
    return true;
  }

  /**
   * The access level his fragments earn at the core (D101): how many of
   * the thresholds he has reached.
   * @param {number[]} thresholds world.json fragments.access, rising
   */
  earnedAccess(thresholds) {
    const found = this.count('fragments');
    return thresholds.filter((needed) => found >= needed).length;
  }

  /**
   * How many of the bits in a block he has found.
   * @param {keyof SAVE_BLOCKS} block
   */
  count(block) {
    const { start, size } = SAVE_BLOCKS[block];
    let n = 0;
    for (const bit of this.found) if (bit >= start && bit < start + size) n++;
    return n;
  }

  /**
   * The spells he knows: those whose disk was found, in slot order.
   * @param {Record<string, { slot: number }>} spells defs.json "spells"
   * @returns {string[]}
   */
  knownSpells(spells) {
    return Object.entries(spells)
      .filter(([, spell]) => this.has(saveBit('spells', spell.slot)))
      .sort(([, a], [, b]) => a.slot - b.slot)
      .map(([id]) => id);
  }

  /**
   * What the buffs found add up to (D93): integrity and energy added to
   * his maximum, and ticks taken off recharging a unit of energy.
   * @param {Record<string, object>} pickups defs.json "pickups"
   * @returns {{ integrity: number, energy: number, recharge: number }}
   */
  buffs(pickups) {
    const total = { integrity: 0, energy: 0, recharge: 0 };
    for (const type of Object.values(pickups)) {
      if (type.kind === 'buff' && this.has(saveBit('buffs', type.slot))) total[type.stat] += type.amount;
    }
    return total;
  }

  /**
   * The upgrades found (D95), by what they do: `upgrade` → its pickup type
   * (its spell and tuning, e.g. Zap+'s bounces).
   * @param {Record<string, object>} pickups defs.json "pickups"
   * @returns {Map<string, object>}
   */
  upgrades(pickups) {
    const found = new Map();
    for (const type of Object.values(pickups)) {
      if (type.kind === 'upgrade' && this.has(saveBit('upgrades', type.slot))) found.set(type.upgrade, type);
    }
    return found;
  }
}
