import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Boxes } from '../src/editor/boxes.js';
import { formatJson } from '../src/editor/format-json.js';
import { RoomEdit, newRoom, resizeText, roomIdProblem, sizeProblem, spanCells } from '../src/editor/room-edit.js';
import { WorldEdit } from '../src/editor/world-edit.js';
import { idProblem } from '../src/editor/ids.js';
import { MAX_ACCESS_LEVEL, ROOM_HEIGHT } from '../src/core/rules.js';
import { errorTarget, groupErrors } from '../src/editor/errors.js';
import { cutRoom } from '../src/render/room-scene.js';
import { validateData } from '../src/data/validate.js';
import { loadGameData } from '../src/data/load.js';
import { resolveBlockTypes, resolveEnemyTemplates, templateChain } from '../src/data/room-data.js';
import { blockTypeGroups, blockTypeText, objectTypeGroups, objectTypeText, placesText, stairTypes, templateText, turnStair } from '../src/editor/panel.js';
import { buildRoom } from '../src/world/room.js';
import { checkSchemas, readSchemas } from '../tools/check-data.js';
import { refuseSaveRequest, saveEdits } from '../tools/room-save.js';
import { BLOCK_TYPES, BUG, LIFT, dataFiles, roomFile, testWorld, writeDataFiles } from './helpers.js';
import { firstHit, hitBoxes, pickCell, rayBox } from '../src/editor/pick.js';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));

test('formatJson writes every data file exactly as it is', () => {
  const files = ['defs.json', 'biomes.json', 'world.json', 'strings.json', ...readdirSync(`${dataDir}rooms`).map((name) => `rooms/${name}`)];
  for (const file of files) {
    const text = readFileSync(`${dataDir}${file}`, 'utf8');
    assert.equal(formatJson(JSON.parse(text)), text, file);
  }
});

