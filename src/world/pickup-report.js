/**
 * Where the permanent pickups lie in the world (the world map tool's
 * pickup report, F3): every item defined in defs.json by its save bit, the
 * rooms it is placed in, and which ones are not placed yet or placed more
 * than once. A duplicate is allowed (a bit is the item, not the place,
 * D71), but usually a mistake, so the report points it out. Refills are
 * counted per room. Plain logic, no browser.
 */
import { SAVE_BLOCKS, pickupBit } from './progress.js';

/** The block a save bit is in, and its index there. */
export function bitBlock(bit) {
  for (const [block, { start, size }] of Object.entries(SAVE_BLOCKS)) {
    if (bit >= start && bit < start + size) return { block, slot: bit - start };
  }
  return null;
}

/**
 * @param {Record<string, object>} pickupTypes defs.json "pickups"
 * @param {Record<string, { slot: number }>} spells defs.json "spells"
 * @param {Iterable<[string, object]>} rooms room id → room data (its `pickups`)
 * @returns {{
 *   items: { bit: number, block: string, slot: number, types: string[], places: { room: string, id: string, at: number[] }[] }[],
 *   refills: { type: string, places: { room: string, id: string, at: number[] }[] }[],
 *   unknown: { room: string, id: string, type: string }[],
 * }} items: permanent ones in bit order, `places` empty when not placed;
 *   refills: by type; unknown: pickups of a type defs.json doesn't have
 */
export function pickupReport(pickupTypes, spells, rooms) {
  /** bit → item */
  const items = new Map();
  /** refill type → places */
  const refills = new Map();
  /** type id → its bit, or null for a refill */
  const bits = new Map();
  for (const [type, data] of Object.entries(pickupTypes)) {
    // A disk naming an unknown spell has no bit to report (validation says so).
    if (data.kind === 'disk' && !spells[data.spell]) continue;
    const bit = pickupBit(data, spells);
    bits.set(type, bit);
    if (bit === null) {
      refills.set(type, []);
      continue;
    }
    const item = items.get(bit) ?? { bit, ...bitBlock(bit), types: [], places: [] };
    item.types.push(type);
    items.set(bit, item);
  }
  const unknown = [];
  for (const [room, data] of rooms) {
    for (const { id, type, at } of data.pickups ?? []) {
      if (!bits.has(type)) {
        unknown.push({ room, id, type });
        continue;
      }
      const place = { room, id, at: [...at] };
      const bit = bits.get(type);
      if (bit === null) refills.get(type).push(place);
      else items.get(bit).places.push(place);
    }
  }
  return {
    items: [...items.values()].sort((a, b) => a.bit - b.bit),
    refills: [...refills].map(([type, places]) => ({ type, places })),
    unknown,
  };
}
