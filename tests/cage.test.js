import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBlockTypes, resolveObjectTypes } from '../src/data/room-data.js';
import { validateData } from '../src/data/validate.js';
import { RoomEdit } from '../src/editor/room-edit.js';
import { switchClick } from '../src/editor/switch-tool.js';
import { Game } from '../src/game.js';
import { cageLayout } from '../src/render/cage-view.js';
import { analyzeRoom } from '../src/world/reach.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { buildRoom } from '../src/world/room.js';
import { CRATE, dataFiles, eventTypes, gameData, idle, roomFile } from './helpers.js';

test('a cage is bars round a cell: ring, lid, four posts and four side bars, inside the cell', () => {
  const { beams, rails, posts, bars } = cageLayout();
  assert.equal(beams.length, 4);
  assert.equal(rails.length, 6);
  assert.equal(posts.length, 4);
  assert.equal(bars.length, 4);
  for (const segment of [...beams, ...rails, ...posts, ...bars]) {
    for (const point of segment) for (const v of point) assert.ok(v >= 0 && v <= 1);
  }
  // Horizontal beams at half height flow like a fence's lower beam, the rest at the top.
  assert.ok(beams.every((s) => s[0][1] === 0.5));
  assert.ok(rails.every((s) => s[0][1] === 1));
});

// ---- rules (D202)

const TYPES = {
  crate: CRATE,
  plate: { kind: 'plate', color: '#eef3ff', edges: 'dashed' },
  target: { kind: 'target', color: '#eef3ff' },
};
const PLATE = { id: 'p', type: 'plate', at: [6, 0, 6] };
const CAGED = { id: 'prize', type: 'refill_energy', at: [4, 0, 3] };
const cast = { down: (a) => a === 'cast', pressed: (a) => a === 'cast' };

function room(props = {}) {
  return roomFile('alpha', { objects: [PLATE], blocks: [{ type: 'cage', at: [4, 0, 3] }], pickups: [CAGED], ...props });
}

function gameWith(props, options = {}) {
  const game = new Game(gameData({ rooms: [room(props)], objects: TYPES }), options);
  game.player.energy = 10;
  return game;
}

const errorsOf = (props) => validateData(dataFiles({ rooms: [room(props)], objects: TYPES }));

test('cage: a pickup may lie inside one, but not inside a plain block', () => {
  assert.deepEqual(errorsOf({}), []);
  assert.deepEqual(errorsOf({ blocks: [{ type: 'cage', at: [4, 0, 3] }], pickups: [] }), [], 'a cage without a pickup is fine');
  const errors = errorsOf({ blocks: [{ type: 'block', at: [4, 0, 3] }] });
  assert.match(errors[0], /pickups\[0\]: cell .* is filled by/);
});

test('cage: it is a switch gate: needs a switch like any gate', () => {
  assert.match(errorsOf({ objects: [] })[0], /a gate needs a switch/);
});

test('cage: closed it is solid and collects nothing, even with him in its cell', () => {
  const game = gameWith({});
  const cage = game.objects.find((object) => object.id === 'cage@4,0,3');
  assert.equal(cage.solid, true);
  assert.equal(cage.seeThrough, true);
  assert.equal(game.caged(game.pickups[0]), true);
  // Pressed against its side, or placed right inside it: still caged.
  game.player.place([3.4, 0, 3.5]);
  for (let i = 0; i < 30; i++) game.update({ down: (a) => a === 'down', pressed: () => false });
  assert.equal(game.pickups[0].state, 'idle');
  game.player.place([4.5, 0, 3.5]);
  assert.deepEqual(eventTypes(game.update(idle)).filter((type) => type === 'pickup'), []);
  assert.equal(game.pickups[0].state, 'idle');
});

test('cage: open (its switch on) the pickup is free to take', () => {
  const game = gameWith({ objects: [PLATE, { id: 'c', type: 'crate', at: [6, 0, 6] }] });
  const events = [];
  for (let i = 0; i < 10; i++) events.push(...game.update(idle));
  const cage = game.objects.find((object) => object.id === 'cage@4,0,3');
  assert.equal(cage.solid, false, 'a crate on the plate opens it');
  assert.equal(game.caged(game.pickups[0]), false);
  game.player.place([4.5, 0, 3.5]);
  assert.ok(eventTypes(game.update(idle)).includes('pickup'));
  assert.equal(game.pickups[0].state, 'taken');
});

