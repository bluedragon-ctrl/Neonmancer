import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../src/data/validate.js';
import { Player } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { riseTurn, stairSegments } from '../src/render/stair-view.js';
import { analyzeRoom } from '../src/world/reach.js';
import { buildRoom } from '../src/world/room.js';
import { ACTIONS, DEFAULT_BINDINGS } from '../src/core/bindings.js';
import { BLOCK_TYPES, BUG, CRATE, VIRUS, dataFiles, gameData, grid, hold, idle, input, roomFile } from './helpers.js';

/** Object types the tests use: a jump pad (D221). */
const OBJECTS = { pad: { kind: 'pad', color: '#ff2bd6' }, pad_low: { kind: 'pad', color: '#ff2bd6', launch: 1.2 }, crate: CRATE };

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

/** A game in one 8×4×8 room with a pad at [5, 0, 3] and a pit at x 4 (`props`: more room data). */
function padGame(spawn, props = {}) {
  const room = roomFile('r', { spawn, objects: [{ id: 'pad', type: 'pad', at: [5, 0, 3] }], holes: [{ at: [4, 0], to: [4, 7] }], ...props });
  return new Game(gameData({ rooms: [room], objects: OBJECTS }));
}

test('pads: there is no jump key, Space casts (D272)', () => {
  const game = padGame([6.5, 0, 6.5]);
  game.player.spells = ['zap'];
  game.player.spell = 'zap';
  for (let i = 0; i < 10; i++) game.update(idle);
  const events = game.update(input([], ['cast'])).map((event) => event.type);
  assert.equal(events.includes('cast'), true);
  assert.ok(DEFAULT_BINDINGS.cast.includes('Space') && !ACTIONS.includes('jump'));
});

test('pads: standing on one throws him 2 blocks up, no key needed', () => {
  {
    const game = padGame([5.5, 0, 3.5]);
    let top = 0;
    let bounces = 0;
    for (let i = 0; i < 40; i++) {
      bounces += game.update(idle).filter((event) => event.type === 'bounce').length;
      top = Math.max(top, game.player.pos[1]);
    }
    assert.ok(bounces >= 1 && game.pads[0].launches === bounces, 'a bounce for each launch');
    assert.ok(top > 2 && top < 2.3, `up to 2.2 (${top})`);
  }
});

test('pads: walking onto one from its far edge carries him over a 1-tile pit', () => {
  const game = padGame([7.5, 0, 3.5]);
  for (let i = 0; i < 10; i++) game.update(idle);
  for (let i = 0; i < 90 && game.player.pos[0] > 3.3; i++) game.update(hold('up'));
  for (let i = 0; i < 30; i++) game.update(idle);
  assert.equal(game.player.dead, false);
  assert.ok(game.player.pos[0] < 4, `he landed beyond the pit (x ${game.player.pos[0]})`);
});

/** Reach of a room "r" (8×4×8) from cell [1, 0, 1], no abilities. */
function reach(props) {
  const content = gameData({ rooms: [roomFile('r', props)], objects: OBJECTS });
  return analyzeRoom(buildRoom(content.rooms.get('r'), content), { abilities: [], starts: [[1, 0, 1]], tuning: { scanRange: 6, blinkRange: 3 } });
}

/** A 1-high wall across the room at x 4 with a pickup beyond it. */
const WALL = { at: [4, 0, 0], to: [4, 0, 7] };
const FAR = { id: 'far', type: 'refill_energy', at: [6, 0, 6] };

test('reach: a 1-high wall is a wall, a stair or a pad gets him over', () => {
  assert.equal(reach({ blocks: [WALL], pickups: [FAR] }).pickups.has('far'), false);
  const stair = { type: 'stair_x', at: [3, 0, 3] };
  assert.equal(reach({ blocks: [WALL, stair], pickups: [FAR] }).pickups.has('far'), true);
  const backwards = { type: 'stair_nx', at: [3, 0, 3] };
  assert.equal(reach({ blocks: [WALL, backwards], pickups: [FAR] }).pickups.has('far'), false, 'a stair climbs one way');
  const pad = { id: 'pad', type: 'pad', at: [3, 0, 3] };
  assert.equal(reach({ blocks: [WALL], objects: [pad], pickups: [FAR] }).pickups.has('far'), true);
});

