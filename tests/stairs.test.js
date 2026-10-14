import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../src/data/validate.js';
import { Player } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { riseTurn, stairSegments } from '../src/render/stair-view.js';
import { analyzeRoom } from '../src/world/reach.js';
import { buildRoom } from '../src/world/room.js';
import { BLOCK_TYPES, dataFiles, gameData, grid, hold, idle, input, roomFile } from './helpers.js';

/** Object types the tests use: a jump pad (D221). */
const OBJECTS = { pad: { kind: 'pad', color: '#ff2bd6' } };

/** A 1-high ledge over x 4..7 and a stair rising +x up to it at x 3, along z 0..7. */
function stairGrid(extra = {}) {
  const ledge = [];
  for (let x = 4; x < 8; x++) for (let z = 0; z < 8; z++) ledge.push([x, 0, z]);
  return grid({ size: [8, 4, 8], cells: ledge, blocks: { stair_x: [[3, 0, 2]], ...extra } });
}

/** Run a player `ticks` ticks with `controls`; returns the ticks he was in the air. */
function run(player, g, controls, ticks) {
  let air = 0;
  for (let i = 0; i < ticks; i++) {
    player.update(controls, g);
    if (!player.grounded) air++;
  }
  return air;
}

test('stair: he walks up it from its foot onto the ledge', () => {
  const g = stairGrid();
  const player = new Player([1.5, 0, 2.5]);
  run(player, g, idle, 5);
  run(player, g, hold('down'), 60);
  assert.ok(player.pos[0] > 4.5, `he got onto the ledge (x ${player.pos[0]})`);
  assert.ok(Math.abs(player.pos[1] - 1) < 1e-6, `and stands on it (y ${player.pos[1]})`);
});

test('stair: its side is a wall', () => {
  const g = stairGrid();
  const player = new Player([3.5, 0, 4.5]);
  run(player, g, idle, 5);
  run(player, g, hold('right'), 60); // −z, into the stair's side
  assert.equal(player.pos[1], 0);
  assert.ok(player.pos[2] >= 3.3 - 1e-9, `stopped at its side (z ${player.pos[2]})`);
});

test('stair: he walks down it keeping to the slope, never in the air', () => {
  const g = stairGrid();
  const player = new Player([5.5, 1, 2.5]);
  run(player, g, idle, 5);
  const air = run(player, g, hold('up'), 60); // −x, down the stair
  assert.ok(player.pos[0] < 3, `he came down (x ${player.pos[0]})`);
  assert.equal(player.pos[1], 0);
  assert.equal(air, 0);
});

test('slab: he walks upright under one a cell up and stands on its top', () => {
  const slabs = [2, 3, 4, 5].map((x) => [x, 1, 2]);
  const g = grid({ size: [8, 4, 8], blocks: { slab: slabs } });
  const under = new Player([0.5, 0, 2.5]);
  run(under, g, idle, 5);
  run(under, g, hold('down'), 90);
  assert.ok(under.pos[0] > 6, `he passed under it (x ${under.pos[0]})`);
  const over = new Player([3.5, 3, 2.5]);
  run(over, g, idle, 60);
  assert.ok(Math.abs(over.pos[1] - 2) < 1e-6, `he lands on its top (y ${over.pos[1]})`);
});

test('jump: no jump where he may not (D221), a jump where he may', () => {
  const g = grid();
  for (const canJump of [false, true]) {
    const player = new Player([2.5, 0, 2.5]);
    run(player, g, idle, 5);
    const controls = input([], ['jump']);
    const event = player.update(controls, g, { canJump });
    assert.equal(event === 'jump', canJump);
  }
});

/** A game in one 8×4×8 room with `"jump": "pads"` and a pad at [4, 0, 4]. */
function padGame(spawn) {
  const room = roomFile('r', { spawn, jump: 'pads', objects: [{ id: 'pad', type: 'pad', at: [4, 0, 4] }] });
  const game = new Game(gameData({ rooms: [room], objects: OBJECTS }));
  for (let i = 0; i < 10; i++) game.update(idle);
  return game;
}

/** Does a tap of the jump key make him jump this tick? */
const jumps = (game) => game.update(input([], ['jump'])).some((event) => event.type === 'jump');

test('pads: in a pads room he jumps only standing on a pad, and the pad counts it', () => {
  assert.equal(jumps(padGame([1.5, 0, 1.5])), false);
  const game = padGame([4.5, 0, 4.5]);
  assert.equal(jumps(game), true);
  assert.equal(game.pads[0].jumps, 1);
});

