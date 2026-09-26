import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Boxes } from '../src/editor/boxes.js';
import { formatJson } from '../src/editor/format-json.js';
import { RoomEdit, roomErrors, sizeProblem } from '../src/editor/room-edit.js';
import { saveRoom } from '../tools/room-save.js';
import { CRUMBLE, dataFiles, roomFile } from './helpers.js';

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

test('saveRoom writes a valid room and refuses an invalid, unknown or badly named one', () => {
  const root = mkdtempSync(join(tmpdir(), 'neonmancer-'));
  try {
    for (const dir of ['data', 'schemas']) cpSync(fileURLToPath(new URL(`../${dir}`, import.meta.url)), join(root, dir), { recursive: true });
    const file = join(root, 'data/rooms/boot_sector.json');
    const before = readFileSync(file, 'utf8');
    const room = JSON.parse(before);

    // Invalid: a block where the wizard spawns. Nothing is written.
    const blocked = { ...room, blocks: [...room.blocks, { at: room.spawn.map(Math.floor) }] };
    const refused = saveRoom(root, blocked);
    assert.equal(refused.ok, false);
    assert.match(refused.errors.join('\n'), /rooms\/boot_sector\.json › spawn/);
    assert.equal(readFileSync(file, 'utf8'), before);

    // Schema errors count too.
    assert.equal(saveRoom(root, { ...room, size: [12, 9, 12] }).ok, false);
    assert.equal(saveRoom(root, { ...room, id: 'no_such_room' }).ok, false);
    assert.equal(saveRoom(root, { ...room, id: '../world' }).ok, false);

    // Valid: written in the data file style.
    const renamed = { ...room, name: 'Boot Sector Two' };
    assert.deepEqual(saveRoom(root, renamed), { ok: true, errors: [], file: 'data/rooms/boot_sector.json' });
    assert.equal(readFileSync(file, 'utf8'), formatJson(renamed));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
