import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoom } from '../src/world/room.js';
import { analyzeRoom, arrivalCells } from '../src/world/reach.js';
import { analyzeRoomAlone, analyzeWorld } from '../src/world/reach-world.js';
import { describeNeeds, formatReach, formatRoom, freeJumpRooms, roomOfReport } from '../src/world/reach-report.js';
import { LIFT, gameData, roomFile, withNeighbours } from './helpers.js';

/** Object types the tests use besides the crate. */
const OBJECTS = { pad: { kind: 'pad', color: '#eef3ff' }, plate: { kind: 'plate', color: '#eef3ff' }, plate_heavy: { kind: 'plate', color: '#eef3ff', weight: 2 }, target: { kind: 'target', color: '#eef3ff' }, platform: LIFT };
const TUNING = { scanRange: 6, blinkRange: 3 };
const WEST = { id: 'west', side: '-x', at: 3 };
const EAST = { id: 'east', side: '+x', at: 3 };

/**
 * Reach of a single room "r" (12×4×8, spawn cell [1, 0, 1]) with some
 * abilities. Its exits (west in the −x wall by default) lead to dummy
 * rooms next to it (withNeighbours()).
 */
function reach(props, abilities = []) {
  const exits = props.exits ?? [WEST];
  const content = gameData({ ...withNeighbours(roomFile('r', { size: [12, 4, 8], ...props, exits })), objects: OBJECTS });
  const room = buildRoom(content.rooms.get('r'), content);
  return analyzeRoom(room, { abilities, starts: [[1, 0, 1]], tuning: TUNING });
}

const pickup = (id, at, type = 'refill_energy') => ({ id, type, at });
/** A wall across the room at x, `height` blocks high. */
const wall = (x, height, type) => ({ ...(type && { type }), at: [x, 0, 0], to: [x, height - 1, 7] });
/** A pit across the room, `width` tiles wide from x = 4. */
const pit = (width) => ({ at: [4, 0], to: [3 + width, 7] });
const reached = (r, id = 'far') => r.pickups.has(id);
const far = pickup('far', [11, 0, 2]);

test('open floor: every pickup and the exit within reach', () => {
  const r = reach({ pickups: [pickup('a', [6, 0, 6]), pickup('b', [3, 1, 3])] });
  assert.deepEqual([...r.pickups].sort(), ['a', 'b']);
  assert.equal(r.exits.west, true);
});

test('a pickup high in the air needs a jump; higher is out of reach', () => {
  assert.equal(reached(reach({ pickups: [pickup('far', [3, 2, 3])] })), true);
  assert.equal(reached(reach({ pickups: [pickup('far', [3, 3, 3])] })), false);
});

test('one block is a step, two a wall', () => {
  assert.equal(reached(reach({ blocks: [wall(4, 1)], pickups: [far] })), true);
  assert.equal(reached(reach({ blocks: [wall(4, 2)], pickups: [far] })), false);
});

test('Pause: a frozen enemy on its path is a step up a 2-high wall', () => {
  const patrol = { id: 'b', template: 'bug', at: [3, 0, 1], path: { points: [[3, 0, 5]] } };
  const room = (enemies, abilities) => reached(reach({ blocks: [wall(4, 2)], enemies, pickups: [far] }, abilities));
  assert.equal(room([patrol], []), false);
  assert.equal(room([patrol], ['zap']), false); // killing it leaves no step
  assert.equal(room([patrol], ['pause']), true);
  assert.equal(room([{ ...patrol, at: [8, 0, 1], path: { points: [[8, 0, 5]] } }], ['pause']), false); // not beside the wall
});

