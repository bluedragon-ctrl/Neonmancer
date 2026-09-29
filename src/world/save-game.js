/**
 * Saving and loading a game (D105, D106, D111): a Game as an access key and
 * back. The key holds what the wizard has (world/save-key.js), never the
 * state of a room or the map; the room is named by its cell on the world
 * map. Plain logic, no browser (ui/saves.js keeps keys in the URL and
 * localStorage).
 */
import { mapKey } from './map.js';
import { Progress } from './progress.js';
import { decodeKey, encodeKey } from './save-key.js';

/**
 * The access key of the game as it is now: his room's map cell
 * (world.json `positions`), access level, the permanent pickups found and
 * the backups left.
 * @param {import('../game.js').Game} game
 * @returns {string}
 */
export function saveGame(game) {
  const { content, player, progress, room } = game;
  const cell = content.world.positions?.[room.id];
  if (!cell) throw new Error(`room "${room.id}" has no position in world.json`);
  return encodeKey({ cell, access: progress.accessLevel, found: progress.found, backups: player.backups });
}

/**
 * The room in a map cell, or null (a room moved or deleted since the save).
 * @param {object} content loaded game data
 * @param {number[]} cell [x, z]
 */
export function roomAtCell(content, cell) {
  const key = mapKey(cell);
  const positions = content.world.positions ?? {};
  return Object.keys(positions).find((id) => mapKey(positions[id]) === key && content.rooms.has(id)) ?? null;
}

/**
 * Read a key for loading: the Game.reset() options it starts with (the
 * saved room, reset; what he found; his backups) and the key written out
 * again in its tidy form. A cell with no room in it any more starts in
 * the start room.
 * @param {object} content loaded game data
 * @param {string} text the key as typed, pasted or taken from the URL hash
 * @returns {{ ok: true, key: string, options: { start: string, progress: Progress, backups: number } }
 *   | { ok: false, error: 'empty' | 'length' | 'character' | 'checksum' | 'version' }}
 */
export function readSave(content, text) {
  const read = decodeKey(text);
  if (!read.ok) return read;
  const { save } = read;
  return {
    ok: true,
    key: encodeKey(save),
    options: {
      start: roomAtCell(content, save.cell) ?? content.world.start,
      progress: new Progress(save.found, save.access),
      backups: save.backups,
    },
  };
}
