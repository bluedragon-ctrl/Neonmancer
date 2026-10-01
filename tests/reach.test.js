import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPPOSITE_SIDE } from '../src/data/room-data.js';
import { buildRoom } from '../src/world/room.js';
import { analyzeRoom, arrivalCells } from '../src/world/reach.js';
import { analyzeWorld } from '../src/world/reach-world.js';
import { describeNeeds, formatReach } from '../src/world/reach-report.js';
import { LIFT, gameData, roomFile } from './helpers.js';

/** Object types the tests use besides the crate. */
const OBJECTS = { plate: { kind: 'plate', color: '#eef3ff' }, target: { kind: 'target', color: '#eef3ff' }, platform: LIFT };
const TUNING = { scanRange: 6, blinkRange: 3 };
const WEST = { id: 'west', side: '-x', at: 3 };
const EAST = { id: 'east', side: '+x', at: 3 };

/**
 * Reach of a single room "r" (12×4×8, spawn cell [1, 0, 1]) with some
 * abilities. Its exits (west in the −x wall by default) are connected to
 * a dummy room, which every exit needs.
 */
function reach(props, abilities = []) {
  const exits = props.exits ?? [WEST];
  const dummy = roomFile('o', { exits: exits.map((exit) => ({ id: `${exit.id}_o`, side: OPPOSITE_SIDE[exit.side], at: 3 })) });
  const content = gameData({ rooms: [roomFile('r', { size: [12, 4, 8], ...props, exits }), dummy], connections: exits.map((exit) => [`r.${exit.id}`, `o.${exit.id}_o`]), objects: OBJECTS });
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

test('a pickup high in the air needs a jump, two jumps if higher', () => {
  assert.equal(reached(reach({ pickups: [pickup('far', [3, 2, 3])] })), true);
  assert.equal(reached(reach({ pickups: [pickup('far', [3, 3, 3])] })), false);
  assert.equal(reached(reach({ pickups: [pickup('far', [3, 3, 3])] }, ['double_jump'])), true);
});

test('one block is a step, two a wall for the double jump', () => {
  assert.equal(reached(reach({ blocks: [wall(4, 1)], pickups: [far] })), true);
  assert.equal(reached(reach({ blocks: [wall(4, 2)], pickups: [far] })), false);
  assert.equal(reached(reach({ blocks: [wall(4, 2)], pickups: [far] }, ['double_jump'])), true);
  assert.equal(reached(reach({ blocks: [wall(4, 3)], pickups: [far] }, ['double_jump'])), false);
});

test('pits: one tile is jumped, two need the double jump or Blink, more Warp or Compile', () => {
  const room = (width, abilities) => reached(reach({ holes: [pit(width)], pickups: [far] }, abilities));
  assert.equal(room(1), true);
  assert.equal(room(2), false);
  assert.equal(room(2, ['double_jump']), true);
  assert.equal(room(2, ['blink']), true); // 3 cells ahead
  assert.equal(room(3, ['double_jump']), false);
  assert.equal(room(3, ['blink']), false);
  assert.equal(room(3, ['warp']), true);
  assert.equal(room(5, ['compile']), true); // plug a cell, step on, again
});

test('hazard and void are no way across, and stop nothing from being a wall', () => {
  for (const type of ['hazard', 'void']) {
    assert.equal(reached(reach({ blocks: [wall(4, 2, type)], pickups: [far] })), false);
    assert.equal(reached(reach({ blocks: [wall(4, 2, type)], pickups: [far] }, ['warp'])), false);
  }
  // a hazard floor tile row he can't land on: one tile wide he jumps over
  assert.equal(reached(reach({ blocks: [wall(4, 1, 'hazard')], pickups: [far] })), false);
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
  const props = { exits: [WEST, { ...EAST, locked: true }], objects: [plate, crate] };
  assert.equal(reach(props).exits.east, true);
  assert.equal(reach({ ...props, objects: [plate] }).exits.east, false);
  assert.equal(reach({ ...props, objects: [plate] }, ['fork']).exits.east, true);
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
  const props = { exits: [WEST, { ...EAST, locked: true }], objects: [{ id: 't', type: 'target', at: [4, 0, 5] }] };
  assert.equal(reach(props).exits.east, false);
  assert.equal(reach(props, ['zap']).exits.east, true);
});

test('a moving platform over a pit is a floor to cross on', () => {
  const lift = { id: 'lift', type: 'platform', at: [4, 0, 2], path: { points: [[6, 0, 2]] } };
  assert.equal(reached(reach({ holes: [pit(3)], objects: [lift], pickups: [far] })), true);
  assert.equal(reached(reach({ holes: [pit(5)], objects: [lift], pickups: [far] })), false);
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
    roomFile('a', { exits: [EAST], pickups: [pickup('jump', [3, 0, 1], 'upgrade_double_jump')] }),
    roomFile('b', { exits: [WEST, EAST], blocks: [{ at: [4, 0, 0], to: [4, 1, 7] }] }),
    roomFile('c', { exits: [WEST], pickups: [pickup('z', [3, 0, 3])] }),
  ]);
  const report = analyzeWorld(content);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.rounds.map((r) => r.rooms), [['a'], ['b'], ['c']]);
  assert.deepEqual(report.abilities, ['double_jump']);
  const needs = Object.fromEntries(report.targets.map((t) => [`${t.room}.${t.id}`, describeNeeds(t.needs)]));
  assert.equal(needs['b.east'], 'double_jump');
  assert.equal(needs['a.east'], 'free');
  assert.match(formatReach(report, { rooms: true }), /b exit east: double_jump/);
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

test('world: an access-locked exit waits for the access pass', () => {
  const content = gameData({
    rooms: [
      roomFile('a', { exits: [EAST, { id: 'south', side: '+z', at: 3, access: 2 }], pickups: [pickup('pass', [3, 0, 3], 'access_pass_3')] }),
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

test('describeNeeds', () => {
  assert.equal(describeNeeds([[]]), 'free');
  assert.equal(describeNeeds(null), 'never');
  assert.equal(describeNeeds([]), 'several');
  assert.equal(describeNeeds([['warp'], ['blink', 'pull']]), 'warp or blink + pull');
});