test('a drop onto a frozen enemy cell may fall past it to the floor', () => {
  // he starts on a 3-high ledge (x 0-1); below it a trench (x = 2) walled at x = 3, a bug's lane all
  // along it: frozen it may lie anywhere there, but it need not, so the trench floor is reached too
  const patrol = { id: 'b', template: 'bug', at: [2, 0, 0], path: { points: [[2, 0, 7]] } };
  const blocks = [{ at: [0, 0, 0], to: [1, 2, 7] }, { at: [3, 0, 0], to: [3, 2, 7] }];
  const props = { size: [12, 5, 8], spawn: [6.5, 0, 1.5], blocks, enemies: [patrol], pickups: [pickup('low', [2, 0, 4])], exits: [EAST] };
  const content = gameData({ rooms: [roomFile('r', props), roomFile('o', { exits: [{ id: 'east_o', side: '-x', at: 3 }] })], connections: [['r.east', 'o.east_o']], objects: OBJECTS });
  const room = buildRoom(content.rooms.get('r'), content);
  const r = analyzeRoom(room, { abilities: ['pause'], starts: [[0, 3, 1]], tuning: TUNING });
  assert.equal(r.pickups.has('low'), true);
});

test('Pause: a frozen enemy holds a plate it is pushed onto (D154, D166)', () => {
  const patrol = { id: 'b', template: 'bug', at: [3, 0, 1], path: { points: [[3, 0, 5]] } };
  const locked = (plateAt, abilities, holes) =>
    reach({ exits: [WEST, { ...EAST, requires: [{ switch: '*' }] }], objects: [{ id: 'p', type: 'plate', at: plateAt }], enemies: [patrol], holes }, abilities).exits.east;
  assert.equal(locked([4, 0, 3], []), false);
  assert.equal(locked([4, 0, 3], ['pause']), true); // pushed a cell sideways
  assert.equal(locked([3, 0, 6], ['pause']), true); // pushed on past its end
  assert.equal(locked([7, 0, 3], ['pause']), true); // four pushes away
  assert.equal(locked([7, 0, 3], ['pause'], [{ at: [5, 0], to: [5, 7] }]), false); // it pops in the hole on the way
});

test('Pause: one frozen enemy holds one plate at a time (D166)', () => {
  const patrol = (id, z) => ({ id, template: 'bug', at: [3, 0, z], path: { points: [[6, 0, z]] } });
  const plates = [{ id: 'p', type: 'plate', at: [4, 0, 2] }, { id: 'q', type: 'plate', at: [5, 0, 2] }];
  const locked = (enemies) => reach({ exits: [WEST, { ...EAST, requires: [{ switch: '*' }] }], objects: plates, enemies }, ['pause']).exits.east;
  assert.equal(locked([patrol('a', 2)]), false); // both plates on its path, but it is one body
  assert.equal(locked([patrol('a', 2), patrol('b', 5)]), true); // the second is pushed to the other plate
});

test('Pause: a frozen enemy pushed across the floor is a step up a far ledge (D166)', () => {
  const patrol = { id: 'b', template: 'bug', at: [6, 0, 6], path: { points: [[10, 0, 6]] } };
  const ledge = { at: [10, 0, 0], to: [11, 1, 1] };
  const top = pickup('top', [11, 2, 0]);
  const room = (abilities, holes) => reached(reach({ blocks: [ledge], holes, enemies: [patrol], pickups: [top] }, abilities), 'top');
  assert.equal(room([]), false);
  assert.equal(room(['pause']), true); // pushed -z from [10,0,6] to [10,0,2], at the ledge's foot
  assert.equal(room(['pause'], [{ at: [0, 5], to: [11, 5] }]), false); // he jumps the hole, a pushed enemy pops in it
});

test('pits: one tile is jumped, up to four need Blink, more Warp or Compile', () => {
  const room = (width, abilities, blocks = [], target = far) => reached(reach({ holes: [pit(width)], blocks, pickups: [target] }, abilities));
  assert.equal(room(1), true);
  assert.equal(room(2), false);
  assert.equal(room(2, ['blink']), true); // 3 cells ahead
  // A running jump, then Blink near the top (D217): two cells further, even a block up.
  assert.equal(room(4, ['blink']), true);
  assert.equal(room(4, ['blink'], [{ at: [8, 0, 0], to: [11, 0, 7] }], pickup('far', [11, 1, 2])), true, 'onto a 1-high ledge beyond the pit');
  assert.equal(room(4, ['blink'], [{ at: [8, 0, 0], to: [11, 1, 7] }], pickup('far', [11, 2, 2])), false, 'never 2 up');
  assert.equal(room(5, ['blink']), false);
  assert.equal(room(3, ['blink'], [{ at: [0, 2, 0], to: [3, 2, 7] }]), false, 'a low ceiling over the run-up stops the jump');
  assert.equal(room(3, ['warp']), true);
  assert.equal(room(5, ['compile']), true); // plug a cell, step on, again
});

