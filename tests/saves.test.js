import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeAnnouncements } from '../src/core/messages.js';
import { PLAYER } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { SAVE_STORAGE_KEY, hashKey, keyLink, storeKey, storedKey } from '../src/ui/saves.js';
import { saveBit } from '../src/world/progress.js';
import { readSave, roomAtCell, saveGame } from '../src/world/save-game.js';
import { decodeKey, encodeKey } from '../src/world/save-key.js';
import { SPELLS, gameData, roomFile } from './helpers.js';

/** Three rooms on the map: alpha [0, 0] (the start), beta [-3, 2], delta [1, 0]. */
const content = () =>
  gameData({
    rooms: [roomFile('alpha'), roomFile('beta'), roomFile('delta')],
    positions: { alpha: [0, 0], beta: [-3, 2], delta: [1, 0] },
  });

/** A small in-memory Storage. */
function memoryStorage() {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)) };
}

test('a game saves as a key and loads back: the room reset, what he found, access, backups', () => {
  const data = content();
  const game = new Game(data);
  game.enterRoom('beta');
  const bits = [saveBit('spells', SPELLS.zap.slot), saveBit('fragments', 3), saveBit('secrets', 1)].sort((a, b) => a - b);
  for (const bit of bits) game.progress.collect(bit);
  game.progress.accessLevel = 2;
  game.player.backups = 3;
  game.player.integrity = 1;
  const key = saveGame(game);
  assert.deepEqual(decodeKey(key), { ok: true, save: { cell: [-3, 2], access: 2, found: bits, backups: 3 } });

  const save = readSave(data, key.toLowerCase().replace(/-/g, ' '));
  assert.equal(save.ok, true);
  assert.equal(save.key, key, 'written out tidy');
  game.enterRoom('alpha');
  takeAnnouncements();
  game.reset(save.options);
  assert.equal(game.room.id, 'beta');
  assert.deepEqual([...game.progress.found].sort((a, b) => a - b), bits);
  assert.equal(game.progress.accessLevel, 2);
  assert.equal(game.player.backups, 3);
  assert.equal(game.player.integrity, game.player.maxIntegrity, 'full integrity');
  assert.equal(game.player.energy, game.player.maxEnergy);
  assert.deepEqual(game.player.spells, ['zap']);
});

test('a new game has full backups; a key never gives more than full', () => {
  const data = content();
  const game = new Game(data);
  game.reset();
  assert.equal(game.player.backups, PLAYER.backups);
  game.reset(readSave(data, encodeKey({ cell: [0, 0], access: 0, found: [], backups: 15 })).options);
  assert.equal(game.player.backups, PLAYER.backups);
  game.reset(readSave(data, encodeKey({ cell: [0, 0], access: 0, found: [], backups: 0 })).options);
  assert.equal(game.player.backups, 0);
});

test('a key for a cell with no room in it any more loads in the start room', () => {
  const data = content();
  assert.equal(roomAtCell(data, [1, 0]), 'delta');
  assert.equal(roomAtCell(data, [5, 5]), null);
  assert.equal(readSave(data, encodeKey({ cell: [5, 5], access: 0, found: [], backups: 4 })).options.start, 'alpha');
  assert.equal(readSave(data, encodeKey({ cell: [1, 0], access: 0, found: [], backups: 4 })).options.start, 'delta');
});

test('a refused key says why', () => {
  const data = content();
  assert.deepEqual(readSave(data, ''), { ok: false, error: 'empty' });
  assert.deepEqual(readSave(data, 'ABC'), { ok: false, error: 'length' });
  const key = saveGame(new Game(data));
  const typo = (key[0] === '0' ? '1' : '0') + key.slice(1);
  assert.deepEqual(readSave(data, typo), { ok: false, error: 'checksum' });
});

test('keys in the browser: localStorage (blocked storage is fine), the URL hash, a link', () => {
  const storage = memoryStorage();
  assert.equal(storedKey(storage), null);
  storeKey('AB-CD', storage);
  assert.equal(storage.getItem(SAVE_STORAGE_KEY), 'AB-CD');
  assert.equal(storedKey(storage), 'AB-CD');
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(storedKey(blocked), null);
  assert.doesNotThrow(() => storeKey('AB', blocked));

  assert.equal(hashKey(''), null);
  assert.equal(hashKey('#'), null);
  assert.equal(hashKey('#2DE0-279E'), '2DE0-279E');
  assert.equal(hashKey('#2DE0%20279E'), '2DE0 279E');
  assert.equal(hashKey('#%E0'), '%E0', 'a stray % is left for the key check');
  assert.equal(keyLink('K1', 'https://example.test/game/?x=1#OLD'), 'https://example.test/game/?x=1#K1');
});
