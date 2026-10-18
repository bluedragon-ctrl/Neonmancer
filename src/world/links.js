/**
 * Exit connections worked out from the world map (D259): an exit leads to
 * the room in the next map cell in its direction (+x east, +z south, as in
 * a room), into that room's exit in the opposite side. Several exits in
 * one side pair up in order along it (by `at`, then floor level). Nothing
 * lists the pairs by hand: moving a room on the map rewires it. Pure logic.
 */
import { OPPOSITE_SIDE, withExitDefaults } from '../data/room-data.js';
import { mapKey } from './map.js';

/** The map step [dx, dz] of each side. */
export const SIDE_STEP = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

/**
 * A room's exits in one side, in pairing order: along the side, then up.
 * @param {object} room room data
 * @param {string} side
 * @returns {{ exit: object, index: number }[]} with defaults applied; index in the room's exits
 */
function sideExits(room, side) {
  return (room?.exits ?? [])
    .map((exit, index) => ({ exit: withExitDefaults(exit), index }))
    .filter(({ exit }) => exit.side === side)
    .sort((a, b) => a.exit.at - b.exit.at || a.exit.y - b.exit.y);
}

/**
 * Every pair of connected exits, and every exit that can't be paired.
 * @param {Record<string, number[]>} positions room id → map cell [x, z] (world.json)
 * @param {Map<string, object>|Iterable<[string, object]>} rooms room id → room data
 * @returns {{ pairs: string[][], problems: { room: string, index: number, message: string }[] }}
 *   pairs of "room.exit", the +x or +z side first; problems by room and exit index
 */
export function deriveConnections(positions, rooms) {
  const byId = new Map(rooms);
  const cells = new Map(Object.entries(positions ?? {}).filter(([id]) => byId.has(id)).map(([id, cell]) => [mapKey(cell), id]));
  const pairs = [];
  const problems = [];
  for (const [id, room] of byId) {
    const cell = positions?.[id];
    for (const side of Object.keys(SIDE_STEP)) {
      const own = sideExits(room, side);
      if (own.length === 0) continue;
      const step = SIDE_STEP[side];
      const next = cell && cells.get(mapKey([cell[0] + step[0], cell[1] + step[1]]));
      if (!next) {
        const where = cell ? `no room in the next map cell [${cell[0] + step[0]},${cell[1] + step[1]}]` : 'the room has no map cell';
        for (const { exit, index } of own) problems.push({ room: id, index, message: `exit "${exit.id}" leads nowhere: ${where}` });
        continue;
      }
      const theirs = sideExits(byId.get(next), OPPOSITE_SIDE[side]);
      own.forEach(({ exit, index }, i) => {
        const other = theirs[i];
        if (!other) {
          problems.push({ room: id, index, message: `exit "${exit.id}" has no exit to lead to in "${next}"'s ${OPPOSITE_SIDE[side]} side (${own.length} here, ${theirs.length} there)` });
          return;
        }
        // Each pair once, from its +x or +z end; the checks below from both ends.
        if (side.startsWith('+')) pairs.push([`${id}.${exit.id}`, `${next}.${other.exit.id}`]);
        if (other.exit.width !== exit.width) problems.push({ room: id, index, message: `exit "${exit.id}" must be as wide as "${next}.${other.exit.id}" (${exit.width} and ${other.exit.width})` });
        if (exit.oneWay && other.exit.oneWay) problems.push({ room: id, index, message: `exit "${exit.id}" and "${next}.${other.exit.id}" are both one-way: neither leads anywhere` });
      });
    }
  }
  return { pairs, problems };
}

/**
 * The exit `ref` is connected to, or null.
 * @param {string[][]} pairs from deriveConnections()
 * @param {string} ref "room.exit"
 */
export function partnerOf(pairs, ref) {
  const pair = pairs.find((p) => p.includes(ref));
  return pair ? pair[pair[0] === ref ? 1 : 0] : null;
}