test('crates plugging a pit: each fills one tile of the row he crosses', () => {
  const crate = (id, at) => ({ id, type: 'crate', at });
  const one = [crate('c', [2, 0, 2])];
  const two = [crate('c', [2, 0, 2]), crate('d', [2, 0, 4])];
  const room = (width, objects) => reached(reach({ holes: [pit(width)], objects, pickups: [far] }));
  assert.equal(room(2, one), true); // one plugged, one left to jump
  assert.equal(room(3, one), false);
  assert.equal(room(3, two), true);
  assert.equal(room(4, two), false);
});

test('a crate is a step against a two-high wall, but not when it cannot be pushed there', () => {
  const crate = { id: 'c', type: 'crate', at: [2, 0, 2] };
  const props = { blocks: [wall(5, 2)], objects: [crate], pickups: [far] };
  assert.equal(reached(reach(props)), true); // pushed to x 4: a step of one, then the wall is two... from the crate top it is one more
  assert.equal(reached(reach({ ...props, blocks: [wall(5, 3)] })), false);
  // crate in a corner it cannot leave
  const stuck = { id: 'c', type: 'crate', at: [0, 0, 0] };
  assert.equal(reached(reach({ blocks: [wall(5, 2)], objects: [stuck], pickups: [far] })), false);
});

test('Shove pushes a crate behind a fence onto a plate; Pull cannot (D261)', () => {
  // A fence across the room; the crate and the plate beyond it, the locked exit on his side.
  const exits = [{ ...WEST, requires: [{ switch: '*' }] }];
  const fenced = { exits, blocks: [{ type: 'fence', at: [5, 0, 0], to: [5, 3, 7] }], objects: [{ id: 'c', type: 'crate', at: [6, 0, 3] }, { id: 'p', type: 'plate', at: [7, 0, 3] }] };
  assert.equal(reach(fenced).exits.west, false);
  assert.equal(reach(fenced, ['pull']).exits.west, false);
  assert.equal(reach(fenced, ['shove']).exits.west, true);
  // A plain wall stops the beam.
  const walled = { ...fenced, blocks: [wall(5, 4)] };
  assert.equal(reach(walled, ['shove']).exits.west, false);
});

test('Swap puts him past a crate stream where the crate stood (D261)', () => {
  const across = { blocks: [{ type: 'stream', at: [5, 0, 0], to: [5, 3, 7] }], objects: [{ id: 'c', type: 'crate', at: [7, 0, 3] }], pickups: [far] };
  assert.equal(reached(reach(across)), false);
  assert.equal(reached(reach(across, ['pull'])), false);
  assert.equal(reached(reach(across, ['swap'])), true);
});

test('Compile makes a step; Pull brings a crate across a pit; Cut & Paste moves one anywhere', () => {
  const high = { blocks: [wall(5, 2)], pickups: [far] };
  assert.equal(reached(reach(high)), false);
  assert.equal(reached(reach(high, ['compile'])), true);

  // a crate behind a two-tile pit: Pull brings it twice, it plugs the near tile, a gap of one is left
  const behind = { holes: [pit(2)], objects: [{ id: 'c', type: 'crate', at: [7, 0, 2] }], pickups: [far] };
  assert.equal(reached(reach(behind)), false);
  assert.equal(reached(reach(behind, ['pull'])), true);

  // a crate stuck in a corner: Cut & Paste puts it against the wall as a step
  const stuck = { blocks: [wall(5, 2)], objects: [{ id: 'c', type: 'crate', at: [0, 0, 0] }], pickups: [far] };
  assert.equal(reached(reach(stuck)), false);
  assert.equal(reached(reach(stuck, ['cut_paste'])), true);
});

