import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Boxes } from '../src/editor/boxes.js';
import { formatJson } from '../src/editor/format-json.js';
import { RoomEdit, newRoom, resizeText, roomIdProblem, sizeProblem } from '../src/editor/room-edit.js';
import { WorldEdit, linkChoices } from '../src/editor/world-edit.js';
import { idProblem } from '../src/editor/ids.js';
import { MAX_ACCESS_LEVEL, ROOM_HEIGHT } from '../src/core/rules.js';
import { errorTarget, groupErrors } from '../src/editor/errors.js';
import { cutRoom } from '../src/render/room-scene.js';
import { validateData } from '../src/data/validate.js';
import { loadGameData } from '../src/data/load.js';
import { resolveBlockTypes, resolveEnemyTemplates, templateChain } from '../src/data/room-data.js';
import { blockTypeGroups, blockTypeText, objectTypeGroups, objectTypeText, placesText, templateText } from '../src/editor/panel.js';
import { buildRoom } from '../src/world/room.js';
import { checkSchemas, readSchemas } from '../tools/check-data.js';
import { refuseSaveRequest, saveEdits } from '../tools/room-save.js';
import { BLOCK_TYPES, BUG, LIFT, dataFiles, roomFile, testWorld, writeDataFiles } from './helpers.js';

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
      { type: 'hazard', at: [5, 0, 5] },
    ],
    { dims: 3, defaultType: 'block' },
  );
  assert.equal(boxes.get([1, 0, 0]), 'block');
  assert.equal(boxes.get([5, 0, 5]), 'hazard');
  assert.equal(boxes.get([4, 0, 4]), null);

  // Emptying the middle of the first entry breaks it; the second stays as written.
  assert.equal(boxes.set([1, 0, 0], null), true);
  assert.equal(boxes.set([1, 0, 0], null), false);
  assert.deepEqual(boxes.list(), [{ type: 'hazard', at: [5, 0, 5] }, { at: [0, 0, 0] }, { at: [2, 0, 0] }]);

  // A 2×2×2 cube of new cells becomes one box; another type stays apart.
  for (const x of [7, 8]) for (const y of [0, 1]) for (const z of [7, 8]) boxes.set([x, y, z], 'void');
  boxes.set([1, 0, 0], 'void');
  assert.deepEqual(boxes.list().slice(1), [
    { at: [0, 0, 0] },
    { type: 'void', at: [1, 0, 0] },
    { at: [2, 0, 0] },
    { type: 'void', at: [7, 0, 7], to: [8, 1, 8] },
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
    blocks: [{ at: [0, 0, 0], to: [1, 0, 0] }, { type: 'hazard', at: [6, 0, 6] }],
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
  assert.deepEqual(edit.at([6, 0, 6]), { kind: 'block', type: 'hazard' });

  // A block replaces the crate; a crate goes where the hazard was, with the next free id.
  assert.equal(edit.placeBlock([3, 0, 3], 'void'), true);
  assert.equal(edit.placeBlock([3, 0, 3], 'void'), false);
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
    { type: 'void', at: [3, 0, 3] },
    { type: 'collapsing_regrow', at: [2, 1, 2] },
  ]);
  assert.deepEqual(data.objects, [{ id: 'crate_1', type: 'crate', at: [6, 0, 6] }]);
  assert.equal(data.enemies, undefined, 'an empty list is left out');
  assert.deepEqual(data.holes, [{ at: [1, 5] }]);
  assert.equal(edit.dirty, true);
  edit.markSaved();
  assert.equal(edit.dirty, false);
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