test('cage: bolts and sight pass through the bars, a Zap hits the bug behind it', () => {
  const game = gameWith({
    pickups: [],
    enemies: [{ id: 'b', template: 'bug', at: [6, 0, 3], variant: { movement: 'stationary' } }],
  }, { progress: new Progress([saveBit('spells', 0)]) });
  game.player.place([0.5, 0, 3.5]);
  game.player.targetFacing = Math.PI / 2;
  game.update(cast);
  const events = [];
  for (let i = 0; i < 40; i++) events.push(...game.update(idle));
  assert.ok(events.some((e) => e.type === 'hit'), 'hit the bug');
  assert.equal(game.sightBlockers.some((object) => object.id === 'cage@4,0,3'), false, 'enemies see through it');
});

test('cage: a bolt does not take the pickup', () => {
  const game = gameWith({}, { progress: new Progress([saveBit('spells', 0)]) });
  game.player.place([0.5, 0, 3.5]);
  game.player.targetFacing = Math.PI / 2;
  game.update(cast);
  for (let i = 0; i < 40; i++) game.update(idle);
  assert.equal(game.pickups[0].state, 'idle');
});

// ---- the checker

/** Can he reach the caged pickup in a 12×4×8 room with these objects? */
function reachPrize(objects, abilities = []) {
  const content = gameData({
    rooms: [roomFile('r', { size: [12, 4, 8], objects, blocks: [{ type: 'cage', at: [10, 0, 4] }], pickups: [{ id: 'prize', type: 'refill_energy', at: [10, 0, 4] }] })],
    objects: TYPES,
  });
  return analyzeRoom(buildRoom(content.rooms.get('r'), content), { abilities, starts: [[1, 0, 1]], tuning: { scanRange: 6, blinkRange: 3 } }).pickups.has('prize');
}

test('cage: the checker reaches a caged pickup only once its switches can be on', () => {
  const target = { id: 't', type: 'target', at: [2, 0, 5] };
  assert.equal(reachPrize([target]), false, 'the target needs a Zap');
  assert.equal(reachPrize([target], ['zap']), true);
  assert.equal(reachPrize([{ id: 'p', type: 'plate', at: [2, 0, 4] }, { id: 'c', type: 'crate', at: [3, 0, 4] }]), true, 'a crate pushed onto the plate');
});

// ---- the room editor

const isCage = (id) => id === 'cage';

test('cage editor: a pickup placed on a cage lies inside it, the cage stays, and the file round-trips', () => {
  const edit = new RoomEdit(roomFile('lab', { blocks: [{ type: 'cage', at: [4, 0, 3] }], objects: [PLATE] }));
  assert.equal(edit.placePickup([4, 0, 3], 'refill_energy', isCage), true);
  assert.deepEqual(edit.data.pickups.map((p) => p.at), [[4, 0, 3]]);
  assert.equal(edit.blocks.get([4, 0, 3]), 'cage');
  assert.match(edit.describe([4, 0, 3]), /inside a cage block/);
  const back = new RoomEdit(structuredClone(JSON.parse(edit.text())));
  assert.equal(back.blocks.get([4, 0, 3]), 'cage');
  assert.equal(back.data.pickups.length, 1);
  assert.deepEqual(validateData(dataFiles({ rooms: [JSON.parse(edit.text())], objects: TYPES })), []);
});

test('cage editor: a cage placed on a pickup closes round it; a plain block placed there replaces it', () => {
  const edit = new RoomEdit(roomFile('lab', { pickups: [{ id: 'prize', type: 'refill_energy', at: [4, 0, 3] }] }));
  edit.placeBlock([4, 0, 3], 'cage', [], true);
  assert.equal(edit.data.pickups.length, 1);
  assert.equal(edit.blocks.get([4, 0, 3]), 'cage');
  // Placing a pickup on a plain block still replaces the block (nothing changes for it).
  const plain = new RoomEdit(roomFile('lab', { blocks: [{ type: 'block', at: [1, 0, 1] }] }));
  plain.placePickup([1, 0, 1], 'refill_energy', isCage);
  assert.equal(plain.blocks.get([1, 0, 1]), null);
});

test('cage editor: the Switch tool picks a caged pickup\'s cage as a gate and links it', () => {
  const edit = new RoomEdit(roomFile('lab', { blocks: [{ type: 'cage', at: [4, 0, 3] }], objects: [PLATE], pickups: [{ id: 'prize', type: 'refill_energy', at: [4, 0, 3] }] }));
  const types = { objectTypes: resolveObjectTypes(TYPES), blockTypes: resolveBlockTypes({ block: { look: 'plain' }, cage: { kind: 'gate', look: 'cage', seeThrough: true } }) };
  const click = switchClick(edit, types, { cell: [4, 0, 3], selected: null, switchType: 'plate' });
  assert.equal(click.action, 'pick');
  assert.match(click.text, /cage/);
});