test('a locked exit opens by a crate on a plate, or a decoy', () => {
  const crate = { id: 'c', type: 'crate', at: [3, 0, 3] };
  const plate = { id: 'p', type: 'plate', at: [3, 0, 5] };
  const props = { exits: [WEST, { ...EAST, requires: [{ switch: '*' }] }], objects: [plate, crate] };
  assert.equal(reach(props).exits.east, true);
  assert.equal(reach({ ...props, objects: [plate] }).exits.east, false);
  assert.equal(reach({ ...props, objects: [plate] }, ['fork']).exits.east, true);
  // one decoy at a time: two plates need a second holder
  const second = { id: 'q', type: 'plate', at: [5, 0, 5] };
  assert.equal(reach({ ...props, objects: [plate, second] }, ['fork']).exits.east, false);
  assert.equal(reach({ ...props, objects: [plate, second, crate] }, ['fork']).exits.east, true);
});

test('a decoy cast from a ledge falls onto a plate in a walled pocket (D245)', () => {
  // The plate at (8,0,2) is walled 3 high on three sides; west of it a 1-high block, a stair up to it.
  const pocket = [{ at: [8, 0, 1], to: [8, 2, 1] }, { at: [8, 0, 3], to: [8, 2, 3] }, { at: [9, 0, 2], to: [9, 2, 2] }, { at: [7, 0, 2] }];
  const props = { jump: 'pads', exits: [WEST, { ...EAST, requires: [{ switch: '*' }] }], objects: [{ id: 'p', type: 'plate', at: [8, 0, 2] }] };
  const stair = { type: 'stair_x', at: [6, 0, 2] };
  assert.equal(reach({ ...props, blocks: pocket }, ['fork']).exits.east, false, 'no way onto the ledge');
  assert.equal(reach({ ...props, blocks: [...pocket, stair] }).exits.east, false, 'no decoy');
  assert.equal(reach({ ...props, blocks: [...pocket, stair] }, ['fork']).exits.east, true);
});

test('a hidden exit needs a scan, and so does a fake block', () => {
  const props = { exits: [WEST, { id: 'north', side: '-z', at: 5, hidden: true }] };
  assert.equal(reach(props).exits.north, false);
  assert.equal(reach(props, ['scan']).exits.north, true);
  const fake = { blocks: [wall(4, 2, 'fake')], pickups: [far] };
  assert.equal(reached(reach(fake)), false);
  assert.equal(reached(reach(fake, ['scan'])), true);
});

test('a target switch needs Zap', () => {
  const props = { exits: [WEST, { ...EAST, requires: [{ switch: '*' }] }], objects: [{ id: 't', type: 'target', at: [4, 0, 5] }] };
  assert.equal(reach(props).exits.east, false);
  assert.equal(reach(props, ['zap']).exits.east, true);
});

test('a moving platform over a pit is a floor to cross on', () => {
  const lift = { id: 'lift', type: 'platform', at: [4, 0, 2], path: { points: [[6, 0, 2]] } };
  assert.equal(reached(reach({ holes: [pit(3)], objects: [lift], pickups: [far] })), true);
  assert.equal(reached(reach({ holes: [pit(5)], objects: [lift], pickups: [far] })), false);
});

test('a lift carries him from a stair up to a 3-high ledge (D228)', () => {
  const lift = { id: 'lift', type: 'platform', at: [4, 0, 2], path: { points: [[4, 2, 2]] } };
  const props = { jump: 'pads', blocks: [{ at: [5, 0, 2], to: [5, 2, 2] }], pickups: [pickup('far', [5, 3, 2])] };
  assert.equal(reached(reach({ ...props, objects: [lift] })), false, 'no stair to board it');
  const stair = { type: 'stair_x', at: [3, 0, 2] };
  assert.equal(reached(reach({ ...props, blocks: [...props.blocks, stair] })), false, 'no lift');
  assert.equal(reached(reach({ ...props, blocks: [...props.blocks, stair], objects: [lift] })), true);
});

