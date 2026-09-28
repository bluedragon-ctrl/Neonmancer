import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData } from '../src/data/validate.js';
import { MapEdit, exitSpots, facingSide } from '../src/editor/map-edit.js';
import { nearestFreeCell } from '../src/world/map.js';
import { readDataFiles } from '../tools/check-data.js';
import { saveEdits } from '../tools/room-save.js';
import { dataFiles, roomFile } from './helpers.js';

const root = fileURLToPath(new URL('..', import.meta.url));

/** A 12x4x12 room with exits, the wizard starting in a corner. */
const room = (id, exits) => roomFile(id, { size: [12, 4, 12], exits });

/**
 * A small world of its own (the real one changes with every map edit):
 * hub (start) [0, 0] ─ yard [1, 0]
 *  │
 * lane [0, 1] ─ dock [1, 1]
 */
const world = () =>
  dataFiles({
    rooms: [
      room('hub', [
        { id: 'east', side: '+x', at: 5 },
        { id: 'south', side: '+z', at: 5 },
      ]),
      room('yard', [{ id: 'west', side: '-x', at: 5 }]),
      room('lane', [
        { id: 'north', side: '-z', at: 5 },
        { id: 'east', side: '+x', at: 5 },
      ]),
      room('dock', [{ id: 'west', side: '-x', at: 5 }]),
    ],
    connections: [
      ['hub.east', 'yard.west'],
      ['hub.south', 'lane.north'],
      ['lane.east', 'dock.west'],
    ],
    positions: { hub: [0, 0], yard: [1, 0], lane: [0, 1], dock: [1, 1] },
  });

test('the fixture world is valid', () => {
  assert.deepEqual(validateData(world()), []);
});

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
  const edit = new MapEdit(world());
  assert.equal(edit.dirty, false);

  assert.match(edit.addRoom('annex', [0, 0], 'home'), /hub's/, 'a taken cell');
  assert.match(edit.addRoom('hub', [5, 5], 'home'), /taken/);
  assert.equal(edit.addRoom('annex', [0, 2], 'home'), null);
  assert.deepEqual(edit.positions.annex, [0, 2]);

  // Annex is south of Lane ([0, 1]): its north wall faces Lane's south wall.
  const { ref, problem } = edit.connect('lane', 'annex');
  assert.equal(problem, null);
  assert.deepEqual(ref, ['lane.south', 'annex.north']);
  assert.deepEqual(edit.rooms.get('annex').exits, [{ id: 'north', side: '-z', at: 5 }]);
  assert.deepEqual(edit.rooms.get('lane').exits.at(-1), { id: 'south', side: '+z', at: 5 });
  assert.deepEqual(validateData(edit.dataFiles()), []);

  const { rooms, remove, positions, world: saved, counts } = edit.changes();
  assert.deepEqual(rooms.map((r) => r.id).sort(), ['annex', 'lane']);
  assert.deepEqual(remove, []);
  assert.deepEqual(positions, { annex: [0, 2] });
  assert.deepEqual(saved.connections.at(-1), ['lane.south', 'annex.north']);
  assert.deepEqual(counts, { moved: 0, added: 1, removed: 0, changed: 1, links: true });

  // Undo takes the connection back, then the room.
  assert.equal(edit.undo(), true);
  assert.equal(edit.rooms.get('annex').exits, undefined);
  assert.equal(edit.undo(), true);
  assert.equal(edit.rooms.has('annex'), false);
  assert.equal(edit.dirty, false);
});

test('MapEdit moves an exit off the middle when the middle is taken or blocked', () => {
  const edit = new MapEdit(world());
  edit.addRoom('annex', [0, 2], 'home');
  // A block where the middle exit would open (cells 5 and 6 of the north wall).
  edit.rooms.set('annex', { ...edit.rooms.get('annex'), blocks: [{ at: [5, 0, 0] }] });
  assert.equal(edit.connect('lane', 'annex').problem, null);
  assert.equal(edit.rooms.get('annex').exits[0].at, 6, 'the nearest spot clear of the block');
  // A second connection the same way gets a second exit next to the first.
  assert.deepEqual(edit.connect('lane', 'annex').ref, ['lane.south_2', 'annex.north_2']);
  assert.equal(edit.rooms.get('annex').exits[1].at, 3, 'clear of the first exit and the block');
  assert.deepEqual(validateData(edit.dataFiles()), []);
});

test('MapEdit removes a connection with both its exits, and a room with the exits into it', () => {
  const edit = new MapEdit(world());
  assert.equal(edit.disconnect(edit.connections.findIndex((pair) => pair.includes('hub.south'))), true);
  assert.deepEqual(edit.rooms.get('hub').exits.map((e) => e.id), ['east']);
  assert.deepEqual(edit.rooms.get('lane').exits.map((e) => e.id), ['east']);
  assert.equal(edit.connected('hub.south'), false);

  assert.match(edit.removeRoom('hub'), /start room/);
  assert.equal(edit.removeRoom('lane'), null);
  assert.equal(edit.rooms.has('lane'), false);
  assert.equal(edit.positions.lane, undefined);
  assert.deepEqual(edit.connections, [['hub.east', 'yard.west']]);
  assert.equal(edit.rooms.get('dock').exits, undefined, 'the exit into lane went too');
  assert.deepEqual(validateData(edit.dataFiles()), []);
  assert.deepEqual(edit.changes().remove, ['lane']);
});

