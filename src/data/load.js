/**
 * Turn the raw data files into the game's content tables, after validating
 * them. Plain logic (no Vite features), so tests can call it with fixtures.
 */
import { resolveBlockTypes, resolveEnemyTemplates, resolveObjectTypes } from './room-data.js';
import { validateData } from './validate.js';

/** Thrown when the game data is invalid; `errors` lists every problem. */
export class DataError extends Error {
  /** @param {string[]} errors */
  constructor(errors) {
    super(`Invalid game data (${errors.length} problem${errors.length === 1 ? '' : 's'})`);
    this.name = 'DataError';
    this.errors = errors;
  }
}

/**
 * @param {Record<string, any>} files parsed JSON keyed by path relative to data/
 * @param {object} [options]
 * @param {boolean} [options.dev] keep the dev wing (world.json `dev`, D147):
 *   true by default (tests, tools, the dev server); a build for players
 *   passes false and gets the world without it
 * @returns {{ score: { bit: number, secret: number, accessLevel: number }, objectTypes: object, blockTypes: object, enemyTemplates: object, spells: object, pickupTypes: object, biomes: object, world: object, strings: Record<string, string>,
 *   lore: Record<string, { title?: string, lines: string[] }>,
 *   audio: { music: object, sounds: object },
 *   rooms: Map<string, object>,
 *   links: Map<string, { room: string, exit: string }> }} `links` maps "room.exit" to the exit
 *   it is connected to (both ways round)
 */
export function loadGameData(files, { dev = true } = {}) {
  const errors = validateData(files);
  if (errors.length > 0) throw new DataError(errors);
  if (!dev) files = withoutDevWing(files);

  const rooms = new Map();
  for (const [file, room] of Object.entries(files)) {
    if (file.startsWith('rooms/')) rooms.set(room.id, room);
  }

  return {
    score: files['defs.json'].score,
    objectTypes: resolveObjectTypes(files['defs.json'].objects),
    // Variants filled in from their base types (D60).
    blockTypes: resolveBlockTypes(files['defs.json'].blocks),
    // Enemy templates filled in from the ones they extend (D58, D79).
    enemyTemplates: resolveEnemyTemplates(files['defs.json'].enemies ?? {}),
    spells: files['defs.json'].spells,
    pickupTypes: files['defs.json'].pickups ?? {},
    biomes: files['biomes.json'].biomes,
    world: files['world.json'],
    strings: files['strings.json'].strings,
    // Screen texts (D118).
    lore: files['lore.json']?.texts ?? {},
    // Music and sound effects (D138); the file is optional.
    audio: { music: files['audio.json']?.music ?? {}, sounds: files['audio.json']?.sounds ?? {} },
    rooms,
    links: linkMap(files['world.json'].connections),
  };
}

/**
 * Where each exit leads, both ways round.
 * @param {string[][]} connections pairs of "room.exit" (world.json)
 * @returns {Map<string, { room: string, exit: string }>} "room.exit" → the exit it is connected to
 */
export function linkMap(connections) {
  const links = new Map();
  for (const pair of connections) {
    const [a, b] = pair.map((ref) => {
      const [room, exit] = ref.split('.');
      return { room, exit };
    });
    links.set(pair[0], b);
    links.set(pair[1], a);
  }
  return links;
}

/**
 * The data files without the dev wing (D147): its rooms, their connections
 * and map positions are left out, and an exit that led into the wing is
 * left out of its room, so it is plain wall. Data that was validated whole
 * stays valid: nothing else refers to a room or an exit.
 * @param {Record<string, any>} files parsed JSON keyed by path relative to data/
 * @returns {Record<string, any>} `files` itself if the world has no dev wing
 */
export function withoutDevWing(files) {
  const world = files['world.json'];
  const dev = new Set(world.dev ?? []);
  if (dev.size === 0) return files;

  const roomOf = (ref) => ref.split('.')[0];
  const leaving = world.connections.filter((pair) => pair.some((ref) => dev.has(roomOf(ref))));
  // Exits of player rooms that lost their connection.
  const sealed = new Set(leaving.flat().filter((ref) => !dev.has(roomOf(ref))));
  const connections = world.connections.filter((pair) => !leaving.includes(pair));
  const positions = Object.fromEntries(Object.entries(world.positions ?? {}).filter(([id]) => !dev.has(id)));

  const result = { ...files, 'world.json': { ...world, connections, positions } };
  for (const [file, room] of Object.entries(files)) {
    if (!file.startsWith('rooms/')) continue;
    if (dev.has(room.id)) delete result[file];
    else if (room.exits?.some((exit) => sealed.has(`${room.id}.${exit.id}`))) {
      result[file] = { ...room, exits: room.exits.filter((exit) => !sealed.has(`${room.id}.${exit.id}`)) };
    }
  }
  return result;
}
