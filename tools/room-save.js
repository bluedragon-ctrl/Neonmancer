/**
 * Saving from the in-game editor (dev server only, D56, D57, D58): the
 * edited rooms, world.json and defs.json (enemy templates) are checked together with the rest of data/
 * (schemas, then the game's own checks) and written only if everything
 * passes. New rooms get a new file. The world map tool (D66) sends moved
 * rooms' positions, merged into world.json as it is on disk, and (D77) the
 * rooms it added, changed (exits) or removed, with world.json when its
 * connections changed. Screen texts (D118) go to lore.json.
 */
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatJson } from '../src/editor/format-json.js';
import { checkFiles, readDataFiles, readSchemas } from './check-data.js';

export { DATA_SAVED_EVENT, SAVE_URL } from '../src/editor/save.js';

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
 * Check edited rooms, world.json, defs.json and lore.json against the data on disk
 * and write them if everything is valid.
 * @param {string} root project root
 * @param {{ rooms?: any[], world?: any, defs?: any, lore?: any, positions?: Record<string, number[]>, remove?: string[] }} edits from the editor: whole
 *   room files, and world.json, defs.json and lore.json if they changed; from the world map tool: map positions of the rooms it moved or added,
 *   whole files of rooms it added or changed, ids of rooms to delete, and world.json if its connections changed
 * @returns {{ ok: boolean, errors: string[], files: string[] }} `files`: the paths written or deleted, relative to root
 */
export function saveEdits(root, { rooms = [], world, defs, lore, positions, remove = [] } = {}) {
  if (!Array.isArray(rooms) || !Array.isArray(remove) || (rooms.length === 0 && remove.length === 0 && !world && !defs && !lore && !positions)) {
    return { ok: false, errors: ['nothing to save'], files: [] };
  }
  const { files, errors: readErrors } = readDataFiles(root);
  if (positions !== undefined && (typeof positions !== 'object' || positions === null || Array.isArray(positions))) {
    return { ok: false, errors: ['positions: not a map of room ids to cells'], files: [] };
  }
  const removed = [];
  for (const id of remove) {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)) return { ok: false, errors: ['a removed room has no valid id'], files: [] };
    if (!files[`rooms/${id}.json`]) return { ok: false, errors: [`no room ${id} to remove`], files: [] };
    if (rooms.some((room) => room?.id === id)) return { ok: false, errors: [`room ${id} is both saved and removed`], files: [] };
    delete files[`rooms/${id}.json`];
    removed.push(`rooms/${id}.json`);
  }
  const disk = files['world.json'];
  if (disk && (world || positions || removed.length > 0)) {
    // The world map tool owns where rooms are, the room editor the connections:
    // the editor's copy may be older than a move saved from the map, so only
    // its new rooms' cells count; the map's moves go into world.json as it is.
    const base = world ?? disk;
    world = { ...base, positions: { ...base.positions, ...(world ? disk.positions : {}), ...positions } };
    for (const id of remove) delete world.positions[id];
  }
  const names = [];
  for (const room of rooms) {
    const id = room?.id;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)) return { ok: false, errors: ['a room has no valid id'], files: [] };
    names.push(`rooms/${id}.json`);
    files[`rooms/${id}.json`] = room;
  }
  for (const [name, data] of [['world.json', world], ['defs.json', defs], ['lore.json', lore]]) {
    if (!data) continue;
    names.push(name);
    files[name] = data;
  }
  const errors = [...readErrors, ...checkFiles(files, readSchemas(root))];
  if (errors.length > 0) return { ok: false, errors, files: [] };
  for (const name of names) writeFileSync(join(root, 'data', name), formatJson(files[name]));
  for (const name of removed) rmSync(join(root, 'data', name));
  return { ok: true, errors: [], files: [...names, ...removed].map((name) => `data/${name}`) };
}