test('MapEdit removes a connected exit with its partner, and a loose exit alone (D102)', () => {
  const edit = new MapEdit(world());
  assert.deepEqual(edit.removeExit('hub.south'), ['hub.south', 'lane.north']);
  assert.deepEqual(edit.rooms.get('hub').exits.map((e) => e.id), ['east']);
  assert.deepEqual(edit.rooms.get('lane').exits.map((e) => e.id), ['east']);
  assert.deepEqual(validateData(edit.dataFiles()), []);
  assert.deepEqual(edit.removeExit('hub.nowhere'), []);

  // A loose exit (made by hand): only it goes.
  edit.addRoom('annex', [0, 2], 'home');
  edit.rooms.set('annex', { ...edit.rooms.get('annex'), exits: [{ id: 'door', side: '+x', at: 3 }] });
  assert.deepEqual(edit.removeExit('annex.door'), ['annex.door']);
  assert.equal(edit.rooms.get('annex').exits, undefined);
  assert.equal(edit.undo(), true);
  assert.deepEqual(edit.rooms.get('annex').exits, [{ id: 'door', side: '+x', at: 3 }]);
});

test('MapEdit connects through a loose exit already in the facing wall', () => {
  const edit = new MapEdit(world());
  edit.addRoom('annex', [0, 2], 'home');
  edit.rooms.set('annex', {
    ...edit.rooms.get('annex'),
    exits: [
      { id: 'door', side: '-z', at: 2 },
      { id: 'wide', side: '-z', at: 7, width: 3 },
    ],
  });
  const { ref, problem } = edit.connect('lane', 'annex');
  assert.equal(problem, null);
  assert.deepEqual(ref, ['lane.south', 'annex.door'], 'the 2-wide loose exit, not the 3-wide one');
  assert.equal(edit.rooms.get('annex').exits.length, 2, 'no new exit');
});

test('MapEdit rolls the last save back: a removed room, the exits into it and world.json come back (D103)', () => {
  const edit = new MapEdit(world());
  const text = (files) => JSON.stringify(Object.keys(files).sort().map((file) => [file, files[file]]));
  const original = text(structuredClone(edit.dataFiles()));

  edit.removeRoom('lane');
  edit.addRoom('annex', [2, 0], 'home');
  edit.connect('yard', 'annex');
  const point = edit.rollbackPoint();
  assert.equal(point.rooms.annex, null, 'a room the save adds');
  assert.equal(point.rooms.lane.id, 'lane', 'a room the save deletes, as on disk');
  assert.deepEqual(Object.keys(point.rooms).sort(), ['annex', 'dock', 'hub', 'lane', 'yard']);
  edit.markSaved();
  edit.clearHistory();
  assert.equal(edit.dirty, false);

  // Only through JSON, as kept in session storage over a reload.
  assert.equal(edit.rollBack(JSON.parse(JSON.stringify(point))), true);
  assert.equal(text(edit.dataFiles()), original);
  assert.deepEqual(edit.changes().remove, ['annex']);
  assert.deepEqual(edit.changes().rooms.map((r) => r.id).sort(), ['dock', 'hub', 'lane', 'yard']);

  // The rollback is one undo step itself; rolling back again changes nothing.
  assert.equal(edit.undo(), true);
  assert.equal(edit.rooms.has('lane'), false);
  assert.equal(edit.rollBack(point), true);
  assert.equal(edit.rollBack(point), false);
});

test("saveEdits writes the map tool's new, changed and removed rooms with world.json", () => {
  const tmp = mkdtempSync(join(tmpdir(), 'neonmancer-'));
  try {
    // The real data (schemas and all), whatever its rooms are just now.
    for (const dir of ['data', 'schemas']) cpSync(join(root, dir), join(tmp, dir), { recursive: true });
    const edit = new MapEdit(readDataFiles(tmp).files);
    const { start } = edit.world;
    const gone = [...edit.rooms.keys()].find((id) => id !== start);
    assert.equal(edit.removeRoom(gone), null);
    const cell = nearestFreeCell(edit.positions, edit.positions[start]);
    assert.equal(edit.addRoom('annex', cell, edit.rooms.get(start).biome), null);
    assert.equal(edit.connect(start, 'annex').problem, null);
    const { rooms, remove, positions, world: changed } = edit.changes();
    const result = saveEdits(tmp, { rooms, remove, positions, world: changed });
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.equal(existsSync(join(tmp, `data/rooms/${gone}.json`)), false);
    assert.ok(result.files.includes(`data/rooms/${gone}.json`));
    const saved = JSON.parse(readFileSync(join(tmp, 'data/world.json'), 'utf8'));
    assert.equal(saved.positions[gone], undefined);
    assert.deepEqual(saved.positions.annex, cell);
    assert.deepEqual(validateData(readDataFiles(tmp).files), []);

    // Removing a room another room still leads into: nothing is written.
    const linked = saved.connections[0][0].split('.')[0];
    assert.equal(saveEdits(tmp, { remove: [linked] }).ok, false);
    assert.ok(existsSync(join(tmp, `data/rooms/${linked}.json`)));
    assert.equal(saveEdits(tmp, { remove: ['../world'] }).ok, false);
    assert.equal(saveEdits(tmp, { remove: ['nowhere'] }).ok, false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