test('reach: a pad throws him as high as its launch: 2 blocks by default', () => {
  const wall = { at: [4, 0, 0], to: [4, 1, 7] };
  const with2 = (type) => reach({ blocks: [wall], objects: [{ id: 'pad', type, at: [3, 0, 3] }], pickups: [{ ...FAR, at: [4, 2, 3] }] }).pickups.has('far');
  assert.equal(with2('pad'), true);
  assert.equal(with2('pad_low'), false);
});

/**
 * Where a throw over the pit lands, a ledge `high` blocks high beyond it (x 0..3): walked onto the
 * pad from its side (`side`, launched from its middle) or run onto from behind (`behind`), then held
 * on towards the ledge. Returns his height, or -1 if he fell in.
 */
function throwOver(high, approach) {
  const spawn = approach === 'side' ? [5.5, 0, 5.5] : [7.5, 0, 3.5];
  const game = padGame(spawn, { blocks: [{ at: [0, 0, 0], to: [3, high - 1, 7] }] });
  for (let i = 0; i < 10; i++) game.update(idle);
  let launched = false;
  for (let i = 0; i < 150 && !game.player.dead && !(launched && game.player.grounded); i++) {
    game.update(hold(launched || approach === 'behind' ? 'up' : 'right'));
    launched ||= game.player.pos[1] > 0.05;
  }
  return game.player.dead ? -1 : game.player.pos[1];
}

test('pads: a throw over a 1-tile pit lands 2 up, never 3, however he came onto the pad (D243, D274)', () => {
  for (const approach of ['side', 'behind']) {
    assert.equal(throwOver(1, approach), 1, `a 1-high ledge, ${approach}`);
    assert.equal(throwOver(2, approach), 2, `a 2-high ledge, ${approach}`);
    assert.notEqual(throwOver(3, approach), 3, `never 3 up, ${approach}`);
  }
});

/**
 * Where a throw from a pad at [5, 0, 3] flush against a ledge `high` blocks high (x 0..4) lands, held
 * on towards it: walked onto from its side (`side`) or run onto from behind (`behind`); `stair` puts
 * a stair far off in the room (shaped collision, D221). Returns his height.
 */
function throwFlush(high, approach, stair) {
  const blocks = [{ at: [0, 0, 0], to: [4, high - 1, 7] }];
  if (stair) blocks.push({ type: 'stair_x', at: [6, 0, 7] });
  const spawn = approach === 'side' ? [5.5, 0, 5.5] : [7.5, 0, 3.5];
  const game = new Game(gameData({ rooms: [roomFile('r', { spawn, objects: [{ id: 'pad', type: 'pad', at: [5, 0, 3] }], blocks })], objects: OBJECTS }));
  for (let i = 0; i < 10; i++) game.update(idle);
  let launched = false;
  for (let i = 0; i < 150 && !(launched && game.player.grounded); i++) {
    game.update(hold(launched || approach === 'behind' ? 'up' : 'right'));
    launched ||= game.player.pos[1] > 0.05;
  }
  return game.player.pos[1];
}

test('pads: a pad flush against a ledge 1 or 2 up lands him on it, a stair in the room or not (D244)', () => {
  for (const stair of [false, true]) {
    for (const approach of ['side', 'behind']) {
      for (const high of [1, 2]) assert.equal(throwFlush(high, approach, stair), high, `${high} up, ${approach}, stair ${stair}`);
    }
  }
});

test('reach: a pad throws him over a 1-tile gap onto a ledge 2 up, never 3 (D243)', () => {
  const pit = { at: [4, 0], to: [4, 7] };
  const reached = (high) => reach({ holes: [pit], blocks: [{ at: [5, 0, 0], to: [7, high, 7] }], objects: [{ id: 'pad', type: 'pad', at: [3, 0, 3] }], pickups: [{ ...FAR, at: [6, high + 1, 6] }] }).pickups.has('far');
  assert.equal(reached(0), true);
  assert.equal(reached(1), true);
  assert.equal(reached(2), false);
});

test('reach: a pickup two cells up needs a pad', () => {
  const high = { id: 'far', type: 'refill_energy', at: [3, 2, 3] };
  assert.equal(reach({ pickups: [high] }).pickups.has('far'), false);
  assert.equal(reach({ objects: [{ id: 'pad', type: 'pad', at: [3, 0, 3] }], pickups: [high] }).pickups.has('far'), true);
});

