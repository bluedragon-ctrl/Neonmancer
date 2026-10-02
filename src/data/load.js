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
 * @returns {{ score: { bit: number, secret: number, accessLevel: number }, objectTypes: object, blockTypes: object, enemyTemplates: object, spells: object, pickupTypes: object, biomes: object, world: object, strings: Record<string, string>,
 *   lore: Record<string, { title?: string, lines: string[] }>,
 *   audio: { music: object, sounds: object },
 *   rooms: Map<string, object>,
 *   links: Map<string, { room: string, exit: string }> }} `links` maps "room.exit" to the exit
 *   it is connected to (both ways round)
 */
export function loadGameData(files) {
  const errors = validateData(files);
  if (errors.length > 0) throw new DataError(errors);

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
