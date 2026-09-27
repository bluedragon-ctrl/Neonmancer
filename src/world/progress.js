/**
 * What the wizard has for the whole game (D67, D71): the permanent pickups
 * he found, one save bit each. Room resets and death leave it alone; the
 * save key (Phase 4) holds exactly these bits. Spells he knows follow from
 * the data disks found. Plain logic, no browser.
 *
 * A bit identifies an item, not a placement: the same item may lie in
 * several rooms, and finding it anywhere grays it out everywhere.
 */

/**
 * The save bits in blocks (D71): where each block starts and how many bits
 * it has. A block's index comes from what the item unlocks: a spell's
 * `slot` (defs.json spells) for its data disk; later a buff's or a piece of
 * equipment's slot on its pickup type, and a fragment's number on the
 * placement.
 */
export const SAVE_BLOCKS = {
  spells: { start: 0, size: 16 },
  buffs: { start: 16, size: 16 },
  equipment: { start: 32, size: 16 },
  fragments: { start: 48, size: 64 },
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
  return null;
}

export class Progress {
  /** @param {Iterable<number>} [found] bits found so far (a loaded save) */
  constructor(found = []) {
    /** @type {Set<number>} */
    this.found = new Set(found);
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
}