test('arrival cells: the first row inside an exit at its floor level', () => {
  const content = gameData({ rooms: [roomFile('r', { exits: [WEST] }), roomFile('o', { exits: [{ id: 'east', side: '+x', at: 3 }] })], connections: [['r.west', 'o.east']] });
  const room = buildRoom(content.rooms.get('r'), content);
  assert.deepEqual(arrivalCells(room, 'west'), [[0, 0, 3], [0, 0, 4]]);
});

/** Rooms in a row, each joined to the next: its east exit to the next one's west exit. */
function row(rooms, extra) {
  const connections = rooms.slice(1).map((room, i) => [`${rooms[i].id}.east`, `${room.id}.west`]);
  return gameData({ rooms, connections, objects: OBJECTS, ...extra });
}

test('world: what one room gives opens the next, and the order is in rounds', () => {
  const content = row([
    roomFile('a', { exits: [EAST], pickups: [pickup('blink', [3, 0, 1], 'disk_blink')] }),
    roomFile('b', { exits: [WEST, EAST], holes: [{ at: [3, 0], to: [4, 7] }] }),
    roomFile('c', { exits: [WEST], pickups: [pickup('z', [3, 0, 3])] }),
  ]);
  const report = analyzeWorld(content);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.rounds.map((r) => r.rooms), [['a'], ['b'], ['c']]);
  assert.deepEqual(report.abilities, ['blink']);
  const needs = Object.fromEntries(report.targets.map((t) => [`${t.room}.${t.id}`, describeNeeds(t.needs)]));
  assert.equal(needs['b.east'], 'blink');
  assert.equal(needs['a.east'], 'free');
  assert.match(formatReach(report, { rooms: true }), /b exit east: blink/);
});

test('world: needs for one room only match the full report and skip the other rooms', () => {
  const content = row([
    roomFile('a', { exits: [EAST], pickups: [pickup('blink', [3, 0, 1], 'disk_blink')] }),
    roomFile('b', { exits: [WEST, EAST], holes: [{ at: [3, 0], to: [4, 7] }] }),
    roomFile('c', { exits: [WEST], blocks: [{ at: [4, 0, 0], to: [4, 1, 7] }], pickups: [pickup('z', [3, 0, 3])] }),
  ]);
  const needs = (report, room) => Object.fromEntries(report.targets.filter((t) => t.room === room).map((t) => [t.id, describeNeeds(t.needs)]));
  const all = analyzeWorld(content);
  const one = analyzeWorld(content, { needs: 'b' });
  assert.equal(needs(one, 'b').east, 'blink');
  assert.deepEqual(needs(one, 'b'), needs(all, 'b'));
  assert.deepEqual(one.errors, all.errors);
  // Another room keeps the plain "reachable" it was found with, its sets not worked out.
  assert.equal(needs(all, 'c').west, 'free');
  assert.equal(needs(one, 'c').west, 'free');
});

test('world: what he can never reach is an error', () => {
  const content = row([
    roomFile('a', { exits: [EAST], blocks: [{ at: [4, 0, 0], to: [4, 1, 7] }], pickups: [pickup('walled', [6, 0, 6])] }),
    roomFile('b', { exits: [WEST] }),
  ]);
  const report = analyzeWorld(content);
  assert.ok(report.errors.some((e) => e.includes('a: exit "east"')));
  assert.ok(report.errors.some((e) => e.includes('a: pickup "walled"')));
  assert.ok(report.errors.some((e) => e.startsWith('b: no way in')));
  assert.equal(formatReach(report).split('\n').at(-1), '3 reachability problem(s).');
});

test('world: the rooms still on the free jump are listed, game and dev wing apart (D222)', () => {
  const rooms = new Map([['b', {}], ['a', { jump: 'free' }], ['pads', { jump: 'pads' }], ['lab', {}]]);
  const freeJump = freeJumpRooms({ rooms, world: { dev: ['lab'] } });
  assert.deepEqual(freeJump, { game: ['a', 'b'], dev: ['lab'] });
  const report = { rounds: [], targets: [], warnings: [], errors: [] };
  assert.match(formatReach(report, { freeJump }), /Still on the free jump \(D222\), 3 room\(s\):\n {2}game: a, b\n {2}dev wing: lab\nEverything is reachable\.$/);
  assert.match(formatReach(report, { freeJump: { game: [], dev: [] } }), /Every room is a pads room/);
  assert.deepEqual(formatReach(report, { json: true, freeJump }).freeJump, freeJump);
});

