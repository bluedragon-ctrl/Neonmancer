/**
 * The player's map (D112): the rooms of this run, not the whole world.
 * Entering a room marks it visited; using a backup shrine reveals the
 * rooms around it on the world map, dimmed until visited. The run map is
 * never saved (D68): a new game or a loaded save starts it empty. Plain
 * logic; ui/map-screen.js draws the model mapModel() makes.
 */
import { sideAxes, withExitDefaults } from '../data/room-data.js';
import { pickupBit } from './progress.js';

/** A backup shrine reveals the rooms this many map cells away at most (|dx| + |dz|). */
export const SHRINE_REACH = 2;

/** A room's square on the map, in cells: a gap is left between neighbours. */
export const ROOM_SIZE = 0.7;

/** How far an exit's stub sticks out of its room, in cells. */
export const STUB_LENGTH = 0.09;

export class RunMap {
  constructor() {
    /** @type {Set<string>} rooms entered in this run */
    this.visited = new Set();
    /** @type {Set<string>} rooms a shrine showed; they stay for the run */
    this.revealed = new Set();
  }

  /** @param {string} id a room he entered */
  visit(id) {
    this.visited.add(id);
  }

  /** @param {Iterable<string>} ids rooms a shrine showed */
  reveal(ids) {
    for (const id of ids) this.revealed.add(id);
  }

  /** Is the room on the map (visited or revealed)? @param {string} id */
  shows(id) {
    return this.visited.has(id) || this.revealed.has(id);
  }
}

/**
 * The rooms within `reach` map cells of a room (|dx| + |dz|), itself too.
 * @param {Record<string, number[]>} positions room id → [x, z]
 * @param {string} id
 * @param {number} [reach]
 * @returns {string[]}
 */
export function roomsAround(positions, id, reach = SHRINE_REACH) {
  const center = positions[id];
  if (!center) return [id];
  return Object.entries(positions)
    .filter(([, [x, z]]) => Math.abs(x - center[0]) + Math.abs(z - center[1]) <= reach)
    .map(([other]) => other);
}

/**
 * Where an exit sits on its room's square on the map, and the way out:
 * on the side it is in, at its middle along that side.
 * @param {number[]} cell the room's [x, z]
 * @param {object} exit exit data (defaults applied)
 * @param {number[]} size the room's size
 * @returns {{ at: number[], out: number[] }} map point [x, z] and outward direction
 */
export function exitPoint([x, z], exit, size) {
  const { cross, along } = sideAxes(exit.side);
  const sign = exit.side[0] === '+' ? 1 : -1;
  const fraction = (exit.at + exit.width / 2) / size[along];
  // Map x is the room's x axis, map z its z axis (index 2).
  const point = { [cross]: sign * (ROOM_SIZE / 2), [along]: (fraction - 0.5) * ROOM_SIZE };
  const out = { [cross]: sign, [along]: 0 };
  return { at: [x + point[0], z + point[2]], out: [out[0], out[2]] };
}

/**
 * What the map screen draws: every room on the run's map with its cell and
 * look, and the connections between them. A visited room shows its exits
 * (a stub for each one that leads somewhere not on the map yet), a gold
 * mark while a fragment he hasn't found lies in it, and whether it has a
 * backup shrine; a revealed one only its outline.
 * @param {object} content loaded game data (data/load.js)
 * @param {RunMap} map
 * @param {object} state
 * @param {string} state.current the room he is in
 * @param {import('./progress.js').Progress} state.progress what he has found
 * @returns {{
 *   rooms: { id: string, name: string, cell: number[], color: string, visited: boolean, current: boolean, fragment: boolean, shrine: boolean }[],
 *   stubs: { at: number[], out: number[] }[],
 *   links: { from: number[], to: number[], adjacent: boolean, visited: boolean }[],
 * }} map points are [x, z] in cells
 */
export function mapModel(content, map, { current, progress }) {
  const { rooms: roomData, world, biomes, pickupTypes, spells } = content;
  const positions = world.positions ?? {};
  const shown = (id) => map.shows(id) && positions[id] && roomData.has(id);
  const rooms = [];
  const stubs = [];
  for (const [id, data] of roomData) {
    if (!shown(id)) continue;
    const visited = map.visited.has(id);
    const fragment =
      visited &&
      (data.pickups ?? []).some(({ type }) => {
        const pickup = pickupTypes[type];
        return pickup?.kind === 'fragment' && !progress.has(pickupBit(pickup, spells));
      });
    rooms.push({
      id,
      name: data.name,
      cell: positions[id],
      color: biomes[data.biome]?.color ?? '#ffffff',
      visited,
      current: id === current,
      fragment,
      shrine: visited && Boolean(data.shrine),
    });
    if (!visited) continue;
    for (const exit of data.exits ?? []) {
      const link = content.links.get(`${id}.${exit.id}`);
      if (link && shown(link.room)) continue;
      stubs.push(exitPoint(positions[id], withExitDefaults(exit), data.size));
    }
  }
  const links = [];
  for (const [a, b] of world.connections) {
    const [ra, ea] = a.split('.');
    const [rb, eb] = b.split('.');
    if (!shown(ra) || !shown(rb)) continue;
    const exitA = roomData.get(ra).exits?.find((exit) => exit.id === ea);
    const exitB = roomData.get(rb).exits?.find((exit) => exit.id === eb);
    if (!exitA || !exitB) continue;
    const [pa, pb] = [positions[ra], positions[rb]];
    links.push({
      from: exitPoint(pa, withExitDefaults(exitA), roomData.get(ra).size).at,
      to: exitPoint(pb, withExitDefaults(exitB), roomData.get(rb).size).at,
      adjacent: Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) === 1,
      visited: map.visited.has(ra) && map.visited.has(rb),
    });
  }
  return { rooms, stubs, links };
}
