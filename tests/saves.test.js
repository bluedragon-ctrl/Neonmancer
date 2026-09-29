import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeAnnouncements } from '../src/core/messages.js';
import { MapEdit } from '../src/editor/map-edit.js';
import { newRoom } from '../src/editor/room-edit.js';
import { WorldEdit } from '../src/editor/world-edit.js';
import { Game } from '../src/game.js';
import { SAVE_STORAGE_KEY, hashKey, keyLink, storeKey, storedKey } from '../src/ui/saves.js';
import { saveBit } from '../src/world/progress.js';
import { mergeRoomNumbers, numberRooms, roomOfNumber } from '../src/world/room-numbers.js';
import { readSave, saveGame } from '../src/world/save-game.js';
import { decodeKey, encodeKey } from '../src/world/save-key.js';
import { saveEdits } from '../tools/room-save.js';
import { SPELLS, gameData, roomFile, testWorld, writeDataFiles } from './helpers.js';

/** Three rooms; beta is number 5, gamma was deleted (its number 2 stays taken). */
const content = () =>
  gameData({
    rooms: [roomFile('alpha'), roomFile('beta'), roomFile('delta')],
    numbers: { alpha: 0, gamma: 2, beta: 5, delta: 1 },
  });

/** A small in-memory Storage. */
function memoryStorage() {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)) };
}

test('room numbers: kept, new rooms after the highest ever given, so never a deleted one again', () => {
  assert.deepEqual(numberRooms({ a: 0, gone: 7 }, ['a', 'b', 'c']), { a: 0, gone: 7, b: 8, c: 9 });
  assert.deepEqual(numberRooms({}, ['a']), { a: 0 });
  assert.deepEqual(numberRooms(undefined, []), {});
  const rooms = new Set(['a', 'b']);
  assert.equal(roomOfNumber({ a: 0, gone: 7, b: 8 }, 8, rooms), 'b');
  assert.equal(roomOfNumber({ a: 0, gone: 7, b: 8 }, 7, rooms), null, 'a deleted room');
  assert.equal(roomOfNumber({ a: 0 }, 3, rooms), null, 'never given');
});

test('room numbers merged on save: the disk wins, a clash gets the next number', () => {
  // The map tool saved room x as 3 meanwhile; the editor's older copy gave its new room y 3 as well.
  assert.deepEqual(mergeRoomNumbers({ a: 0, b: 1, x: 3 }, { a: 0, b: 1, y: 3 }, ['a', 'b', 'x', 'y']), { a: 0, b: 1, x: 3, y: 4 });
  assert.deepEqual(mergeRoomNumbers({ a: 0 }, { a: 5, y: 2 }, ['a', 'y']), { a: 0, y: 2 });
});

test('a game saves as a key and loads back: the room reset, what he found, access, integrity', () => {
  const data = content();
  const game = new Game(data);
  game.enterRoom('beta');
  const bits = [saveBit('spells', SPELLS.zap.slot), saveBit('fragments', 3), saveBit('secrets', 1)].sort((a, b) => a - b);
  for (const bit of bits) game.progress.collect(bit);
  game.progress.accessLevel = 2;
  game.player.integrity = 3;
  const key = saveGame(game);
  assert.deepEqual(decodeKey(key), { ok: true, save: { room: 5, access: 2, found: bits, integrity: 3 } });

  const save = readSave(data, key.toLowerCase().replace(/-/g, ' '));
  assert.equal(save.ok, true);
  assert.equal(save.key, key, 'written out tidy');
  game.enterRoom('alpha');
  game.player.backups = 2;
  takeAnnouncements();
  game.reset(save.options);
  assert.equal(game.room.id, 'beta');
  assert.deepEqual([...game.progress.found].sort((a, b) => a - b), bits);
  assert.equal(game.progress.accessLevel, 2);
  assert.equal(game.player.integrity, 3);
  assert.equal(game.player.energy, game.player.maxEnergy);
  assert.deepEqual(game.player.spells, ['zap']);
  assert.equal(game.player.backups, 8, 'full backups');
});

test('saving a derezzed wizard keeps 1 integrity; loading clamps to his maximum', () => {
  const data = content();
  const game = new Game(data);
  game.player.integrity = 0;
  assert.equal(decodeKey(saveGame(game)).save.integrity, 1);
  const save = readSave(data, encodeKey({ room: 0, access: 0, found: [], integrity: 15 }));
  game.reset(save.options);
  assert.equal(game.player.integrity, game.player.maxIntegrity);
});

test('a key naming a deleted room, or a number no room has, loads in the start room', () => {
  const data = content();
  for (const room of [2, 200]) {
    assert.equal(readSave(data, encodeKey({ room, access: 0, found: [], integrity: 4 })).options.start, 'alpha');
  }
  assert.equal(readSave(data, encodeKey({ room: 1, access: 0, found: [], integrity: 4 })).options.start, 'delta');
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
  assert.equal(hashKey('#E907D4-41B4A7'), 'E907D4-41B4A7');
  assert.equal(hashKey('#E907D4%2041B4A7'), 'E907D4 41B4A7');
  assert.equal(hashKey('#%E0'), '%E0', 'a stray % is left for the key check');
  assert.equal(keyLink('K1', 'https://example.test/game/?x=1#OLD'), 'https://example.test/game/?x=1#K1');
});

test("the world map tool numbers new rooms and keeps a removed room's number taken", () => {
  const edit = new MapEdit(testWorld());
  const before = structuredClone(edit.world.numbers);
  const next = Math.max(...Object.values(before)) + 1;
  assert.equal(edit.addRoom('annex', [5, 5], 'home'), null);
  assert.equal(edit.world.numbers.annex, next);
  assert.ok(edit.changes().world, 'world.json goes with the save');
  assert.equal(edit.removeRoom('fault_line'), null);
  assert.equal(edit.world.numbers.fault_line, before.fault_line);
  assert.equal(edit.addRoom('annex_2', [6, 6], 'home'), null);
  assert.equal(edit.world.numbers.annex_2, next + 1);
  // Undo takes a new room's number back with it.
  edit.undo();
  assert.equal(edit.world.numbers.annex_2, undefined);
});

test('the room editor numbers a new room and takes the number back when it is thrown away', () => {
  const world = new WorldEdit({ schemaVersion: 1, start: 'a', connections: [], positions: { a: [0, 0] }, numbers: { a: 0, gone: 1 } });
  world.place('b', 'a');
  assert.equal(world.data.numbers.b, 2);
  world.unplace('b');
  assert.deepEqual(world.data.numbers, { a: 0, gone: 1 });
  // A deleted room's id made again gets its old number, and throwing it away keeps it taken.
  world.place('gone', 'a');
  world.unplace('gone');
  assert.deepEqual(world.data.numbers, { a: 0, gone: 1 });
});

test('saveEdits gives a room saved without a number the next one', () => {
  const root = mkdtempSync(join(tmpdir(), 'neonmancer-'));
  try {
    cpSync(fileURLToPath(new URL('../schemas', import.meta.url)), join(root, 'schemas'), { recursive: true });
    const files = testWorld();
    writeDataFiles(root, files);
    const numbers = files['world.json'].numbers;
    // The map tool sends a new room and its cell, not world.json.
    const saved = saveEdits(root, { rooms: [newRoom('annex', 'home')], positions: { annex: [5, 5] } });
    assert.deepEqual(saved.errors, []);
    const world = JSON.parse(readFileSync(join(root, 'data/world.json'), 'utf8'));
    assert.deepEqual(world.numbers, { ...numbers, annex: Math.max(...Object.values(numbers)) + 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
