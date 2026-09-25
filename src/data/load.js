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
 * @returns {{ objectTypes: object, biomes: object, world: object, rooms: Map<string, object> }}
 */
export function loadGameData(files) {
  const errors = validateData(files);
  if (errors.length > 0) throw new DataError(errors);

  const rooms = new Map();
  for (const [file, room] of Object.entries(files)) {
    if (file.startsWith('rooms/')) rooms.set(room.id, room);
  }
  return {
    objectTypes: files['defs.json'].objects,
    biomes: files['biomes.json'].biomes,
    world: files['world.json'],
    rooms,
  };
}