test('world: a room that waits for a spell listed as later is a warning, not an error (D183)', () => {
  // The gap is two wide and a Blink crosses it; no room holds a Blink disk yet.
  const rooms = [
    roomFile('a', { exits: [EAST], holes: [{ at: [4, 0], to: [5, 7] }] }),
    roomFile('b', { exits: [WEST] }),
  ];
  const strict = analyzeWorld(row(rooms));
  assert.ok(strict.errors.some((e) => e.startsWith('b: no way in')), strict.errors.join(', '));
  const later = analyzeWorld(row(rooms, { later: ['blink'] }));
  assert.deepEqual(later.errors, []);
  assert.ok(later.warnings.some((w) => w.startsWith('b: no way in') && w.includes('waits for a spell not placed yet: blink')), later.warnings.join(', '));
  // Still an error when even that spell would not help: a wall, not a gap.
  const walled = [{ ...rooms[0], holes: undefined, blocks: [{ at: [4, 0, 0], to: [4, 3, 7] }] }, rooms[1]];
  assert.ok(analyzeWorld(row(walled, { later: ['blink'] })).errors.some((e) => e.startsWith('b: no way in')));
});

test('world: problems of a pending room are warnings, not errors', () => {
  const rooms = [roomFile('a', { exits: [EAST], blocks: [{ at: [4, 0, 0], to: [4, 1, 7] }] }), roomFile('b', { exits: [WEST] })];
  assert.ok(analyzeWorld(row(rooms)).errors.length > 0);
  const soft = analyzeWorld(row(rooms, { pending: ['a', 'b'] }));
  assert.deepEqual(soft.errors, []);
  assert.ok(soft.warnings.some((w) => w.startsWith('b: no way in') && w.includes('pending')), soft.warnings.join(', '));
});

test('world: an access-locked exit waits for the access pass', () => {
  const content = gameData({
    rooms: [
      roomFile('a', { exits: [EAST, { id: 'south', side: '+z', at: 3, requires: [{ access: 2 }] }], pickups: [pickup('pass', [3, 0, 3], 'access_pass_3')] }),
      roomFile('b', { exits: [WEST] }),
      roomFile('c', { exits: [{ id: 'north', side: '-z', at: 3 }] }),
    ],
    connections: [['a.east', 'b.west'], ['a.south', 'c.north']],
    fragments: { required: 4, access: [1, 2] },
  });
  const report = analyzeWorld(content);
  assert.deepEqual(report.errors, []);
  assert.equal(report.access, 3);
  const without = analyzeWorld({ ...content, rooms: new Map([...content.rooms].map(([id, room]) => [id, id === 'a' ? { ...room, pickups: [] } : room])) });
  assert.ok(without.errors.some((e) => e.startsWith('c: no way in')));
  assert.match(formatReach(report, { rooms: true }), /a exit south: free, access 2/);
});

test('world: a one-way exit (D259) is a way in only; arriving through it he must be able to leave another way', () => {
  const oneWay = { ...WEST, oneWay: true };
  // b's only exit is one-way: a dead end, an error.
  let report = analyzeWorld(row([roomFile('a', { exits: [EAST] }), roomFile('b', { exits: [oneWay] })]));
  assert.ok(report.errors.includes('b: after arriving through one-way "west" with nothing he can\'t get out of the room'), report.errors.join('\n'));
  // He never leaves through it: a needs b's east to be entered from c.
  report = analyzeWorld(row([roomFile('a', { exits: [EAST] }), roomFile('b', { exits: [oneWay, EAST] }), roomFile('c', { exits: [WEST] })]));
  assert.deepEqual(report.errors, []);
  assert.ok(!report.targets.some((t) => t.room === 'b' && t.id === 'west'), 'no target: nothing to reach');
  // The way out is a disk found in the room: Blink over a pit.
  const pitRoom = (pickups) => roomFile('b', { size: [12, 4, 8], exits: [oneWay, EAST], holes: [{ at: [5, 0], to: [6, 7] }], pickups });
  report = analyzeWorld(row([roomFile('a', { exits: [EAST] }), pitRoom([]), roomFile('c', { exits: [WEST] })]));
  assert.ok(report.errors.some((e) => e.startsWith('b: after arriving through one-way "west"')), report.errors.join('\n'));
  report = analyzeWorld(row([roomFile('a', { exits: [EAST] }), pitRoom([pickup('disk', [2, 0, 2], 'disk_blink')]), roomFile('c', { exits: [WEST] })]));
  assert.ok(!report.errors.some((e) => e.includes('one-way')), report.errors.join('\n'));
});

