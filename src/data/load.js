/**
 * Turn the raw data files into the game's content tables, after validating
 * them. Plain logic (no Vite features), so tests can call it with fixtures.
 */
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
 * @returns {{ objectTypes: object, biomes: object, world: object, rooms: Map<string, object>,
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

  const links = new Map();
  for (const pair of files['world.json'].connections) {
    const [a, b] = pair.map((ref) => {
      const [room, exit] = ref.split('.');
      return { room, exit };
    });
    links.set(pair[0], b);
    links.set(pair[1], a);
  }

  return {
    objectTypes: files['defs.json'].objects,
    biomes: files['biomes.json'].biomes,
    world: files['world.json'],
    rooms,
    links,
  };
}
