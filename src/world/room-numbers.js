/**
 * Room numbers (D111): the access key names the saved room by a number
 * (8 bits), from world.json `numbers` (room id → 0–255). A number stays
 * with its room id for good: a deleted room's entry stays in the table, so
 * no later room takes its number, and an old key naming it starts in the
 * start room. Plain logic, no browser.
 */

/** The highest room number the key's 8-bit field holds. */
export const MAX_ROOM_NUMBER = 255;

/**
 * The table with a number for every room in `ids`: the numbers it has are
 * kept, a room without one gets the next number after the highest ever
 * given (so a deleted room's number is never reused).
 * @param {Record<string, number>} [numbers] world.json `numbers`
 * @param {Iterable<string>} ids the rooms
 * @returns {Record<string, number>} a new table (the same entries when nothing was missing)
 */
export function numberRooms(numbers = {}, ids) {
  const table = { ...numbers };
  let next = Math.max(-1, ...Object.values(table)) + 1;
  for (const id of ids) if (!Object.hasOwn(table, id)) table[id] = next++;
  return table;
}

/**
 * Merge an editor's table into the one on disk (tools/room-save.js): the
 * disk's entries win; an edited entry counts only for a room the disk
 * doesn't number yet and with a number nobody has. The rest of `ids` get
 * new numbers.
 * @param {Record<string, number>} [disk]
 * @param {Record<string, number>} [edited]
 * @param {Iterable<string>} ids every room
 */
export function mergeRoomNumbers(disk = {}, edited = {}, ids) {
  const table = { ...disk };
  const used = new Set(Object.values(table));
  for (const [id, number] of Object.entries(edited)) {
    if (Object.hasOwn(table, id) || used.has(number)) continue;
    table[id] = number;
    used.add(number);
  }
  return numberRooms(table, ids);
}

/**
 * The room with a number, or null (a deleted room, or none ever had it).
 * @param {Record<string, number>} numbers
 * @param {number} number
 * @param {{ has(id: string): boolean }} rooms the rooms there are
 */
export function roomOfNumber(numbers, number, rooms) {
  const id = Object.keys(numbers).find((key) => numbers[key] === number);
  return id !== undefined && rooms.has(id) ? id : null;
}