test('world: arriving on a ledge with no way back up is a warning', () => {
  const content = row([
    roomFile('a', { exits: [EAST] }),
    roomFile('b', { exits: [{ ...WEST, y: 2 }], size: [8, 5, 8] }),
  ]);
  const report = analyzeWorld(content);
  assert.ok(report.warnings.some((w) => w.includes('b: after arriving through "west"')), report.warnings.join('\n'));
});

test('world: a room not connected to the start is a warning, not an error', () => {
  const report = analyzeWorld(gameData({ rooms: [roomFile('a'), roomFile('lost')] }));
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.some((w) => w.startsWith('lost: not connected')));
});

test('world: the dev wing and rooms behind it are warnings, not errors (D147)', () => {
  const content = row(
    [
      roomFile('a', { exits: [{ ...EAST, requires: [{ access: 3 }] }] }),
      roomFile('d', { exits: [WEST, EAST] }),
      roomFile('e', { exits: [WEST] }),
    ],
    { dev: ['d'], fragments: { required: 4, access: [1, 2, 3] } },
  );
  const report = analyzeWorld(content);
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.some((w) => w.startsWith('d: in the dev wing')));
  assert.ok(report.warnings.some((w) => w.startsWith('e: not connected')));
});

test('describeNeeds', () => {
  assert.equal(describeNeeds([[]]), 'free');
  assert.equal(describeNeeds(null), 'never');
  assert.equal(describeNeeds([]), 'several');
  assert.equal(describeNeeds([['warp'], ['blink', 'pull']]), 'warp or blink + pull');
});

/** a (with Blink) → b (a two-tile pit before its east exit). */
function wallWorld() {
  return row([
    roomFile('a', { exits: [EAST], pickups: [pickup('blink', [3, 0, 1], 'disk_blink')] }),
    roomFile('b', { exits: [WEST, EAST], holes: [{ at: [3, 0], to: [4, 7] }] }),
    roomFile('c', { exits: [WEST] }),
  ]);
}

test('one room of the world report: its targets, round and messages', () => {
  const part = roomOfReport(analyzeWorld(wallWorld()), 'b');
  assert.equal(part.round, 2);
  assert.deepEqual(part.errors, []);
  assert.equal(describeNeeds(part.targets.find((t) => t.id === 'east').needs), 'blink');
  assert.match(formatRoom('b', part), /^b: first entered in round 2[^]*exit east: blink[^]*b: everything in it is reachable\.$/);
});

test('one room on its own: with the abilities given, from the spawn or an exit', () => {
  const content = wallWorld();
  const east = (options) => analyzeRoomAlone(content, 'b', options).targets.find((t) => t.id === 'east');
  // from the spawn point at x 1 the east exit is beyond the pit
  assert.equal(east({ abilities: [] }).needs, null);
  assert.equal(describeNeeds(east({ abilities: ['blink'] }).needs), 'blink');
  assert.equal(describeNeeds(east({ abilities: [], from: 'east' }).needs), 'free');
  assert.equal(analyzeRoomAlone(content, 'b').errors.length, 1);
  assert.throws(() => analyzeRoomAlone(content, 'b', { from: 'nope' }), /no exit "nope"/);
  assert.throws(() => analyzeRoomAlone(content, 'nope'), /no room "nope"/);
});

