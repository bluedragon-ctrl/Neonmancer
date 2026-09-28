import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData } from '../src/data/validate.js';
import { MapEdit, exitSpots, facingSide } from '../src/editor/map-edit.js';
import { readDataFiles } from '../tools/check-data.js';
import { saveEdits } from '../tools/room-save.js';
import { testWorld, writeDataFiles } from './helpers.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('facingSide picks the wall towards the other room, along the axis they are further apart on', () => {
  assert.equal(facingSide([0, 0], [1, 0]), '+x');
  assert.equal(facingSide([0, 0], [0, -1]), '-z');
  assert.equal(facingSide([0, 0], [-3, 1]), '-x');
  assert.equal(facingSide([0, 0], [1, 1]), '+x', 'diagonal: x');
  assert.equal(facingSide([2, 2], [2, 2]), null);
});

test('exitSpots start in the middle of the wall, then go outwards', () => {
  assert.deepEqual(exitSpots(12, 2), [5, 6, 4, 7, 3, 8, 2, 9, 1, 10, 0]);
  assert.deepEqual(exitSpots(3, 2), [0, 1]);
  assert.deepEqual(exitSpots(1, 2), []);
});

test('MapEdit adds a room, connects it with exits in the middle of the facing walls, and the data stays valid', () => {
  const edit = new MapEdit(testWorld());
  assert.equal(edit.dirty, false);

  assert.match(edit.addRoom('annex', [0, 0], 'home'), /boot_sector's/, 'a taken cell');
  assert.match(edit.addRoom('boot_sector', [5, 5], 'home'), /taken/);
  assert.equal(edit.addRoom('annex', [0, 2], 'home'), null);
  assert.deepEqual(edit.positions.annex, [0, 2]);

  // Annex is south of Transit Bus ([0, 1]): its north wall faces Transit Bus's south wall.
  const { ref, problem } = edit.connect('transit_bus', 'annex');
  assert.equal(problem, null);
  assert.deepEqual(ref, ['transit_bus.south', 'annex.north']);
  assert.deepEqual(edit.rooms.get('annex').exits, [{ id: 'north', side: '-z', at: 5 }]);
  assert.equal(edit.rooms.get('transit_bus').exits.at(-1).side, '+z');
  assert.deepEqual(validateData(edit.dataFiles()), []);

  const { rooms, remove, positions, world, counts } = edit.changes();
  assert.deepEqual(rooms.map((room) => room.id).sort(), ['annex', 'transit_bus']);
  assert.deepEqual(remove, []);
  assert.deepEqual(positions, { annex: [0, 2] });
  assert.deepEqual(world.connections.at(-1), ['transit_bus.south', 'annex.north']);
  assert.deepEqual(counts, { moved: 0, added: 1, removed: 0, changed: 1, links: true });

  // Undo takes the connection back, then the room.
  assert.equal(edit.undo(), true);
  assert.equal(edit.rooms.get('annex').exits, undefined);
  assert.equal(edit.undo(), true);
  assert.equal(edit.rooms.has('annex'), false);
  assert.equal(edit.dirty, false);
});

test('MapEdit moves an exit off the middle when the middle is taken or blocked', () => {
  const edit = new MapEdit(testWorld());
  edit.addRoom('annex', [0, 2], 'home');
  const annex = edit.rooms.get('annex');
  // A block where the middle exit would open (cells 5 and 6 of the north wall).
  edit.rooms.set('annex', { ...annex, blocks: [{ at: [5, 0, 0] }] });
  assert.deepEqual(edit.connect('transit_bus', 'annex').problem, null);
  const exit = edit.rooms.get('annex').exits[0];
  assert.equal(exit.at, 6, 'the nearest spot clear of the block');
  // A second connection the same way gets a second exit next to the first.
  const second = edit.connect('transit_bus', 'annex');
  assert.deepEqual(second.ref, ['transit_bus.south_2', 'annex.north_2']);
  assert.equal(edit.rooms.get('annex').exits[1].at, 3, 'clear of the first exit and the block');
  assert.deepEqual(validateData(edit.dataFiles()), []);
});

test('MapEdit removes a connection with both its exits, and a room with the exits into it', () => {
  const edit = new MapEdit(testWorld());
  const index = edit.connections.findIndex((pair) => pair.includes('boot_sector.south'));
  assert.equal(edit.disconnect(index), true);
  assert.equal(edit.rooms.get('boot_sector').exits.some((exit) => exit.id === 'south'), false);
  assert.equal(edit.rooms.get('transit_bus').exits.some((exit) => exit.id === 'north'), false);
  assert.equal(edit.connections.some((pair) => pair.includes('boot_sector.south')), false);

  assert.match(edit.removeRoom('boot_sector'), /start room/);
  assert.equal(edit.removeRoom('stack_yard'), null);
  assert.equal(edit.rooms.has('stack_yard'), false);
  assert.equal(edit.positions.stack_yard, undefined);
  assert.equal(edit.connections.some((pair) => pair.some((ref) => ref.startsWith('stack_yard.'))), false);
  for (const [room, exit] of [['fault_line', 'west'], ['relay_station', 'south'], ['boot_sector', 'east']]) {
    assert.equal(edit.rooms.get(room).exits.some((e) => e.id === exit), false, `${room}.${exit}`);
  }
  assert.deepEqual(validateData(edit.dataFiles()), []);
  assert.deepEqual(edit.changes().remove, ['stack_yard']);
});

test('saveEdits writes the map tool\'s new, changed and removed rooms with world.json', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'neonmancer-'));
  try {
    cpSync(join(root, 'schemas'), join(tmp, 'schemas'), { recursive: true });
    writeDataFiles(tmp, testWorld());
    const edit = new MapEdit(readDataFiles(tmp).files);
    edit.removeRoom('volatile_memory');
    edit.addRoom('annex', [0, 2], 'home');
    edit.connect('transit_bus', 'annex');
    const { rooms, remove, positions, world } = edit.changes();
    const result = saveEdits(tmp, { rooms, remove, positions, world });
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.equal(existsSync(join(tmp, 'data/rooms/volatile_memory.json')), false);
    assert.ok(result.files.includes('data/rooms/volatile_memory.json'));
    const saved = JSON.parse(readFileSync(join(tmp, 'data/world.json'), 'utf8'));
    assert.equal(saved.positions.volatile_memory, undefined);
    assert.deepEqual(saved.positions.annex, [0, 2]);
    assert.deepEqual(validateData(readDataFiles(tmp).files), []);

    // Removing a room another room still leads into: nothing is written.
    assert.equal(saveEdits(tmp, { remove: ['crawl_space'] }).ok, false);
    assert.ok(existsSync(join(tmp, 'data/rooms/crawl_space.json')));
    assert.equal(saveEdits(tmp, { remove: ['../world'] }).ok, false);
    assert.equal(saveEdits(tmp, { remove: ['nowhere'] }).ok, false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('MapEdit removes a connected exit with its partner, and a loose exit alone (D78)', () => {
  const edit = new MapEdit(dataFiles());
  assert.deepEqual(edit.removeExit('boot_sector.south'), ['boot_sector.south', 'transit_bus.north']);
  assert.equal(edit.rooms.get('boot_sector').exits.some((exit) => exit.id === 'south'), false);
  assert.equal(edit.rooms.get('transit_bus').exits.some((exit) => exit.id === 'north'), false);
  assert.equal(edit.connected('boot_sector.south'), false);
  assert.deepEqual(validateData(edit.dataFiles()), []);
  assert.deepEqual(edit.removeExit('boot_sector.nowhere'), []);

  // A loose exit (made by hand): only it goes.
  edit.addRoom('annex', [0, 2], 'home_lattice');
  edit.rooms.set('annex', { ...edit.rooms.get('annex'), exits: [{ id: 'door', side: '+x', at: 3 }] });
  assert.deepEqual(edit.removeExit('annex.door'), ['annex.door']);
  assert.equal(edit.rooms.get('annex').exits, undefined);
  assert.equal(edit.undo(), true);
  assert.deepEqual(edit.rooms.get('annex').exits, [{ id: 'door', side: '+x', at: 3 }]);
});

test('MapEdit connects through a loose exit already in the facing wall', () => {
  const edit = new MapEdit(dataFiles());
  edit.addRoom('annex', [0, 2], 'home_lattice');
  edit.rooms.set('annex', { ...edit.rooms.get('annex'), exits: [{ id: 'door', side: '-z', at: 2 }, { id: 'wide', side: '-z', at: 7, width: 3 }] });
  const { ref, problem } = edit.connect('transit_bus', 'annex');
  assert.equal(problem, null);
  assert.deepEqual(ref, ['transit_bus.south', 'annex.door'], 'the 2-wide loose exit, not the 3-wide one');
  assert.equal(edit.rooms.get('annex').exits.length, 2, 'no new exit');
});
