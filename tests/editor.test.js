import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Boxes } from '../src/editor/boxes.js';
import { formatJson } from '../src/editor/format-json.js';
import { RoomEdit, newRoom, roomErrors, roomIdProblem, sizeProblem } from '../src/editor/room-edit.js';
import { WorldEdit } from '../src/editor/world-edit.js';
import { validateData } from '../src/data/validate.js';
import { loadGameData } from '../src/data/load.js';
import { enemyModels, resolveEnemyTypes } from '../src/data/room-data.js';
import { buildRoom } from '../src/world/room.js';
import { checkSchemas, readSchemas } from '../tools/check-data.js';
import { refuseSaveRequest, saveEdits } from '../tools/room-save.js';
import { BUG, CRUMBLE, LIFT, dataFiles, roomFile } from './helpers.js';

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
    enemies: [{ id: 'sentry', type: 'bug', at: [5, 0, 1], overrides: { movement: 'stationary' } }],
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
  assert.equal(edit.placeObject([2, 1, 2], 'collapsing', { regrow: 3 }), true);
  assert.equal(edit.placeObject([9, 0, 0], 'crate'), false, 'outside the room');
  assert.equal(edit.erase([5, 0, 1]), true);
  assert.equal(edit.erase([5, 0, 1]), false);
  assert.equal(edit.setHole([4, 4], false), true);
  assert.equal(edit.setHole([1, 5], true), true);

  const data = edit.toData();
  assert.deepEqual(data.blocks, [{ at: [0, 0, 0], to: [1, 0, 0] }, { type: 'void', at: [3, 0, 3] }]);
  assert.deepEqual(data.objects, [
    { id: 'crate_1', type: 'crate', at: [6, 0, 6] },
    { id: 'collapsing_1', type: 'collapsing', at: [2, 1, 2], regrow: 3 },
  ]);
  assert.equal(data.enemies, undefined, 'an empty list is left out');
  assert.deepEqual(data.holes, [{ at: [1, 5] }]);
  assert.equal(edit.dirty, true);
  edit.markSaved();
  assert.equal(edit.dirty, false);
});

