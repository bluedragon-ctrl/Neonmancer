/**
 * The player's map (D112): the rooms of this run, not the whole world.
 * Entering a room marks it visited; using a backup shrine reveals the
 * rooms around it on the world map, dimmed until visited. The run map is
 * never saved (D68): a new game or a loaded save starts it empty. Plain
 * logic; ui/map-screen.js draws the model mapModel() makes.
 */
import { pickupBit } from './progress.js';

/** A backup shrine reveals the rooms this many map cells away at most (|dx| + |dz|). */
export const SHRINE_REACH = 2;

/** A room's square on the map, in cells: a gap is left between neighbours (3 floor tiles of 5, render/map-view.js). */
export const ROOM_SIZE = 0.6;

/** How far an exit's stub sticks out of its room, in cells: half the gap. */
export const STUB_LENGTH = 0.2;

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
 * Where an exit's stub sits on its room's square on the map: the middle of
 * the side the exit is in (where along the wall it is doesn't matter on
 * the map), and the way out.
 * @param {number[]} cell the room's [x, z]
 * @param {string} side the exit's side ('-x', '+x', '-z', '+z')
 * @returns {{ at: number[], out: number[] }} map point [x, z] and outward direction
 */
export function sidePoint([x, z], side) {
  const sign = side[0] === '+' ? 1 : -1;
  const out = side[1] === 'x' ? [sign, 0] : [0, sign];
  return { at: [x + (out[0] * ROOM_SIZE) / 2, z + (out[1] * ROOM_SIZE) / 2], out };
}

/**
 * What the map screen draws: every room on the run's map with its cell and
 * look, and the connections between them, center to center. A visited
 * room shows a stub on each side with an exit that leads somewhere not on
 * the map yet, a gold
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
    // One stub per side, however many exits lead off the map there.
    const sides = new Set();
    for (const exit of data.exits ?? []) {
      const link = content.links.get(`${id}.${exit.id}`);
      if (link && shown(link.room)) continue;
      sides.add(exit.side);
    }
    for (const side of sides) stubs.push(sidePoint(positions[id], side));
  }
  // Center to center, like a grid; one line for two rooms however many exits join them.
  const links = [];
  const pairs = new Set();
  for (const [a, b] of world.connections) {
    const [ra, rb] = [a.split('.')[0], b.split('.')[0]];
    const pair = [ra, rb].sort().join('|');
    if (!shown(ra) || !shown(rb) || ra === rb || pairs.has(pair)) continue;
    pairs.add(pair);
    const [pa, pb] = [positions[ra], positions[rb]];
    links.push({
      from: pa,
      to: pb,
      adjacent: Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) === 1,
      visited: map.visited.has(ra) && map.visited.has(rb),
    });
  }
  return { rooms, stubs, links };
}