test('Pause: a frozen enemy pushed onto a heavy plate takes a ledge crate dropped on it (D205)', () => {
  const patrol = { id: 'b', template: 'bug', at: [3, 0, 2], path: { points: [[9, 0, 2]] } };
  const objects = [{ id: 'p', type: 'plate_heavy', at: [6, 0, 3] }, { id: 'c', type: 'crate', at: [5, 1, 3] }];
  const ledge = { at: [4, 0, 3], to: [5, 0, 4] };
  const locked = (enemies, abilities) => reach({ exits: [WEST, { ...EAST, requires: [{ switch: '*' }] }], blocks: [ledge], objects, enemies }, abilities).exits.east;
  assert.equal(locked([], ['pause']), false); // the crate alone is one weight
  assert.equal(locked([patrol], []), false); // a bug not frozen is no weight
  assert.equal(locked([patrol], ['pause']), true); // frozen at [6,0,2], pushed onto the plate, the crate dropped on it
});

test('a pad on a block carries a Blink up with it; a crate on a fake block drops when scanned', () => {
  // A pad on a 1-high step (launch 2): Blink at the apex crosses a 2-tile gap onto a 3-high ledge.
  const base = { jump: 'pads', blocks: [{ at: [4, 0, 2] }, { type: 'stair_x', at: [3, 0, 2] }, { at: [8, 0, 2], to: [8, 2, 2] }], objects: [{ id: 'p', type: 'pad', at: [4, 1, 2] }], pickups: [pickup('far', [8, 3, 2])] };
  const pad = { ...base, objects: [{ id: 'p', type: 'pad', at: [4, 1, 2], launch: 2.2 }] };
  assert.equal(reached(reach(pad, ['blink'])), true, 'pad then Blink');
  assert.equal(reached(reach(pad, [])), false, 'the pad alone does not');
  // A crate on a fake block lies on the floor once a scan has derezzed it, ready to push.
  const sc = { blocks: [{ type: 'fake', at: [5, 0, 1] }], objects: [{ id: 'c', type: 'crate', at: [5, 1, 1] }], pickups: [pickup('far', [7, 0, 1])] };
  assert.equal(reached(reach({ ...sc, jump: 'pads', holes: [{ at: [6, 0], to: [6, 7] }] }, ['scan'])), true, 'the dropped crate plugs the hole');
});

test('a pad throw lands its whole launch up over a 1-tile gap, a block less over 2, never over 3 (D243)', () => {
  // A pad at x 4 (on the floor, or on a 1-high block with a stair up to it); holes from x 5, `gap` wide;
  // beyond, a ledge `high` blocks high (0: the floor) with the pickup on it.
  const throwTo = (gap, high, { base = 0, blocks = [] } = {}) => {
    const step = base > 0 ? [{ at: [4, 0, 2] }, { type: 'stair_x', at: [3, 0, 2] }] : [];
    const ledge = high > 0 ? [{ at: [5 + gap, 0, 0], to: [11, high - 1, 7] }] : [];
    const props = { jump: 'pads', holes: [{ at: [5, 0], to: [4 + gap, 7] }], blocks: [...step, ...ledge, ...blocks], objects: [{ id: 'p', type: 'pad', at: [4, base, 2] }], pickups: [pickup('far', [5 + gap, high, 2])] };
    return reached(reach(props));
  };
  assert.equal(throwTo(1, 2), true, 'a floor pad, a 2-high ledge over 1 tile');
  assert.equal(throwTo(1, 3), false, 'never 3 up');
  assert.equal(throwTo(1, 3, { base: 1 }), true, 'a pad on a 1-high block: a 3-high top over 1 tile');
  assert.equal(throwTo(1, 2, { blocks: [{ at: [4, 3, 0], to: [5, 3, 7] }] }), false, 'a ceiling over the throw stops it');
  assert.equal(throwTo(2, 1), true, '1 up over 2 tiles');
  assert.equal(throwTo(2, 2), false, 'never 2 up over 2 tiles');
  assert.equal(throwTo(2, 2, { base: 1 }), true, 'from a pad on a block, a 2-high top over 2 tiles');
  assert.equal(throwTo(3, 0), false, 'never over 3 tiles');
});