test('RoomEdit.placeObject on the same object applies the new settings', () => {
  const edit = new RoomEdit(sampleRoom());
  assert.equal(edit.placeObject([2, 1, 2], 'collapsing', { regrow: 3 }), true);
  assert.equal(edit.placeObject([2, 1, 2], 'collapsing', { regrow: 3 }), false, 'nothing to change');
  assert.equal(edit.placeObject([2, 1, 2], 'collapsing', { regrow: 5 }), true);
  // Placed again without a regrow time: it no longer grows back.
  assert.equal(edit.placeObject([2, 1, 2], 'collapsing'), true);
  assert.deepEqual(edit.at([2, 1, 2]).item, { id: 'collapsing_1', type: 'collapsing', at: [2, 1, 2] });
  assert.equal(edit.placeObject([2, 1, 2], 'collapsing'), false);
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

test('RoomEdit.resize drops what ends up outside', () => {
  const edit = new RoomEdit(sampleRoom());
  assert.equal(edit.resize([5, 3, 5]), true);
  const data = edit.toData();
  assert.deepEqual(data.size, [5, 3, 5]);
  assert.deepEqual(data.blocks, [{ at: [0, 0, 0], to: [1, 0, 0] }]);
  assert.deepEqual(data.holes, [{ at: [4, 4] }]);
  assert.deepEqual(data.objects, [{ id: 'crate_1', type: 'crate', at: [3, 0, 3] }]);
  assert.equal(data.enemies, undefined);
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

test('roomErrors checks the edited room with the rest of the data', () => {
  const files = dataFiles({ rooms: [sampleRoom()], objects: { crate: { kind: 'pushable', color: '#b6ff3c' }, collapsing: CRUMBLE } });
  const edit = new RoomEdit(files['rooms/lab.json']);
  assert.deepEqual(roomErrors(files, edit.toData()), []);
  edit.placeBlock([1, 0, 1], 'block'); // under the spawn point
  assert.equal(roomErrors(files, edit.toData()).length, 1);
  assert.match(roomErrors(files, edit.toData())[0], /rooms\/lab\.json › spawn: the player .* overlaps blocks\[/);
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
    const saved = saveEdits(root, { rooms: [exitFree, annex], world });
    assert.deepEqual(saved, { ok: true, errors: [], files: ['data/rooms/boot_sector.json', 'data/rooms/annex.json', 'data/world.json'] });
    assert.equal(readFileSync(file, 'utf8'), formatJson(exitFree));
    assert.equal(readFileSync(join(root, 'data/rooms/annex.json'), 'utf8'), formatJson(annex));
    assert.equal(readFileSync(join(root, 'data/world.json'), 'utf8'), formatJson(world));

    // A template in defs.json and an enemy of it, saved together.
    const defs = JSON.parse(readFileSync(join(root, 'data/defs.json'), 'utf8'));
    defs.enemies.tank = { extends: 'bug', integrity: 4 };
    const guarded = { ...annex, enemies: [{ id: 'tank_1', type: 'tank', at: [3, 0, 3], overrides: { movement: 'stationary' } }] };
    assert.equal(saveEdits(root, { rooms: [guarded] }).ok, false, 'unknown type without the new defs');
    assert.deepEqual(saveEdits(root, { rooms: [guarded], defs }).files, ['data/rooms/annex.json', 'data/defs.json']);
    assert.equal(readFileSync(join(root, 'data/defs.json'), 'utf8'), formatJson(defs));
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

/** Two rooms side by side (lab east of hall), connected; a platform and a bug in lab. */
function twoRooms() {
  return dataFiles({
    rooms: [
      roomFile('hall', { exits: [{ id: 'east', side: '+x', at: 3 }] }),
      roomFile('lab', {
        exits: [{ id: 'west', side: '-x', at: 3 }],
        objects: [{ id: 'lift', type: 'platform', at: [5, 0, 5], path: { points: [[5, 2, 5]] } }],
        enemies: [{ id: 'bug_1', type: 'bug', at: [2, 0, 6], path: { points: [[6, 0, 6]] } }],
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

test('RoomEdit places enemies and edits them; paths get corners and lose points', () => {
  const files = twoRooms();
  const edit = new RoomEdit(files['rooms/lab.json']);
  assert.equal(edit.placeEnemy([2, 0, 6], 'bug'), null, 'an enemy is there');
  assert.equal(edit.placeEnemy([1, 0, 4], 'bug', { movement: 'stationary' }), 'bug_2');
  assert.deepEqual(edit.item('bug_2'), { id: 'bug_2', type: 'bug', at: [1, 0, 4], overrides: { movement: 'stationary' } });
  assert.equal(edit.updateItem('bug_2', { overrides: undefined }), true);
  assert.equal(edit.updateItem('bug_2', { overrides: undefined }), false);

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

test('enemy templates take their base type values and look; validation checks them', () => {
  const types = { bug: BUG, tank: { extends: 'bug', integrity: 4, color: '#ffb020' } };
  const resolved = resolveEnemyTypes(types);
  assert.deepEqual(resolved.tank, { ...BUG, integrity: 4, color: '#ffb020' });
  assert.deepEqual(enemyModels(types), { bug: 'bug', tank: 'bug' });

  const room = roomFile('lab', { enemies: [{ id: 'tank_1', type: 'tank', at: [4, 0, 4], overrides: { movement: 'stationary' } }] });
  const files = dataFiles({ rooms: [room], enemies: types });
  assert.deepEqual(validateData(files), []);
  assert.deepEqual(checkSchemas(files, readSchemas(fileURLToPath(new URL('..', import.meta.url)))), [], 'a template needs only what it changes');
  const built = buildRoom(room, loadGameData(files));
  assert.equal(built.enemies[0].model, 'bug');
  assert.equal(built.enemies[0].integrity, 4);

  const bad = (enemies) => validateData(dataFiles({ rooms: [roomFile('lab')], enemies })).join('\n');
  assert.match(bad({ bug: BUG, tank: { extends: 'beetle' } }), /enemies\.tank\.extends: unknown enemy type "beetle"/);
  assert.match(bad({ bug: BUG, tank: { extends: 'bug' }, boss: { extends: 'tank' } }), /"tank" is a template itself/);
  const { color, ...colorless } = BUG;
  assert.match(bad({ bug: colorless, tank: { extends: 'bug' } }), /enemies\.tank: missing color/);
});