test('pads: the debug rule makes every room pads-only', () => {
  const room = roomFile('r', {});
  const game = new Game(gameData({ rooms: [room], objects: OBJECTS }));
  assert.equal(game.jumpRule(), 'free');
  game.padJumpOnly = true;
  assert.equal(game.jumpRule(), 'pads');
  for (let i = 0; i < 10; i++) game.update(idle);
  assert.equal(jumps(game), false);
});

/** Reach of a room "r" (8×4×8) from cell [1, 0, 1], no abilities. */
function reach(props) {
  const content = gameData({ rooms: [roomFile('r', props)], objects: OBJECTS });
  return analyzeRoom(buildRoom(content.rooms.get('r'), content), { abilities: [], starts: [[1, 0, 1]], tuning: { scanRange: 6, blinkRange: 3 } });
}

/** A 1-high wall across the room at x 4 with a pickup beyond it. */
const WALL = { at: [4, 0, 0], to: [4, 0, 7] };
const FAR = { id: 'far', type: 'refill_energy', at: [6, 0, 6] };

test('reach: in a pads room a 1-high wall is a wall, a stair or a pad gets him over', () => {
  assert.equal(reach({ blocks: [WALL], pickups: [FAR] }).pickups.has('far'), true, 'a free jump clears it');
  assert.equal(reach({ jump: 'pads', blocks: [WALL], pickups: [FAR] }).pickups.has('far'), false);
  const stair = { type: 'stair_x', at: [3, 0, 3] };
  assert.equal(reach({ jump: 'pads', blocks: [WALL, stair], pickups: [FAR] }).pickups.has('far'), true);
  const backwards = { type: 'stair_nx', at: [3, 0, 3] };
  assert.equal(reach({ jump: 'pads', blocks: [WALL, backwards], pickups: [FAR] }).pickups.has('far'), false, 'a stair climbs one way');
  const pad = { id: 'pad', type: 'pad', at: [3, 0, 3] };
  assert.equal(reach({ jump: 'pads', blocks: [WALL], objects: [pad], pickups: [FAR] }).pickups.has('far'), true);
});

test('reach: in a pads room a pickup two cells up needs a pad', () => {
  const high = { id: 'far', type: 'refill_energy', at: [3, 2, 3] };
  assert.equal(reach({ pickups: [high] }).pickups.has('far'), true);
  assert.equal(reach({ jump: 'pads', pickups: [high] }).pickups.has('far'), false);
  assert.equal(reach({ jump: 'pads', objects: [{ id: 'pad', type: 'pad', at: [3, 0, 3] }], pickups: [high] }).pickups.has('far'), true);
});

test('reach: he walks under a slab a cell up', () => {
  // A full-height wall with a gap at [4, 0, 3], closed a cell up by a block or a slab.
  const through = (type) => {
    const top = { ...(type && { type }), at: [4, 1, 3] };
    const blocks = [{ at: [4, 0, 0], to: [4, 3, 2] }, { at: [4, 0, 4], to: [4, 3, 7] }, top, { at: [4, 2, 3], to: [4, 3, 3] }];
    return reach({ blocks, pickups: [FAR] }).pickups.has('far');
  };
  assert.equal(through(), false, 'under a block there is no headroom');
  assert.equal(through('slab'), true);
});

test('validation: a stair needs a rise, only a stair has one; a pad lies on something', () => {
  const errors = (blocks, rooms = [roomFile('r', {})]) => validateData(dataFiles({ rooms, objects: OBJECTS, blocks: { ...BLOCK_TYPES, ...blocks } }));
  assert.deepEqual(errors({}), []);
  assert.match(errors({ odd: { look: 'stair' } }).join(), /a stair needs a "rise"/);
  assert.match(errors({ odd: { look: 'plain', rise: '+x' } }).join(), /only the stair look has a "rise"/);
  const floating = roomFile('r', { objects: [{ id: 'pad', type: 'pad', at: [2, 1, 2] }] });
  assert.match(errors({}, [floating]).join(), /a pad lies on the floor or on top of a block/);
  const onBlock = roomFile('r', { blocks: [{ at: [2, 0, 2] }], objects: [{ id: 'pad', type: 'pad', at: [2, 1, 2] }] });
  assert.deepEqual(errors({}, [onBlock]), []);
});

test('stair look: the profile climbs the way of its rise', () => {
  const tops = (rise) => stairSegments().flatMap((s) => s).map(riseTurn(rise)).filter(([, y]) => y === 1);
  // Its top step lies at the high end: x near 1 for +x, near 0 for −x, z near 1 for +z.
  assert.ok(tops('+x').every(([x]) => x >= 0.75 - 1e-9));
  assert.ok(tops('-x').every(([x]) => x <= 0.25 + 1e-9));
  assert.ok(tops('+z').every(([, , z]) => z >= 0.75 - 1e-9));
  assert.ok(tops('-z').every(([, , z]) => z <= 0.25 + 1e-9));
});