test('RoomEdit.linksChanged tells the room\'s own connections from other rooms\'', () => {
  const world = new WorldEdit({ start: 'a', connections: [] });
  const a = new RoomEdit({ ...sampleRoom(), id: 'a' }, { world });
  const b = new RoomEdit({ ...sampleRoom(), id: 'b' }, { world });
  world.connect('b.east', 'c.west');
  assert.equal(a.linksChanged, false);
  assert.equal(b.linksChanged, true);
  assert.equal(a.revert(), false, 'nothing of a to revert');
  assert.equal(b.revert(), true);
  assert.deepEqual(world.connections, []);
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

  const world = new WorldEdit({ start: 'a', connections: [] });
  world.connect('a.east', 'b.west');
  const worldSent = world.text();
  world.disconnect('a.east');
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
    for (const dir of ['data', 'schemas']) cpSync(fileURLToPath(new URL(`../${dir}`, import.meta.url)), join(root, dir), { recursive: true });
    const file = join(root, 'data/rooms/boot_sector.json');
    const before = readFileSync(file, 'utf8');
    const room = JSON.parse(before);

    // Invalid: a block where the wizard spawns. Nothing is written.
    const blocked = { ...room, blocks: [...room.blocks, { at: room.spawn.map(Math.floor) }] };
    const refused = saveEdits(root, { rooms: [blocked] });
    assert.equal(refused.ok, false);
    assert.match(refused.errors.join('\n'), /rooms\/boot_sector\.json › spawn/);
    assert.equal(readFileSync(file, 'utf8'), before);

    // Schema errors count too; so do bad ids and a new room's unconnected exit.
    assert.equal(saveEdits(root, { rooms: [{ ...room, size: [12, 9, 12] }] }).ok, false);
    assert.equal(saveEdits(root, { rooms: [{ ...room, id: '../world' }] }).ok, false);
    assert.equal(saveEdits(root, {}).ok, false);
    const annex = { ...newRoom('annex', 'home_lattice'), exits: [{ id: 'west', side: '-x', at: 2 }] };
    assert.match(saveEdits(root, { rooms: [annex] }).errors.join('\n'), /exit "annex\.west" is not connected/);

    // Valid: a new room with an exit into Boot Sector's new east exit, and world.json connecting them.
    const world = JSON.parse(readFileSync(join(root, 'data/world.json'), 'utf8'));
    const exitFree = { ...room, name: 'Boot Sector Two', exits: [...room.exits, { id: 'east_2', side: '+x', at: 8 }] };
    world.connections.push(['boot_sector.east_2', 'annex.west']);
    world.positions.annex = [5, 5];
    const saved = saveEdits(root, { rooms: [exitFree, annex], world });
    assert.deepEqual(saved, { ok: true, errors: [], files: ['data/rooms/boot_sector.json', 'data/rooms/annex.json', 'data/world.json'] });
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
    writeDataFiles(root, testWorld());
    const read = () => JSON.parse(readFileSync(join(root, 'data/world.json'), 'utf8'));
    const before = read();

    // The editor loaded world.json before the move below.
    const stale = structuredClone(before);
    assert.deepEqual(saveEdits(root, { positions: { cache_hall: [4, -3] } }).files, ['data/world.json']);
    assert.deepEqual(read(), { ...before, positions: { ...before.positions, cache_hall: [4, -3] } });

    // A room saved from the editor with a connection gone (the first one, with
    // both its exits): the move stays, the connection change is saved.
    const [dropped] = stale.connections;
    stale.connections = stale.connections.slice(1);
    const rooms = dropped.map((ref) => {
      const [roomId, exitId] = ref.split('.');
      const room = JSON.parse(readFileSync(join(root, `data/rooms/${roomId}.json`), 'utf8'));
      return { ...room, exits: room.exits.filter((exit) => exit.id !== exitId) };
    });
    assert.equal(saveEdits(root, { rooms, world: stale }).ok, true);
    assert.deepEqual(read().positions.cache_hall, [4, -3]);
    assert.deepEqual(read().connections, stale.connections);

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

/** The data with an edited room and world put in. */
const withEdits = (files, world, ...edits) => ({ ...files, 'world.json': world.toData(), ...Object.fromEntries(edits.map((e) => [`rooms/${e.id}.json`, e.toData()])) });

test('WorldEdit connects, disconnects and renames exits; setLinks keeps the order', () => {
  const world = new WorldEdit({ schemaVersion: 1, start: 'a', connections: [['a.n', 'b.s'], ['b.e', 'c.w'], ['a.e', 'c.x']] });
  assert.equal(world.partner('b.s'), 'a.n');
  assert.equal(world.partner('a.w'), null);
  assert.equal(world.dirty, false);
  assert.equal(world.connect('a.n', 'b.s'), false);
  assert.equal(world.connect('a.n', 'c.w'), true, 'drops both old connections');
  assert.deepEqual(world.connections, [['a.e', 'c.x'], ['a.n', 'c.w']]);
  world.rename('a.e', 'a.east');
  assert.deepEqual(world.linksOf('a'), [['a.east', 'c.x'], ['a.n', 'c.w']]);
  assert.deepEqual(world.savedLinksOf('a'), [['a.n', 'b.s'], ['a.e', 'c.x']]);
  // Back to the saved links of room a: b.e–c.w stays gone (it isn't room a's).
  world.setLinks('a', world.savedLinksOf('a'));
  assert.deepEqual(world.connections, [['a.n', 'b.s'], ['a.e', 'c.x']]);
  assert.equal(world.disconnect('a.n'), true);
  assert.equal(world.disconnect('a.n'), false);
  assert.equal(world.dirty, true);
});

test('WorldEdit puts a new room next to the room it was made from, and takes it off again', () => {
  const world = new WorldEdit({ schemaVersion: 1, start: 'a', connections: [], positions: { a: [0, 0], b: [1, 0] } });
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

test('RoomEdit opens, edits and removes exits, with their connections', () => {
  const files = twoRooms();
  const world = new WorldEdit(files['world.json']);
  const hall = new RoomEdit(files['rooms/hall.json'], { world });
  const lab = new RoomEdit(files['rooms/lab.json'], { world });

  // An edge cell in the east side opens a second east exit there; one near the end shifts back to fit.
  assert.equal(hall.exitAt('+x', [7, 0, 4]).id, 'east');
  assert.equal(hall.exitAt('+x', [7, 2, 4]), null, 'above the opening');
  assert.equal(hall.placeExit('+x', [7, 0, 4]), null, 'clashes with east');
  assert.equal(hall.placeExit('+x', [7, 0, 7]), 'east_2');
  assert.deepEqual(hall.exits[1], { id: 'east_2', side: '+x', at: 6 });
  assert.equal(hall.placeExit('-z', [2, 1, 0], { width: 3, height: 2 }), 'north');
  assert.deepEqual(hall.exits[2], { id: 'north', side: '-z', at: 2, width: 3, y: 1 });
  assert.match(validateData(withEdits(files, world, hall)).join('\n'), /exit "hall\.east_2" is not connected/);

  // Renaming an exit renames its connection; linking moves it.
  assert.equal(hall.updateExit('east', { id: 'door' }), true);
  assert.deepEqual(world.connections, [['hall.door', 'lab.west']]);
  assert.equal(hall.linkExit('east_2', 'lab.west'), true);
  assert.deepEqual(world.connections, [['hall.east_2', 'lab.west']]);
  hall.removeExit('door');
  hall.removeExit('north');
  assert.deepEqual(validateData(withEdits(files, world, hall, lab)), []);

  // Undo takes the connections along: back to hall.door ↔ lab.west.
  hall.undo();
  hall.undo();
  hall.undo();
  assert.deepEqual(world.connections, [['hall.door', 'lab.west']]);
  assert.equal(hall.revert(), true);
  assert.deepEqual(world.connections, [['hall.east', 'lab.west']]);
  assert.deepEqual(hall.exits, [{ id: 'east', side: '+x', at: 3 }]);
  assert.equal(hall.dirty, false);
  assert.equal(world.dirty, false);
});

test('newRoom is a valid empty room; roomIdProblem refuses bad and taken ids', () => {
  const room = newRoom('data_vault', 'home');
  assert.equal(room.name, 'Data Vault');
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
  assert.equal(edit.describe([6, 0, 6]), '6, 0, 6: hazard block');
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

test('linkChoices lists free exits of other rooms in the opposite side, equally wide', () => {
  const rooms = {
    a: { exits: [{ id: 'e', side: '+x', at: 0 }] },
    b: { exits: [{ id: 'w', side: '-x', at: 0 }, { id: 'w2', side: '-x', at: 4, width: 3 }, { id: 'n', side: '-z', at: 0 }] },
    c: { exits: [{ id: 'w', side: '-x', at: 0 }] },
  };
  const world = new WorldEdit({ start: 'a', connections: [['c.w', 'b.x']] });
  const choices = (exit) => linkChoices(world, Object.keys(rooms), (id) => rooms[id], 'a', exit);
  assert.deepEqual(choices(rooms.a.exits[0]), ['b.w']);
  world.connect('a.e', 'c.w');
  assert.deepEqual(choices(rooms.a.exits[0]), ['b.w', 'c.w'], 'its own partner too');
});

test('errors are grouped by file and point at what they are about', () => {
  const rooms = {
    lab: { exits: [{ id: 'west', side: '-x', at: 3 }], objects: [{ id: 'lift', type: 'platform', at: [1, 0, 1] }], enemies: [{ id: 'bug_1', template: 'bug', at: [2, 0, 2] }] },
  };
  const context = { roomData: (id) => rooms[id], connections: [['lab.west', 'hall.east']] };
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
  assert.deepEqual(target('world.json › connections: exit "lab.west" is not connected'), { room: 'lab', tool: 'exit', selected: { kind: 'exit', id: 'west' } });
  assert.deepEqual(target('world.json › connections[0]: exits must be equally wide (2 and 3)'), { room: 'lab', tool: 'exit', selected: { kind: 'exit', id: 'west' } });
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
  const room = { size: [4, 4, 4], blocks: { block: [[0, 0, 0], [0, 1, 0], [0, 2, 0]], hazard: [[1, 3, 1]], void: [[2, 0, 2]] } };
  const cut = cutRoom(room, 1);
  assert.deepEqual(cut.blocks, { block: [[0, 0, 0], [0, 1, 0]], hazard: [], void: [[2, 0, 2]] });
  assert.equal(room.blocks.block.length, 3, 'the room itself stays whole');
});

test('blockTypeText: what a block type does, for the Block tool\'s type list', () => {
  const types = resolveBlockTypes({ ...BLOCK_TYPES, hot: { extends: 'hazard', damage: 2 } });
  assert.equal(blockTypeText(types.block), 'plain');
  assert.equal(blockTypeText(types.hot), 'hurts 2');
  assert.equal(blockTypeText(types.void), 'lethal');
  assert.equal(blockTypeText(types.fake), 'a scan derezzes it');
  assert.equal(blockTypeText(types.collapsing), 'collapses');
  assert.equal(blockTypeText(types.collapsing_regrow), 'collapses, back in 3 s');
  assert.equal(blockTypeText(types.gate), 'solid, gone while powered');
  assert.equal(blockTypeText(types.bridge), 'gone, there while powered');
});

test('blockTypeGroups: the Block tool\'s types, static blocks first, then gates by trigger (D141)', () => {
  const groups = blockTypeGroups(resolveBlockTypes(BLOCK_TYPES));
  const ids = Object.fromEntries(groups.map(([label, options]) => [label, options.map(([id]) => id)]));
  assert.deepEqual(Object.keys(ids), ['Static', 'Switch gates', 'Collapsing (step) gates']);
  assert.deepEqual(ids['Switch gates'], ['gate', 'bridge']);
  assert.deepEqual(ids['Collapsing (step) gates'], ['collapsing', 'collapsing_regrow']);
  assert.ok(!ids.Static.includes('gate'));
  assert.deepEqual(blockTypeGroups({ block: { look: 'plain' } }).map(([label]) => label), ['Static'], 'empty groups are left out');
});


test('objectTypeText: what an object or pickup type does, for the Object tool\'s list (D146)', () => {
  const crate = { kind: 'pushable', color: '#b6ff3c', mark: 'bits' };
  assert.equal(objectTypeText(crate), 'bits mark');
  assert.equal(objectTypeText({ ...crate, mark: 'none' }), 'plain');
  assert.equal(objectTypeText({ ...crate, mark: 'none', integrity: 1 }), 'breaks after 1 hit');
  assert.equal(objectTypeText({ ...crate, mark: 'none', integrity: 2, edges: 'dashed' }), 'breaks after 2 hits, dashed edges');
  assert.equal(objectTypeText({ kind: 'platform' }), 'rides its path');
  assert.equal(objectTypeText({ kind: 'platform', damage: 1 }), 'spiked, hurts 1');
  assert.equal(objectTypeText({ kind: 'disk', spell: 'zap' }), 'spell zap');
  assert.equal(objectTypeText({ kind: 'upgrade', upgrade: 'double_jump', slot: 2 }), 'upgrade');
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
    fragment_0: { kind: 'fragment', slot: 0 },
    fragment_1: { kind: 'fragment', slot: 1 },
    refill_energy: { kind: 'refill', stat: 'energy', amount: 30 },
  };
  const places = new Map([['disk_zap', ['boot']], ['fragment_0', []], ['fragment_1', ['a', 'b']]]);
  const groups = objectTypeGroups(types, places);
  assert.deepEqual(groups.map(([label]) => label), ['Crates', 'Platforms', 'Spells', 'Refills', 'Fragments']);
  const labels = Object.fromEntries(groups.flatMap(([, options]) => options));
  assert.equal(labels.crate, 'crate (plain)');
  assert.equal(labels.disk_zap, 'disk_zap (spell zap · in boot)');
  assert.equal(labels.fragment_0, 'fragment_0 (slot 0 · not placed)');
  assert.equal(labels.fragment_1, 'fragment_1 (slot 1 · in a, b)');
  assert.equal(labels.refill_energy, 'refill_energy (refills 30 energy)', 'refills are not permanent: no places');
  assert.equal(objectTypeGroups(types)[2][1][0][1], 'disk_zap (spell zap)', 'without places, only what it does');
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