test('reach: in a pads room a bouncy enemy he falls onto is a pad (D223)', () => {
  // A 2-high wall at x 5, the bug's lane along x 4; a 1-high ledge at x 3 (z 0..3) with a stair up to it.
  const wall = { at: [5, 0, 0], to: [5, 1, 7] };
  const ledge = { at: [3, 0, 0], to: [3, 0, 3] };
  const stair = { type: 'stair_x', at: [2, 0, 1] };
  const bug = { id: 'bug', template: 'bug', at: [4, 0, 0], path: { points: [[4, 0, 7]] } };
  const over = (props) => reach({ pickups: [FAR], ...props }).pickups.has('far');
  assert.equal(over({ blocks: [wall, ledge, stair], enemies: [bug] }), true, 'off the ledge onto the bug, thrown over the wall');
  assert.equal(over({ blocks: [wall, ledge, stair] }), false, 'no bug, no way over');
  assert.equal(over({ blocks: [wall, ledge], enemies: [bug] }), false, 'from its own level he never gets on top of it');
  const high = { at: [5, 0, 0], to: [5, 2, 7] };
  assert.equal(over({ blocks: [high, ledge, stair], enemies: [bug] }), false, 'a 3-high wall stops the bounce');
});

test('reach: a crate pushed down a stair plugs the pit at its foot, never up one (D230)', () => {
  // A 1-high ledge over z 0..4 he starts on, a stair down from it at [4, 0, 5] (rising −z), a pit along z 6, the pickup beyond.
  const room = (crate) => ({
    spawn: [1.5, 1, 1.5],
    blocks: [{ at: [0, 0, 0], to: [7, 0, 4] }, { type: 'stair_nz', at: [4, 0, 5] }],
    holes: [{ at: [0, 6], to: [7, 6] }],
    pickups: [{ ...FAR, at: [4, 0, 7] }],
    objects: crate ? [{ id: 'c', type: 'crate', at: crate }] : [],
  });
  const far = (crate) => {
    const content = gameData({ rooms: [roomFile('r', room(crate))], objects: OBJECTS });
    return analyzeRoom(buildRoom(content.rooms.get('r'), content), { abilities: [], starts: [[1, 1, 1]], tuning: { scanRange: 6, blinkRange: 3 } }).pickups.has('far');
  };
  assert.equal(far([4, 1, 3]), true, 'down the stair into the pit');
  assert.equal(far(null), false, 'no crate, no way over');
  assert.equal(far([2, 0, 5]), false, 'a crate on the floor below never goes up the stair to the ledge');
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

/**
 * A game with a 1-high ledge over x 4..7 (z 0..7), a stair rising +x up to
 * it at [3, 0, 2], the given enemies and crates, and the wizard at `pos`
 * (far off by default).
 */
function stairGame({ enemies = [], crates = [], blocks = [], pos = [0.5, 0, 7.5] } = {}) {
  const room = roomFile('r', {
    spawn: [0.5, 0, 7.5],
    blocks: [{ at: [4, 0, 0], to: [7, 0, 7] }, { type: 'stair_x', at: [3, 0, 2] }, ...blocks],
    enemies: enemies.map((enemy, i) => ({ id: `e${i}`, template: 'bug', ...enemy })),
    objects: crates.map((at, i) => ({ id: `c${i}`, type: 'crate', at })),
  });
  const game = new Game(gameData({ rooms: [room], objects: { crate: CRATE }, enemies: { bug: BUG, virus: { ...VIRUS, attack: 'touch' } } }));
  game.player.place(pos);
  return game;
}

/** Run the game until `done()` (at most `limit` ticks); fails if it never is. */
function runUntil(game, done, what, limit = 600) {
  for (let i = 0; i < limit; i++) {
    if (done()) return;
    game.update(idle);
  }
  assert.fail(what);
}

test('stair: an enemy walks down it off the ledge and back up it, never resting on it (D230)', () => {
  const game = stairGame({ enemies: [{ at: [6, 1, 2], path: { points: [[0, 1, 2]] } }] });
  game.invincible = true;
  const [bug] = game.enemies;
  let onStair = false;
  const watch = () => {
    if (bug.state === 'rest' && bug.pos[0] === 3) onStair = true;
    return false;
  };
  runUntil(game, () => watch() || (bug.state === 'rest' && bug.pos[0] === 0), 'it walked down to the far end');
  assert.equal(bug.pos[1], 0, 'on the floor');
  runUntil(game, () => watch() || (bug.state === 'rest' && bug.pos[0] === 6), 'and back up to the start');
  assert.equal(bug.pos[1], 1, 'on the ledge');
  assert.equal(onStair, false, 'never standing on the stair');
});

test('stair: its side is a wall to an enemy, and so is its top from the side (D230)', () => {
  const game = stairGame({ enemies: [{ at: [1, 0, 5], variant: { movement: 'stationary' } }] });
  const [bug] = game.enemies;
  assert.equal(bug.stepTo([3, 0, 3], [0, -1], game), null, 'into its side');
  assert.equal(bug.stepTo([3, 0, 1], [0, 1], game), null, 'into its other side');
  assert.equal(game.grid.stairStep(3, 1, 3, 0, -1), null, 'onto its top from the side');
  assert.equal(bug.stepTo([2, 0, 2], [1, 0], game).rise, 1, 'up from its foot');
  assert.equal(bug.stepTo([4, 1, 2], [-1, 0], game).rise, -1, 'down from the ledge');
});

test('stair: a chaser goes up it after the wizard on the ledge (D230)', () => {
  const game = stairGame({ enemies: [{ template: 'virus', at: [1, 0, 2] }], pos: [5.5, 1, 4.5] });
  game.invincible = true;
  const [virus] = game.enemies;
  runUntil(game, () => virus.pos[1] === 1 && virus.state === 'rest', 'it climbed onto the ledge');
  assert.ok(virus.pos[0] >= 4, `on the ledge (x ${virus.pos[0]})`);
});

test('stair: a frozen enemy pushed off the ledge slides down it to its foot, never up it (D230)', () => {
  const game = stairGame({ enemies: [{ at: [4, 1, 2], variant: { movement: 'stationary' } }, { at: [2, 0, 5], variant: { movement: 'stationary' } }] });
  const [bug, low] = game.enemies;
  low.pos = [2, 0, 2];
  low.freeze(600);
  assert.equal(low.push([1, 0], game), false, 'into its foot: a wall');
  low.pos = [2, 0, 5];
  bug.freeze(600);
  assert.ok(bug.push([-1, 0], game));
  runUntil(game, () => bug.state === 'rest', 'it arrived');
  assert.deepEqual(bug.pos, [2, 0, 2]);
});

test("stair: a crate is never pushed up it; pushed off the ledge over its top it slides down to its foot (D230)", () => {
  const game = stairGame({ crates: [[2, 0, 2], [5, 1, 2]] });
  const [low, high] = game.objects.filter((o) => o.kind === 'pushable');
  assert.equal(low.push([1, 0], game), false, 'into its foot: a wall');
  assert.ok(high.push([-1, 0], game));
  runUntil(game, () => high.state === 'rest', 'it arrived', 120);
  assert.deepEqual(high.pos, [4, 1, 2], 'one cell along the ledge first');
  // The low crate is in the foot cell: down is blocked until it moves.
  assert.equal(high.push([-1, 0], game), false, 'its foot is taken');
  low.pos = [1, 0, 5];
  let lowest = Infinity;
  assert.ok(high.push([-1, 0], game));
  runUntil(
    game,
    () => {
      // Its bottom stays on the slope: never below the highest point of it under the crate.
      lowest = Math.min(lowest, high.pos[1] - Math.min(1, Math.max(0, high.pos[0] - 2)));
      return high.state === 'rest';
    },
    'it came down',
    120,
  );
  assert.deepEqual(high.pos, [2, 0, 2]);
  assert.ok(lowest >= -1e-9, 'on the slope, not in it');
});

test("stair: a crate pushed into its side or onto its top from the side doesn't move (D230)", () => {
  const game = stairGame({ crates: [[3, 0, 3], [3, 1, 1]], blocks: [{ at: [3, 0, 1] }] });
  const [side, top] = game.objects.filter((o) => o.kind === 'pushable');
  assert.equal(side.push([0, -1], game), false, 'into its side');
  assert.equal(top.push([0, 1], game), false, 'onto its top, from a block beside it');
});

test("stair: the wizard can't push a crate up it (D230)", () => {
  const game = stairGame({ crates: [[2, 0, 2]], pos: [1.5, 0, 2.5] });
  const [crate] = game.objects.filter((o) => o.kind === 'pushable');
  for (let i = 0; i < 90; i++) game.update(hold('down')); // +x, into the stair
  assert.deepEqual(crate.pos, [2, 0, 2]);
});
