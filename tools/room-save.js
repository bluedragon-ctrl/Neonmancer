/**
 * Saving a room from the in-game editor (dev server only, D56): the room
 * is checked with the rest of data/ (schemas, then the game's own checks)
 * and written to data/rooms/<id>.json only if everything passes. Only
 * rooms that already exist can be saved for now.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatJson } from '../src/editor/format-json.js';
import { checkFiles, readDataFiles, readSchemas } from './check-data.js';

export { SAVE_ROOM_URL } from '../src/editor/save.js';

/**
 * Why a save request is refused, as an HTTP status, or 0 to go ahead. Only
 * the game's own page may save: a JSON POST (other sites can't send one
 * without the browser asking first) whose Origin, if any, is the dev server
 * itself. Other pages open in the browser can't overwrite rooms.
 * @param {{ method?: string, headers: Record<string, string|string[]|undefined> }} req
 * @returns {number}
 */
export function refuseSaveRequest({ method, headers }) {
  if (method !== 'POST') return 405;
  const { origin, host } = headers;
  if (origin !== undefined && origin !== `http://${host}` && origin !== `https://${host}`) return 403;
  if (!String(headers['content-type'] ?? '').startsWith('application/json')) return 415;
  return 0;
}

/**
 * Check a room against the data on disk and write it if it is valid.
 * @param {string} root project root
 * @param {any} room room data from the editor
 * @returns {{ ok: boolean, errors: string[], file?: string }} `file`: the path written, relative to root
 */
export function saveRoom(root, room) {
  const id = room?.id;
  if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)) return { ok: false, errors: ['the room has no valid id'] };
  const name = `rooms/${id}.json`;
  if (!existsSync(join(root, 'data', name))) return { ok: false, errors: [`${name}: no such room (the editor only saves existing rooms)`] };

  const { files, errors: readErrors } = readDataFiles(root);
  files[name] = room;
  const errors = [...readErrors, ...checkFiles(files, readSchemas(root))];
  if (errors.length > 0) return { ok: false, errors };
  writeFileSync(join(root, 'data', name), formatJson(room));
  return { ok: true, errors: [], file: `data/${name}` };
}