test('formatJson puts what fits on one line and lists of records one per line', () => {
  const text = formatJson({ size: [8, 4, 8], blocks: [{ at: [1, 0, 1] }, { at: [2, 0, 2], to: [3, 0, 2] }], objects: [{ id: 'a', type: 'crate', at: [4, 0, 4] }] });
  assert.equal(
    text,
    [
      '{',
      '  "size": [8, 4, 8],',
      '  "blocks": [',
      '    { "at": [1, 0, 1] },',
      '    { "at": [2, 0, 2], "to": [3, 0, 2] }',
      '  ],',
      '  "objects": [{ "id": "a", "type": "crate", "at": [4, 0, 4] }]',
      '}',
      '',
    ].join('\n'),
  );
  // Too long for one line: broken up.
  assert.match(formatJson({ list: [Array(60).fill(1)] }, 40), /\[\n {4}\[\n/);
});

test('Boxes keep untouched entries and merge loose cells into boxes', () => {
  const boxes = new Boxes(
    [
      { at: [0, 0, 0], to: [2, 0, 0] },
      { type: 'fence', at: [5, 0, 5] },
    ],
    { dims: 3, defaultType: 'block' },
  );
  assert.equal(boxes.get([1, 0, 0]), 'block');
  assert.equal(boxes.get([5, 0, 5]), 'fence');
  assert.equal(boxes.get([4, 0, 4]), null);

  // Emptying the middle of the first entry breaks it; the second stays as written.
  assert.equal(boxes.set([1, 0, 0], null), true);
  assert.equal(boxes.set([1, 0, 0], null), false);
  assert.deepEqual(boxes.list(), [{ type: 'fence', at: [5, 0, 5] }, { at: [0, 0, 0] }, { at: [2, 0, 0] }]);

  // A 2×2×2 cube of new cells becomes one box; another type stays apart.
  for (const x of [7, 8]) for (const y of [0, 1]) for (const z of [7, 8]) boxes.set([x, y, z], 'fake');
  boxes.set([1, 0, 0], 'fake');
  assert.deepEqual(boxes.list().slice(1), [
    { at: [0, 0, 0] },
    { type: 'fake', at: [1, 0, 0] },
    { at: [2, 0, 0] },
    { type: 'fake', at: [7, 0, 7], to: [8, 1, 8] },
  ]);
});

test('Boxes merge rows along x first, then z', () => {
  const boxes = new Boxes([], { dims: 2, defaultType: 'hole' });
  // An L: a row of three along x, one more tile behind its first.
  for (const tile of [[0, 0], [1, 0], [2, 0], [0, 1]]) boxes.set(tile, 'hole');
  assert.deepEqual(boxes.list(), [{ at: [0, 0], to: [2, 0] }, { at: [0, 1] }]);
});

test('Boxes.clip drops what is outside and breaks entries that stick out', () => {
  const boxes = new Boxes([{ at: [0, 0, 0], to: [3, 0, 0] }, { at: [0, 1, 0] }], { dims: 3, defaultType: 'block' });
  assert.equal(boxes.clip([2, 4, 4]), true);
  assert.deepEqual(boxes.list(), [{ at: [0, 1, 0] }, { at: [0, 0, 0], to: [1, 0, 0] }]);
  assert.equal(boxes.clip([2, 4, 4]), false);
});

/** A room to edit: two blocks, a hole, a crate and a bug. */
function sampleRoom() {
  return roomFile('lab', {
    $schema: '../../schemas/room.schema.json',
    blocks: [{ at: [0, 0, 0], to: [1, 0, 0] }, { type: 'fence', at: [6, 0, 6] }],
    holes: [{ at: [4, 4] }],
    objects: [{ id: 'crate_1', type: 'crate', at: [3, 0, 3] }],
    enemies: [{ id: 'sentry', template: 'bug', at: [5, 0, 1], variant: { movement: 'stationary' } }],
  });
}

test('an untouched room is written back as it was', () => {
  const data = sampleRoom();
  const edit = new RoomEdit(data);
  assert.deepEqual(edit.toData(), data);
  assert.deepEqual(Object.keys(edit.toData()).slice(0, 3), ['$schema', 'schemaVersion', 'id']);
  assert.equal(edit.dirty, false);
});

test('RoomEdit places and erases blocks, objects and holes', () => {
  const edit = new RoomEdit(sampleRoom());
  assert.deepEqual(edit.at([3, 0, 3]), { kind: 'object', item: { id: 'crate_1', type: 'crate', at: [3, 0, 3] } });
  assert.equal(edit.at([5, 0, 1]).kind, 'enemy');
  assert.deepEqual(edit.at([6, 0, 6]), { kind: 'block', type: 'fence' });

  // A block replaces the crate; a crate goes where the fence was, with the next free id.
  assert.equal(edit.placeBlock([3, 0, 3], 'fake'), true);
  assert.equal(edit.placeBlock([3, 0, 3], 'fake'), false);
  assert.equal(edit.placeObject([6, 0, 6], 'crate'), true);
  assert.equal(edit.placeBlock([2, 1, 2], 'collapsing_regrow'), true);
  assert.equal(edit.placeObject([9, 0, 0], 'crate'), false, 'outside the room');
  assert.equal(edit.erase([5, 0, 1]), true);
  assert.equal(edit.erase([5, 0, 1]), false);
  assert.equal(edit.setHole([4, 4], false), true);
  assert.equal(edit.setHole([1, 5], true), true);

  const data = edit.toData();
  assert.deepEqual(data.blocks, [
    { at: [0, 0, 0], to: [1, 0, 0] },
    { type: 'fake', at: [3, 0, 3] },
    { type: 'collapsing_regrow', at: [2, 1, 2] },
  ]);
  assert.deepEqual(data.objects, [{ id: 'crate_1', type: 'crate', at: [6, 0, 6] }]);
  assert.equal(data.enemies, undefined, 'an empty list is left out');
  assert.deepEqual(data.holes, [{ at: [1, 5] }]);
  assert.equal(edit.dirty, true);
  edit.markSaved();
  assert.equal(edit.dirty, false);
});

test('spanCells: the cells between two corners in any order, both included', () => {
  assert.deepEqual(spanCells([1, 0, 2], [0, 0, 3]), [
    [0, 0, 2],
    [0, 0, 3],
    [1, 0, 2],
    [1, 0, 3],
  ]);
  assert.deepEqual(spanCells([2, 1, 2], [2, 1, 2]), [[2, 1, 2]]);
});

test('RoomEdit fills and clears a rectangle as one undo step, leaving things and holes alone', () => {
  const edit = new RoomEdit(sampleRoom());
  // From [2, 0, 2] to [4, 0, 4]: the crate at [3, 0, 3] and the hole at [4, 4] stay.
  assert.equal(edit.fillBlocks([4, 0, 4], [2, 0, 2], 'fence'), true);
  assert.equal(edit.undoStack.length, 1, 'one step');
  assert.equal(edit.at([3, 0, 3]).kind, 'object');
  assert.equal(edit.at([4, 0, 4]), null);
  assert.equal(edit.isHole([4, 4]), true);
  assert.deepEqual(edit.at([2, 0, 2]), { kind: 'block', type: 'fence' });
  assert.deepEqual(edit.at([4, 0, 3]), { kind: 'block', type: 'fence' });
  assert.equal(edit.fillBlocks([2, 0, 2], [4, 0, 4], 'fence'), false, 'nothing left to change');

  // Clearing takes blocks only, the crate stays.
  assert.equal(edit.clearBlocks([0, 0, 0], [3, 0, 3]), true);
  assert.equal(edit.at([0, 0, 0]), null, 'part of a block entry');
  assert.equal(edit.at([2, 0, 2]), null);
  assert.equal(edit.at([3, 0, 3]).kind, 'object');
  assert.deepEqual(edit.at([4, 0, 3]), { kind: 'block', type: 'fence' }, 'outside the rectangle');
  assert.equal(edit.undoStack.length, 2);

  // Holes: a rectangle of tiles, and floor again.
  assert.equal(edit.fillHoles([0, 5], [1, 6], true), true);
  assert.deepEqual([[0, 5], [1, 5], [0, 6], [1, 6]].map((tile) => edit.isHole(tile)), [true, true, true, true]);
  assert.equal(edit.fillHoles([0, 5], [1, 6], false), true);
  assert.equal(edit.isHole([1, 6]), false);
  assert.equal(edit.undo(), true);
  assert.equal(edit.isHole([1, 6]), true, 'one undo brings the whole rectangle back');
});

test('RoomEdit moves a thing with its id, fields and path; only to a free cell', () => {
  const edit = new RoomEdit(sampleRoom());
  assert.equal(edit.placeObject([2, 0, 5], 'platform'), true);
  const platform = edit.at([2, 0, 5]).item;
  edit.updateItem(platform.id, { switches: ['plate_9'], path: { points: [[2, 0, 6]] } });

  assert.match(edit.moveProblem('crate_1', [6, 0, 6]), /taken \(fence block\)/);
  assert.match(edit.moveProblem('crate_1', [5, 0, 1]), /taken \(sentry\)/);
  assert.match(edit.moveProblem('crate_1', [3, 9, 3]), /outside/);
  assert.match(edit.moveProblem(platform.id, [2, 0, 7]), /path would leave/);
  assert.equal(edit.moveItem('crate_1', [6, 0, 6]), false);
  assert.equal(edit.moveItem('crate_1', [3, 0, 3]), false, 'already there');

  const steps = edit.undoStack.length;
  assert.equal(edit.moveItem(platform.id, [1, 1, 2]), true);
  assert.equal(edit.undoStack.length, steps + 1, 'one step');
  assert.deepEqual(edit.item(platform.id), { id: platform.id, type: 'platform', at: [1, 1, 2], switches: ['plate_9'], path: { points: [[1, 1, 3]] } });
  assert.equal(edit.at([2, 0, 5]), null);
  assert.equal(edit.moveItem('sentry', [5, 0, 2]), true);
  assert.equal(edit.at([5, 0, 2]).item.id, 'sentry');
  assert.equal(edit.undo(), true);
  assert.equal(edit.at([5, 0, 1]).item.id, 'sentry');
});

test('RoomEdit.placeObject on the same object keeps it; another type replaces it', () => {
  const edit = new RoomEdit(sampleRoom());
  assert.equal(edit.placeObject([2, 1, 2], 'platform'), true);
  assert.equal(edit.placeObject([2, 1, 2], 'platform'), false, 'nothing to change');
  assert.deepEqual(edit.at([2, 1, 2]).item, { id: 'platform_1', type: 'platform', at: [2, 1, 2] });
  // Another type replaces it.
  assert.equal(edit.placeObject([2, 1, 2], 'crate'), true);
  assert.equal(edit.at([2, 1, 2]).item.type, 'crate');
});

test('RoomEdit.placeObject on a platform of the same type keeps its id and path', () => {
  const edit = new RoomEdit(sampleRoom());
  edit.placeObject([6, 0, 6], 'lift');
  edit.addWaypoint('lift_1', [6, 2, 6]);
  const before = edit.text();
  assert.equal(edit.placeObject([6, 0, 6], 'lift'), false);
  assert.equal(edit.text(), before);
  assert.deepEqual(edit.item('lift_1').path, { points: [[6, 2, 6]] });
});

test('RoomEdit moves spawn and reset; no reset falls back to spawn', () => {
  const edit = new RoomEdit(sampleRoom());
  assert.equal(edit.setPoint('spawn', [2.5, 0, 3.5]), true);
  assert.equal(edit.setPoint('spawn', [2.5, 0, 3.5]), false);
  assert.equal(edit.setPoint('reset', [4.5, 1, 1.5]), true);
  assert.deepEqual(edit.toData().reset, [4.5, 1, 1.5]);
  assert.equal(edit.setPoint('reset', null), true);
  assert.equal(edit.setPoint('reset', null), false);
  assert.equal('reset' in edit.toData(), false);
});

test('RoomEdit.resize drops what ends up outside, moves spawn and reset in and says so', () => {
  const edit = new RoomEdit({ ...sampleRoom(), spawn: [6.5, 0, 1.5], reset: [2.5, 3, 2.5] });
  const report = edit.resize([5, 3, 5]);
  assert.deepEqual(report, { dropped: ['1 block', 'sentry'], moved: ['spawn', 'reset'] });
  assert.equal(resizeText([5, 3, 5], report), 'Size 5×3×5; dropped 1 block, sentry; moved spawn and reset inside.');
  const data = edit.toData();
  assert.deepEqual(data.size, [5, 3, 5]);
  assert.deepEqual(data.blocks, [{ at: [0, 0, 0], to: [1, 0, 0] }]);
  assert.deepEqual(data.holes, [{ at: [4, 4] }]);
  assert.deepEqual(data.objects, [{ id: 'crate_1', type: 'crate', at: [3, 0, 3] }]);
  assert.equal(data.enemies, undefined);
  assert.deepEqual([data.spawn, data.reset], [[4.5, 0, 1.5], [2.5, 1, 2.5]]);
  assert.equal(edit.resize([5, 3, 5]), false);
  assert.deepEqual(edit.resize([6, 3, 5]), { dropped: [], moved: [] });
});

test('RoomEdit undoes and redoes; a stroke is one step', () => {
  const edit = new RoomEdit(sampleRoom());
  const start = edit.text();
  edit.begin();
  for (let x = 2; x < 6; x++) edit.placeBlock([x, 1, 7], 'block');
  edit.end();
  edit.setName('Lab');
  const painted = edit.text();

  assert.equal(edit.undo(), true);
  assert.equal(edit.toData().name, 'lab');
  assert.equal(edit.undo(), true);
  assert.equal(edit.text(), start);
  assert.equal(edit.undo(), false);
  assert.equal(edit.redo(), true);
  assert.equal(edit.redo(), true);
  assert.equal(edit.text(), painted);
  assert.equal(edit.redo(), false);

  // A new edit clears the redo steps; an edit that changes nothing adds no step.
  edit.undo();
  edit.setBiome('home');
  assert.equal(edit.redo(), true);
  edit.undo();
  edit.setName('Other');
  assert.equal(edit.redo(), false);
});

test('RoomEdit marks a room authored (D90) and back; a test room has no flag', () => {
  const edit = new RoomEdit(sampleRoom());
  assert.equal(edit.setAuthored(false), false);
  assert.equal(edit.setAuthored(true), true);
  assert.equal(edit.toData().authored, true);
  assert.match(edit.text(), /"name": "lab",\n  "authored": true,\n  "biome"/);
  assert.equal(edit.setAuthored(true), false);
  assert.equal(edit.setAuthored(false), true);
  assert.equal('authored' in edit.toData(), false);
  edit.undo();
  assert.equal(edit.toData().authored, true);
});

test('RoomEdit sets a watchdog timer (D172) in whole seconds, 3–600; blank or 0 takes it off', () => {
  const edit = new RoomEdit(sampleRoom());
  assert.equal(edit.setRoomTimer(undefined), false);
  assert.equal(edit.setRoomTimer(20.4), true);
  assert.equal(edit.toData().timer, 20);
  assert.match(edit.text(), /"size": \[8, 4, 8\],\n  "timer": 20,\n  "spawn"/);
  edit.setRoomTimer(1);
  assert.equal(edit.toData().timer, 3);
  edit.setRoomTimer(9999);
  assert.equal(edit.toData().timer, 600);
  assert.equal(edit.setRoomTimer(0), true);
  assert.equal('timer' in edit.toData(), false);
  edit.undo();
  assert.equal(edit.toData().timer, 600);
});

test('idProblem refuses ids off the pattern and ids in use', () => {
  assert.equal(idProblem('Exit id', 'north_2', ['north']), null);
  assert.equal(idProblem('Exit id', 'North', []), 'Exit id: lowercase letters, digits and _, starting with a letter.');
  assert.equal(idProblem('Exit id', '2nd', []), 'Exit id: lowercase letters, digits and _, starting with a letter.');
  assert.equal(idProblem('Exit id', 'north', new Set(['north'])), 'Exit id: "north" is taken.');
});

test('markSaved with the text sent keeps edits made while saving unsaved', () => {
  const edit = new RoomEdit(sampleRoom());
  edit.setName('Lab');
  const sent = edit.text();
  edit.setName('Lab two'); // while the save is on its way
  edit.markSaved(sent);
  assert.equal(edit.dirty, true);
  edit.undo();
  assert.equal(edit.dirty, false);

  const world = new WorldEdit({ start: 'a', positions: { a: [0, 0] } });
  world.place('b', 'a');
  const worldSent = world.text();
  world.unplace('b');
  world.markSaved(worldSent);
  assert.equal(world.dirty, true);
  world.markSaved();
  assert.equal(world.dirty, false);
});

test('an edited room is checked with the rest of the data', () => {
  const files = dataFiles({ rooms: [sampleRoom()], objects: { crate: { kind: 'pushable', color: '#b6ff3c' } } });
  const edit = new RoomEdit(files['rooms/lab.json']);
  const errors = () => validateData({ ...files, 'rooms/lab.json': edit.toData() });
  assert.deepEqual(errors(), []);
  edit.placeBlock([1, 0, 1], 'block'); // under the spawn point
  assert.equal(errors().length, 1);
  assert.match(errors()[0], /rooms\/lab\.json › spawn: the player .* overlaps blocks\[/);
});

test('saveEdits writes valid rooms and world.json together, and refuses invalid data', () => {
  const root = mkdtempSync(join(tmpdir(), 'neonmancer-'));
  try {
    cpSync(fileURLToPath(new URL('../schemas', import.meta.url)), join(root, 'schemas'), { recursive: true });
    writeDataFiles(root, testWorld());
    const file = join(root, 'data/rooms/cache_hall.json');
    const before = readFileSync(file, 'utf8');
    const room = JSON.parse(before);

    // Invalid: a block where the wizard spawns. Nothing is written.
    const blocked = { ...room, blocks: [{ at: room.spawn.map(Math.floor) }] };
    const refused = saveEdits(root, { rooms: [blocked] });
    assert.equal(refused.ok, false);
    assert.match(refused.errors.join('\n'), /rooms\/cache_hall\.json › spawn/);
    assert.equal(readFileSync(file, 'utf8'), before);

    // Schema errors count too; so do bad ids and a new room's exit that leads nowhere.
    assert.equal(saveEdits(root, { rooms: [{ ...room, size: [12, 9, 12] }] }).ok, false);
    assert.equal(saveEdits(root, { rooms: [{ ...room, id: '../world' }] }).ok, false);
    assert.equal(saveEdits(root, {}).ok, false);
    const annex = { ...newRoom('annex', 'home'), exits: [{ id: 'south', side: '+z', at: 2 }] };
    assert.match(saveEdits(root, { rooms: [annex] }).errors.join('\n'), /exit "south" leads nowhere/);

    // Valid: a new room north of Cache Hall (D259), an exit in each facing wall, its cell in world.json.
    const world = JSON.parse(readFileSync(join(root, 'data/world.json'), 'utf8'));
    const exitFree = { ...room, name: 'Cache Hall Two', exits: [...room.exits, { id: 'north', side: '-z', at: 8 }] };
    world.positions.annex = [0, -2];
    const saved = saveEdits(root, { rooms: [exitFree, annex], world });
    assert.deepEqual(saved, { ok: true, errors: [], files: ['data/rooms/cache_hall.json', 'data/rooms/annex.json', 'data/world.json'] });
    assert.equal(readFileSync(file, 'utf8'), formatJson(exitFree));
    assert.equal(readFileSync(join(root, 'data/rooms/annex.json'), 'utf8'), formatJson(annex));
    assert.equal(readFileSync(join(root, 'data/world.json'), 'utf8'), formatJson(world));

    // A template in defs.json and an enemy of it, saved together.
    const defs = JSON.parse(readFileSync(join(root, 'data/defs.json'), 'utf8'));
    defs.enemies.tank = { extends: 'bug', movement: 'stationary', integrity: 4 };
    const guarded = { ...annex, enemies: [{ id: 'tank_1', template: 'tank', at: [3, 0, 3] }] };
    assert.equal(saveEdits(root, { rooms: [guarded] }).ok, false, 'unknown type without the new defs');
    assert.deepEqual(saveEdits(root, { rooms: [guarded], defs }).files, ['data/rooms/annex.json', 'data/defs.json']);
    assert.equal(readFileSync(join(root, 'data/defs.json'), 'utf8'), formatJson(defs));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('saveEdits merges moves from the world map into world.json; the room editor keeps them', () => {
  const root = mkdtempSync(join(tmpdir(), 'neonmancer-'));
  try {
    cpSync(fileURLToPath(new URL('../schemas', import.meta.url)), join(root, 'schemas'), { recursive: true });
    // A room with no exits, free to move anywhere.
    const files = testWorld();
    files['rooms/loner.json'] = newRoom('loner', 'home');
    files['world.json'].positions.loner = [6, 3];
    writeDataFiles(root, files);
    const read = () => JSON.parse(readFileSync(join(root, 'data/world.json'), 'utf8'));
    const before = read();

    // A connected room moved away: its exits lead nowhere (D259), nothing is written.
    assert.match(saveEdits(root, { positions: { cache_hall: [4, -3] } }).errors.join('\n'), /exit "south" leads nowhere/);

    // The editor loaded world.json before the move below.
    const stale = structuredClone(before);
    assert.deepEqual(saveEdits(root, { positions: { loner: [4, -3] } }).files, ['data/world.json']);
    assert.deepEqual(read(), { ...before, positions: { ...before.positions, loner: [4, -3] } });

    // A new room saved from the editor with its cell: the move stays, the new cell is saved.
    stale.positions.annex = [5, 5];
    assert.equal(saveEdits(root, { rooms: [newRoom('annex', 'home')], world: stale }).ok, true);
    assert.deepEqual(read().positions.loner, [4, -3]);
    assert.deepEqual(read().positions.annex, [5, 5]);

    // Two rooms in one cell, or an unknown room: nothing is written.
    const text = readFileSync(join(root, 'data/world.json'), 'utf8');
    // Another room moved onto the start room's cell.
    const other = Object.keys(before.positions).find((id) => id !== before.start);
    const [sx, sz] = before.positions[before.start];
    assert.match(saveEdits(root, { positions: { [other]: [sx, sz] } }).errors.join('\n'), new RegExp(`cell \\[${sx},${sz}\\] is taken`));
    assert.match(saveEdits(root, { positions: { nowhere: [9, 9] } }).errors.join('\n'), /unknown room "nowhere"/);
    assert.equal(saveEdits(root, { positions: [[0, 0]] }).ok, false);
    assert.equal(readFileSync(join(root, 'data/world.json'), 'utf8'), text);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuseSaveRequest lets only the game page save (a JSON POST from its own origin)', () => {
  const headers = { host: 'localhost:5173', origin: 'http://localhost:5173', 'content-type': 'application/json' };
  assert.equal(refuseSaveRequest({ method: 'POST', headers }), 0);
  assert.equal(refuseSaveRequest({ method: 'POST', headers: { ...headers, origin: undefined } }), 0, 'no Origin: not a browser page');
  assert.equal(refuseSaveRequest({ method: 'GET', headers }), 405);
  assert.equal(refuseSaveRequest({ method: 'POST', headers: { ...headers, origin: 'https://evil.example' } }), 403);
  // A form post from another page: text/plain needs no CORS preflight.
  assert.equal(refuseSaveRequest({ method: 'POST', headers: { ...headers, 'content-type': 'text/plain' } }), 415);
});

test('sizeProblem keeps room sizes within the schema and camera limits', () => {
  assert.equal(sizeProblem([12, 5, 12]), null);
  assert.equal(sizeProblem([16, 6, 16]), null);
  assert.match(sizeProblem([12, 7, 12]), /height/);
  assert.match(sizeProblem([12, 1, 12]), /height/);
  assert.match(sizeProblem([20, 4, 13]), /width \+ depth/);
  assert.match(sizeProblem([0, 4, 8]), /at least 1/);
  assert.match(sizeProblem([8.5, 4, 8]), /whole numbers/);
});

test('room height and access level limits match the room schema', () => {
  const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../schemas/room.schema.json', import.meta.url)), 'utf8'));
  const height = schema.properties.size.prefixItems[1];
  assert.deepEqual(ROOM_HEIGHT, { min: height.minimum, max: height.maximum });
  assert.equal(MAX_ACCESS_LEVEL, schema.$defs.exit.properties.requires.items.oneOf[1].properties.access.maximum);
});

/** Two rooms side by side (lab east of hall), connected; a platform and a bug in lab. */
function twoRooms() {
  return dataFiles({
    rooms: [
      roomFile('hall', { exits: [{ id: 'east', side: '+x', at: 3 }] }),
      roomFile('lab', {
        exits: [{ id: 'west', side: '-x', at: 3 }],
        objects: [{ id: 'lift', type: 'platform', at: [5, 0, 5], path: { points: [[5, 2, 5]] } }],
        enemies: [{ id: 'bug_1', template: 'bug', at: [2, 0, 6], path: { points: [[6, 0, 6]] } }],
      }),
    ],
    objects: { crate: { kind: 'pushable', color: '#b6ff3c' }, platform: LIFT },
    connections: [['hall.east', 'lab.west']],
  });
}

/** The data with edited rooms put in. */
const withEdits = (files, ...edits) => ({ ...files, ...Object.fromEntries(edits.map((e) => [`rooms/${e.id}.json`, e.toData()])) });

test('WorldEdit puts a new room next to the room it was made from, and takes it off again', () => {
  const world = new WorldEdit({ schemaVersion: 1, start: 'a', positions: { a: [0, 0], b: [1, 0] } });
  world.place('c', 'a');
  assert.deepEqual(world.data.positions.c, [0, 1], 'east is taken: south');
  world.place('d', 'b');
  assert.deepEqual(world.data.positions.d, [2, 0]);
  world.unplace('c');
  assert.deepEqual(world.data.positions, { a: [0, 0], b: [1, 0], d: [2, 0] });
});

test('RoomEdit places enemies and edits them; paths get corners and lose points', () => {
  const files = twoRooms();
  const edit = new RoomEdit(files['rooms/lab.json']);
  assert.equal(edit.placeEnemy([2, 0, 6], 'bug'), null, 'an enemy is there');
  assert.equal(edit.placeEnemy([1, 0, 4], 'bug'), 'bug_2');
  assert.deepEqual(edit.item('bug_2'), { id: 'bug_2', template: 'bug', at: [1, 0, 4] });

  // A click off both axes adds a corner: along x first, then z.
  assert.equal(edit.addWaypoint('bug_2', [4, 0, 1]), true);
  assert.deepEqual(edit.item('bug_2').path, { points: [[4, 0, 4], [4, 0, 1]] });
  assert.equal(edit.addWaypoint('bug_2', [4, 0, 1]), false, 'already the last point');
  assert.equal(edit.setPathOptions('bug_2', { mode: 'loop', pause: 0.5 }), true);
  assert.equal(edit.removeWaypoint('bug_2'), true);
  assert.deepEqual(edit.item('bug_2').path, { points: [[4, 0, 4]], mode: 'loop', pause: 0.5 });
  assert.equal(edit.removeWaypoint('bug_2'), true);
  assert.equal('path' in edit.item('bug_2'), false, 'the last point takes the path with it');
  assert.equal(edit.setPathOptions('bug_2', { mode: 'loop' }), false, 'no path to set');

  // A lift up: points differ on y only. Hand-written key order stays.
  assert.equal(edit.addWaypoint('lift', [5, 3, 5]), true);
  assert.deepEqual(edit.item('lift').path.points, [[5, 2, 5], [5, 3, 5]]);
  edit.removeWaypoint('lift');
  assert.equal(edit.addWaypoint('bug_2', [1, 0, 7]), true);
  assert.deepEqual(validateData({ ...files, 'rooms/lab.json': edit.toData() }), []);
});

test('RoomEdit opens, edits and removes exits; they lead to the rooms next to it on the map (D259)', () => {
  const files = twoRooms();
  const hall = new RoomEdit(files['rooms/hall.json']);
  const lab = new RoomEdit(files['rooms/lab.json']);

  // An edge cell in the east side opens a second east exit there; one near the end shifts back to fit.
  assert.equal(hall.exitAt('+x', [7, 0, 4]).id, 'east');
  assert.equal(hall.exitAt('+x', [7, 2, 4]), null, 'above the opening');
  assert.equal(hall.placeExit('+x', [7, 0, 4]), null, 'clashes with east');
  assert.equal(hall.placeExit('+x', [7, 0, 7]), 'east_2');
  assert.deepEqual(hall.exits[1], { id: 'east_2', side: '+x', at: 6 });
  assert.equal(hall.placeExit('-z', [2, 1, 0], { width: 3, height: 2 }), 'north');
  assert.deepEqual(hall.exits[2], { id: 'north', side: '-z', at: 2, width: 3, y: 1 });
  const errors = validateData(withEdits(files, hall)).join('\n');
  assert.match(errors, /exit "east_2" has no exit to lead to in "lab"/);
  assert.match(errors, /exit "north" leads nowhere/);

  // The east wall's exits pair up in order along it: with "door" gone, east_2 leads to lab.west.
  assert.equal(hall.updateExit('east', { id: 'door' }), true);
  hall.removeExit('door');
  hall.removeExit('north');
  assert.deepEqual(validateData(withEdits(files, hall, lab)), []);
  // One-way (D259): written to the file, and a way in only.
  assert.equal(hall.updateExit('east_2', { oneWay: true }), true);
  assert.deepEqual(hall.exits[0], { id: 'east_2', side: '+x', at: 6, oneWay: true });
  assert.deepEqual(validateData(withEdits(files, hall, lab)), []);

  hall.undo();
  hall.undo();
  hall.undo();
  hall.undo();
  assert.deepEqual(hall.exits.map((exit) => exit.id), ['east', 'east_2', 'north']);
  assert.equal(hall.revert(), true);
  assert.deepEqual(hall.exits, [{ id: 'east', side: '+x', at: 3 }]);
  assert.equal(hall.dirty, false);
});

test('newRoom is a valid empty room; roomIdProblem refuses bad and taken ids', () => {
  const room = newRoom('data_vault', 'home');
  assert.equal(room.name, 'Data Vault');
  assert.equal(room.jump, 'pads', 'new rooms are pads rooms (D222)');
  assert.deepEqual(validateData(dataFiles({ rooms: [room] })), []);
  const edit = new RoomEdit(room, { fresh: true });
  assert.equal(edit.dirty, true, 'a new room is unsaved');
  edit.markSaved();
  assert.equal(edit.dirty, false);
  assert.equal(roomIdProblem('data_vault', ['hall']), null);
  assert.match(roomIdProblem('hall', ['hall']), /taken/);
  assert.match(roomIdProblem('Data Vault', []), /lowercase/);
  assert.match(roomIdProblem('../world', []), /lowercase/);
});

test('enemy templates take the values of the ones they build on, down the chain; validation checks them', () => {
  const types = { bug: BUG, tank: { extends: 'bug', integrity: 4, color: '#ffb020' }, big_tank: { extends: 'tank', damage: 2 } };
  const resolved = resolveEnemyTemplates(types);
  assert.deepEqual(resolved.bug, BUG);
  assert.deepEqual(resolved.tank, { ...BUG, integrity: 4, color: '#ffb020' });
  assert.deepEqual(resolved.big_tank, { ...BUG, integrity: 4, color: '#ffb020', damage: 2 });
  assert.deepEqual(templateChain(types, 'big_tank'), { chain: ['big_tank', 'tank', 'bug'], loop: false, unknown: null });

  const room = roomFile('lab', { enemies: [{ id: 'tank_1', template: 'tank', at: [4, 0, 4], path: { points: [[6, 0, 4]] } }] });
  const files = dataFiles({ rooms: [room], enemies: types });
  assert.deepEqual(validateData(files), []);
  assert.deepEqual(checkSchemas(files, readSchemas(fileURLToPath(new URL('..', import.meta.url)))), [], 'a template needs only what it changes');
  const built = buildRoom(room, loadGameData(files));
  assert.equal(built.enemies[0].look, 'bug');
  assert.equal(built.enemies[0].integrity, 4);

  const bad = (enemies) => validateData(dataFiles({ rooms: [roomFile('lab')], enemies })).join('\n');
  assert.equal(bad({ bug: BUG, tank: { extends: 'bug' }, boss: { extends: 'tank' } }), '', 'a template may build on a template');
  assert.match(bad({ bug: BUG, tank: { extends: 'beetle' } }), /enemies\.tank\.extends: unknown enemy template "beetle"/);
  assert.match(bad({ bug: BUG, a: { extends: 'b' }, b: { extends: 'a' } }), /enemies\.a\.extends: a loop: a → b → a/);
  const { color, ...colorless } = BUG;
  assert.match(bad({ bug: colorless, tank: { extends: 'bug' } }), /enemies\.bug: missing color/);
  assert.match(bad({ bug: colorless, tank: { extends: 'bug' } }), /enemies\.tank: missing color/);
});

test('RoomEdit removes items, and ids the editor made follow a new type', () => {
  const files = twoRooms();
  const edit = new RoomEdit(files['rooms/lab.json']);
  assert.equal(edit.idFor(edit.item('bug_1'), 'bug', 'bug'), 'bug_1');
  assert.equal(edit.idFor(edit.item('bug_1'), 'bug', 'bug_tank'), 'bug_tank_1');
  assert.equal(edit.idFor(edit.item('lift'), 'platform', 'crate'), 'lift', 'written by hand: stays');

  // A new template renames it; a stationary one loses its path; the same template changes nothing.
  assert.equal(edit.setEnemy('bug_1', 'virus', false), 'virus_1');
  assert.deepEqual(edit.item('virus_1'), { id: 'virus_1', template: 'virus', at: [2, 0, 6] });
  assert.equal(edit.setEnemy('virus_1', 'virus', false), null);

  assert.equal(edit.removeItem('virus_1'), true);
  assert.equal(edit.removeItem('virus_1'), false);
  assert.equal(edit.item('virus_1'), null);
  edit.undo();
  assert.equal(edit.item('virus_1').template, 'virus');
});

test('RoomEdit moves exits along their side and up, not onto another exit', () => {
  const files = twoRooms();
  const hall = new RoomEdit(files['rooms/hall.json']);
  hall.placeExit('+x', [7, 0, 0]);
  assert.deepEqual(hall.exits[1], { id: 'east_2', side: '+x', at: 0 });
  assert.equal(hall.exitClashes('east_2', { at: 2 }), true, 'runs into east (3–4)');
  assert.equal(hall.exitClashes('east_2', { at: 1 }), false);
  assert.equal(hall.exitClashes('east_2', { y: 2 }), false, 'above east');
  assert.equal(hall.updateExit('east_2', { at: 5, y: 1 }), true);
  assert.deepEqual(hall.exits[1], { id: 'east_2', side: '+x', at: 5, y: 1 });
});

test('RoomEdit locks and unlocks an exit (D75); a moved locked exit stays locked', () => {
  const hall = new RoomEdit(twoRooms()['rooms/hall.json']);
  assert.equal(hall.updateExit('east', { locked: true }), true);
  assert.deepEqual(hall.exits[0].requires, [{ switch: '*' }]);
  assert.equal(hall.updateExit('east', { at: 2 }), true);
  assert.deepEqual(hall.exits[0].requires, [{ switch: '*' }]);
  assert.equal(hall.updateExit('east', { locked: false }), true);
  assert.equal('requires' in hall.exits[0], false, 'unlocked is the default, left out');
});

test('RoomEdit.describe says what is in a cell', () => {
  const edit = new RoomEdit({ ...sampleRoom(), exits: [{ id: 'west', side: '-x', at: 3 }] });
  assert.equal(edit.describe([3, 0, 3]), '3, 0, 3: crate_1 (crate)');
  assert.equal(edit.describe([6, 0, 6]), '6, 0, 6: fence block');
  assert.equal(edit.describe([0, 0, 0]), '0, 0, 0: block');
  assert.equal(edit.describe([0, 1, 4]), '0, 1, 4: exit west');
  assert.equal(edit.describe([2, 2, 2]), '2, 2, 2: empty');
  assert.equal(edit.describe([4, 0, 4], { tile: true }), 'tile 4, 4: hole');
  assert.equal(edit.describe([3, 2, 3], { tile: true }), 'tile 3, 3: floor');
});

test('RoomEdit keeps its text until the next change', () => {
  const edit = new RoomEdit(sampleRoom());
  const text = edit.text();
  assert.equal(edit.text(), text);
  edit.placeBlock([2, 2, 2], 'block');
  assert.notEqual(edit.text(), text);
  edit.undo();
  assert.equal(edit.text(), text);
  edit.begin();
  edit.placeBlock([2, 2, 2], 'block');
  assert.notEqual(edit.text(), text, 'within a stroke too');
  edit.end();
});

test('errors are grouped by file and point at what they are about', () => {
  const rooms = {
    lab: { exits: [{ id: 'west', side: '-x', at: 3 }], objects: [{ id: 'lift', type: 'platform', at: [1, 0, 1] }], enemies: [{ id: 'bug_1', template: 'bug', at: [2, 0, 2] }] },
  };
  const context = { roomData: (id) => rooms[id] };
  const target = (error) => errorTarget(error, context);
  assert.deepEqual(target('rooms/lab.json › enemies[0]: a patrolling enemy needs a "path"'), { room: 'lab', tool: 'enemy', selected: { kind: 'item', id: 'bug_1' } });
  assert.deepEqual(target('rooms/lab.json › objects[0].path.points[1]: cell [9,0,1] is outside size [8,4,8]'), {
    room: 'lab',
    tool: 'path',
    selected: { kind: 'item', id: 'lift' },
  });
  assert.deepEqual(target('rooms/lab.json › exits[0]: cells 3–4 run past the side (length 4)'), { room: 'lab', tool: 'exit', selected: { kind: 'exit', id: 'west' } });
  assert.deepEqual(target('rooms/lab.json › spawn: the player at [1,0,1] overlaps a block'), { room: 'lab', tool: 'spawn' });
  assert.deepEqual(target('rooms/lab.json › size: width + depth is 40, at most 32 fits the camera'), { room: 'lab' });
  assert.deepEqual(target('rooms/lab.json › exits[0]: exit "west" leads nowhere: no room in the next map cell [-1,0]'), { room: 'lab', tool: 'exit', selected: { kind: 'exit', id: 'west' } });
  assert.equal(target('defs.json › enemies.tank.extends: unknown enemy template "tonk"'), null);
  assert.equal(target('rooms/gone.json › size: bad'), null);
  assert.equal(target('preview failed: boom'), null);

  const groups = groupErrors(['preview failed: boom', 'rooms/lab.json › spawn: a', 'world.json: b', 'rooms/lab.json: c']);
  assert.deepEqual(
    groups.map(({ file, errors }) => [file, errors.map((e) => e.text)]),
    [['', ['preview failed: boom']], ['rooms/lab.json', ['spawn: a', 'c']], ['world.json', ['b']]],
  );
});

test('cutRoom leaves out the blocks above a layer', () => {
  const room = { size: [4, 4, 4], blocks: { block: [[0, 0, 0], [0, 1, 0], [0, 2, 0]], fence: [[1, 3, 1]], fake: [[2, 0, 2]] } };
  const cut = cutRoom(room, 1);
  assert.deepEqual(cut.blocks, { block: [[0, 0, 0], [0, 1, 0]], fence: [], fake: [[2, 0, 2]] });
  assert.equal(room.blocks.block.length, 3, 'the room itself stays whole');
});

test('blockTypeText: what a block type does, for the Block tool\'s type list', () => {
  const types = resolveBlockTypes(BLOCK_TYPES);
  assert.equal(blockTypeText(types.block), 'plain');
  assert.equal(blockTypeText(types.fence), 'fence');
  assert.equal(blockTypeText(types.fake), 'a scan derezzes it');
  assert.equal(blockTypeText(types.collapsing), 'collapses');
  assert.equal(blockTypeText(types.collapsing_regrow), 'collapses, back in 3 s');
  assert.equal(blockTypeText(types.gate), 'solid, gone while powered');
  assert.equal(blockTypeText(types.bridge), 'a sheet over a hole, floor while powered');
  assert.equal(blockTypeText(types.slab), 'a walkway at the top of its cell, headroom under it');
});

test('blockTypeGroups: the Block tool\'s types, static blocks first, then gates by trigger (D141)', () => {
  const groups = blockTypeGroups(resolveBlockTypes(BLOCK_TYPES));
  const ids = Object.fromEntries(groups.map(([label, options]) => [label, options.map(([id]) => id)]));
  assert.deepEqual(Object.keys(ids), ['Static', 'Switch gates', 'Collapsing (step) gates']);
  assert.deepEqual(ids['Switch gates'], ['gate', 'bridge', 'cage']);
  assert.deepEqual(ids['Collapsing (step) gates'], ['collapsing', 'collapsing_regrow']);
  assert.ok(!ids.Static.includes('gate'));
  assert.deepEqual(blockTypeGroups({ block: { look: 'plain' } }).map(([label]) => label), ['Static'], 'empty groups are left out');
});

test('blockTypeGroups: the stairs are one entry, R turns it a quarter each time (D222)', () => {
  const types = resolveBlockTypes(BLOCK_TYPES);
  assert.deepEqual(stairTypes(types), ['stair_x', 'stair_z', 'stair_nx', 'stair_nz']);
  const statics = blockTypeGroups(types).find(([label]) => label === 'Static')[1];
  assert.deepEqual(statics.filter(([id]) => id.startsWith('stair')), [['stair_x', 'stair (R turns it)']]);
  assert.ok(statics.some(([id]) => id === 'slab'));
  let id = 'stair_x';
  const turns = [];
  for (let i = 0; i < 4; i++) turns.push((id = turnStair(types, id)));
  assert.deepEqual(turns, ['stair_z', 'stair_nx', 'stair_nz', 'stair_x']);
  assert.equal(turnStair(types, 'block'), 'block', 'only a stair turns');
});


test('objectTypeText: what an object or pickup type does, for the Object tool\'s list (D146)', () => {
  const crate = { kind: 'pushable', color: '#b6ff3c', mark: 'bits' };
  assert.equal(objectTypeText(crate), 'bits mark');
  assert.equal(objectTypeText({ ...crate, mark: 'none' }), 'plain');
  assert.equal(objectTypeText({ ...crate, mark: 'none', integrity: 1 }), 'breaks after 1 hit');
  assert.equal(objectTypeText({ ...crate, mark: 'none', integrity: 2, edges: 'dashed' }), 'breaks after 2 hits, dashed edges');
  assert.equal(objectTypeText({ kind: 'platform' }), 'rides its path');
  assert.equal(objectTypeText({ kind: 'platform', damage: 1 }), 'spiked, hurts 1');
  assert.equal(objectTypeText({ kind: 'pad', launch: 2.2 }), 'throws him 2 up, over a 1-tile gap');
  assert.equal(objectTypeText({ kind: 'disk', spell: 'zap' }), 'spell zap');
  assert.equal(objectTypeText({ kind: 'upgrade', upgrade: 'shield_plus', slot: 1 }), 'upgrade');
  assert.equal(objectTypeText({ kind: 'upgrade', upgrade: 'zap_plus', slot: 0, spell: 'zap' }), 'upgrade of zap');
  assert.equal(objectTypeText({ kind: 'buff', slot: 4, stat: 'energy', amount: 10 }), '+10 energy');
  assert.equal(objectTypeText({ kind: 'buff', slot: 9, stat: 'recharge', amount: 4 }), 'faster recharge');
  assert.equal(objectTypeText({ kind: 'refill', stat: 'integrity', amount: 3 }), 'refills 3 integrity');
  assert.equal(objectTypeText({ kind: 'fragment', slot: 12 }), 'slot 12');
  assert.equal(objectTypeText({ kind: 'access', level: 3 }), 'access level 3');
});

test('placesText: where a permanent pickup lies, a room placed twice counted (D146)', () => {
  assert.equal(placesText([]), 'not placed');
  assert.equal(placesText(['boot']), 'in boot');
  assert.equal(placesText(['a', 'b', 'a']), 'in a ×2, b');
});

test('objectTypeGroups: objects then pickups by kind, labels with where pickups lie (D146)', () => {
  const types = {
    crate: { kind: 'pushable', color: '#b6ff3c' },
    disk_zap: { kind: 'disk', spell: 'zap' },
    lift: { kind: 'platform', color: '#00f0ff' },
    pad: { kind: 'pad', launch: 2.2 },
    fragment_0: { kind: 'fragment', slot: 0 },
    fragment_1: { kind: 'fragment', slot: 1 },
    refill_energy: { kind: 'refill', stat: 'energy', amount: 30 },
  };
  const places = new Map([['disk_zap', ['boot']], ['fragment_0', []], ['fragment_1', ['a', 'b']]]);
  const groups = objectTypeGroups(types, places);
  assert.deepEqual(groups.map(([label]) => label), ['Crates', 'Platforms', 'Pads', 'Spells', 'Refills', 'Fragments']);
  const labels = Object.fromEntries(groups.flatMap(([, options]) => options));
  assert.equal(labels.crate, 'crate (plain)');
  assert.equal(labels.disk_zap, 'disk_zap (spell zap · in boot)');
  assert.equal(labels.fragment_0, 'fragment_0 (slot 0 · not placed)');
  assert.equal(labels.fragment_1, 'fragment_1 (slot 1 · in a, b)');
  assert.equal(labels.refill_energy, 'refill_energy (refills 30 energy)', 'refills are not permanent: no places');
  assert.equal(objectTypeGroups(types)[3][1][0][1], 'disk_zap (spell zap)', 'without places, only what it does');
});

test('templateText: what an enemy template does, for the Enemy tool (D119)', () => {
  assert.equal(templateText(BUG), 'bug · patrol · touch · hostile · 2 hits · speed 3 · bouncy');
  const tower = { ...BUG, look: 'cron', movement: 'stationary', attack: 'bolt', boltPattern: 'cross', integrity: 1, bounce: false, solid: true, pausable: false };
  assert.equal(templateText(tower), 'cron · stationary · bolt ×4 · hostile · 1 hit · speed 3 · solid · unpausable');
});

test('RoomEdit moves and removes the backup shrine, written after the holes; a resize drops it when outside (D97)', () => {
  const edit = new RoomEdit(sampleRoom());
  assert.equal(edit.setShrine(null), false, 'no shrine to remove');
  assert.equal(edit.setShrine([2, 6]), true);
  assert.equal(edit.setShrine([2, 6]), false, 'already there');
  assert.equal(edit.describe([2, 0, 6], { tile: true }), 'tile 2, 6: floor, shrine');
  const keys = Object.keys(edit.toData());
  assert.equal(keys.indexOf('shrine'), keys.indexOf('holes') + 1);
  assert.deepEqual(edit.toData().shrine, [2, 6]);
  assert.equal(edit.setShrine([5, 5]), true);
  assert.ok(edit.resize([4, 4, 8]).dropped.includes('the shrine'));
  assert.equal(edit.toData().shrine, undefined);
  edit.undo();
  assert.deepEqual(edit.toData().shrine, [5, 5]);
});

/** The editor camera looks from +x +y +z (isometric), so a ray runs towards -x -y -z. */
const DIR = [-1, -Math.SQRT2, -1];

/** A ray through point `p`, starting well above it. */
const through = (p) => [p[0] + 10, p[1] + 10 * Math.SQRT2, p[2] + 10];

const TYPES = {
  crate: { kind: 'pushable', color: '#b6ff3c' },
  plate: { kind: 'plate', color: '#eef3ff' },
  pillar: { kind: 'deco', look: 'data_pillar', color: '#ffb020' },
};

function room() {
  return new RoomEdit(
    roomFile('alpha', {
      blocks: [{ type: 'block', at: [3, 0, 3] }, { type: 'block', at: [6, 2, 6] }],
      objects: [
        { id: 'c', type: 'crate', at: [5, 0, 2] },
        { id: 'p', type: 'plate', at: [2, 0, 6] },
        { id: 'd', type: 'pillar', at: [1, 0, 1] },
      ],
    }),
  );
}

test('editor pick: a ray enters a box, or misses it', () => {
  assert.equal(rayBox([0, 5, 0], [0, -1, 0], [-1, 0, -1], [1, 1, 1]), 4);
  assert.equal(rayBox([3, 5, 0], [0, -1, 0], [-1, 0, -1], [1, 1, 1]), null);
  assert.equal(rayBox([0, -5, 0], [0, -1, 0], [-1, 0, -1], [1, 1, 1]), null, 'behind the ray');
  assert.equal(firstHit([0, 5, 0], [0, -1, 0], [{ cell: [0, 0, 0], lo: [-1, 0, -1], hi: [1, 1, 1] }, { cell: [0, 1, 0], lo: [-1, 1, -1], hi: [1, 2, 1] }]).cell.join(), '0,1,0');
});

test('editor pick: the top of a block on the layer is the block, not the floor behind it', () => {
  const edit = room();
  const boxes = hitBoxes(edit, TYPES, { cutAbove: 0 });
  // The middle of the block's top: the layer plane there lies behind the block, in cell 2,0,2.
  const top = [3.5, 1, 3.5];
  assert.deepEqual(pickCell(through(top), DIR, boxes, 0).cell, [3, 0, 3]);
  // Open floor: the layer's cell (null: the caller makes it).
  const floor = pickCell(through([4.5, 0, 6.5]), DIR, boxes, 0);
  assert.equal(floor.cell, null);
  assert.deepEqual(floor.point.map((v) => Math.round(v * 100) / 100), [4.5, 0, 6.5]);
  // On layer 1 the same spot is the free cell on top of the block.
  assert.equal(pickCell(through(top), DIR, hitBoxes(edit, TYPES, { cutAbove: 1 }), 1).cell, null);
});

test('editor pick: items by their own cell, cut away above the layer, plates thin', () => {
  const edit = room();
  const boxes = hitBoxes(edit, TYPES, { cutAbove: 0 });
  assert.deepEqual(pickCell(through([5.5, 1, 2.5]), DIR, boxes, 0).cell, [5, 0, 2], 'the crate');
  // The tall pillar's side, high above its own cell: still the pillar at 1,0,1.
  assert.deepEqual(pickCell(through([2, 2.5, 1.5]), DIR, boxes, 0).cell, [1, 0, 1]);
  // A ray just past a plate's top edge reaches the floor behind it.
  assert.equal(pickCell(through([1.9, 0.5, 6.5]), DIR, boxes, 0).cell, null);
  // The block at layer 2 is cut away on layer 0, seen (and hit) with nothing cut.
  const high = through([6.5, 3, 6.5]);
  assert.equal(pickCell(high, DIR, boxes, 0).cell, null);
  assert.deepEqual(pickCell(high, DIR, hitBoxes(edit, TYPES), 0).cell, [6, 2, 6]);
  // Items only (the Path tool): blocks don't count.
  assert.equal(pickCell(through([3.5, 1, 3.5]), DIR, hitBoxes(edit, TYPES, { cutAbove: 0, blocks: false }), 0).cell, null);
});
