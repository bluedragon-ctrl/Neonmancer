/**
 * Saving and loading a game (D105, D111): a Game as an access key and back.
 * The key holds what the wizard has (world/save-key.js), never the state
 * of a room or the map. Plain logic, no browser (ui/saves.js keeps keys in
 * the URL and localStorage).
 */
import { Progress } from './progress.js';
import { roomOfNumber } from './room-numbers.js';
import { decodeKey, encodeKey } from './save-key.js';

/** The key's integrity field: 4 bits, at least 1. */
const MAX_KEY_INTEGRITY = 15;

/**
 * The access key of the game as it is now: his room (by its number,
 * world.json `numbers`), access level, the permanent pickups found and his
 * integrity. A wizard at 0 (derezzing) saves with 1.
 * @param {import('../game.js').Game} game
 * @returns {string}
 */
export function saveGame(game) {
  const { content, player, progress, room } = game;
  const number = content.world.numbers?.[room.id];
  if (number === undefined) throw new Error(`room "${room.id}" has no number in world.json`);
  return encodeKey({
    room: number,
    access: progress.accessLevel,
    found: progress.found,
    integrity: Math.max(1, Math.min(player.integrity, MAX_KEY_INTEGRITY)),
  });
}

/**
 * Read a key for loading: the Game.reset() options it starts with (the
 * saved room, reset; what he found; his integrity) and the key written
 * out again in its tidy form. A room number no room has any more (a
 * deleted room) starts in the start room.
 * @param {object} content loaded game data
 * @param {string} text the key as typed, pasted or taken from the URL hash
 * @returns {{ ok: true, key: string, options: { start: string, progress: Progress, integrity: number } }
 *   | { ok: false, error: 'empty' | 'length' | 'character' | 'checksum' | 'version' }}
 */
export function readSave(content, text) {
  const read = decodeKey(text);
  if (!read.ok) return read;
  const { save } = read;
  const start = roomOfNumber(content.world.numbers ?? {}, save.room, content.rooms) ?? content.world.start;
  return {
    ok: true,
    key: encodeKey(save),
    options: { start, progress: new Progress(save.found, save.access), integrity: save.integrity },
  };
}
