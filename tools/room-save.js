/**
 * Saving from the in-game editor (dev server only, D56, D57, D58): the
 * edited rooms, world.json and defs.json (enemy templates) are checked together with the rest of data/
 * (schemas, then the game's own checks) and written only if everything
 * passes. New rooms get a new file.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatJson } from '../src/editor/format-json.js';
import { checkFiles, readDataFiles, readSchemas } from './check-data.js';

export { SAVE_URL } from '../src/editor/save.js';

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
 * Check edited rooms, world.json and defs.json against the data on disk
 * and write them if everything is valid.
 * @param {string} root project root
 * @param {{ rooms?: any[], world?: any, defs?: any }} edits from the editor: whole room files, and world.json
 *   and defs.json if they changed
 * @returns {{ ok: boolean, errors: string[], files: string[] }} `files`: the paths written, relative to root
 */
export function saveEdits(root, { rooms = [], world, defs } = {}) {
  if (!Array.isArray(rooms) || (rooms.length === 0 && !world && !defs)) return { ok: false, errors: ['nothing to save'], files: [] };
  const { files, errors: readErrors } = readDataFiles(root);
  const names = [];
  for (const room of rooms) {
    const id = room?.id;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)) return { ok: false, errors: ['a room has no valid id'], files: [] };
    names.push(`rooms/${id}.json`);
    files[`rooms/${id}.json`] = room;
  }
  for (const [name, data] of [['world.json', world], ['defs.json', defs]]) {
    if (!data) continue;
    names.push(name);
    files[name] = data;
  }
  const errors = [...readErrors, ...checkFiles(files, readSchemas(root))];
  if (errors.length > 0) return { ok: false, errors, files: [] };
  for (const name of names) writeFileSync(join(root, 'data', name), formatJson(files[name]));
  return { ok: true, errors: [], files: names.map((name) => `data/${name}`) };
}
