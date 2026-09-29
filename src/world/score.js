/**
 * The score (D100): what the wizard has, not what he did. Every permanent
 * pickup found is worth `bit` points, a secret `secret`, each access level
 * `accessLevel` (defs.json "score"). It is worked out from the save bits
 * whenever it is shown, so a loaded save scores exactly what it holds and
 * nothing counts twice. Plain logic, no browser.
 */
import { SAVE_BLOCKS, pickupBit } from './progress.js';

/**
 * Points for one permanent pickup.
 * @param {number} bit its save bit
 * @param {{ bit: number, secret: number }} values defs.json "score"
 */
export function bitPoints(bit, values) {
  const { start, size } = SAVE_BLOCKS.secrets;
  return bit >= start && bit < start + size ? values.secret : values.bit;
}

/**
 * The score.
 * @param {import('./progress.js').Progress} progress
 * @param {{ bit: number, secret: number, accessLevel: number }} values defs.json "score"
 */
export function scoreOf(progress, values) {
  let score = progress.accessLevel * values.accessLevel;
  for (const bit of progress.found) score += bitPoints(bit, values);
  return score;
}

/**
 * The save bits of every permanent pickup placed in some room: what 100%
 * means.
 * @param {Record<string, object>} pickupTypes defs.json "pickups"
 * @param {Record<string, { slot: number }>} spells defs.json "spells"
 * @param {Iterable<object>} rooms room data (their `pickups`)
 * @returns {Set<number>}
 */
export function placedBits(pickupTypes, spells, rooms) {
  const bits = new Set();
  for (const room of rooms) {
    for (const { type } of room.pickups ?? []) {
      const bit = pickupTypes[type] ? pickupBit(pickupTypes[type], spells) : null;
      if (bit !== null) bits.add(bit);
    }
  }
  return bits;
}

/**
 * How much of the world's permanent pickups he has found, in whole percent
 * (rounded down, so 100 means all of them); items placed nowhere don't
 * count.
 * @param {import('./progress.js').Progress} progress
 * @param {Set<number>} placed placedBits()
 */
export function completion(progress, placed) {
  if (placed.size === 0) return 0;
  let found = 0;
  for (const bit of placed) if (progress.has(bit)) found++;
  return Math.floor((found * 100) / placed.size);
}
