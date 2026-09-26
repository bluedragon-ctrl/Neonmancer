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
