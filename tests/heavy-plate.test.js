import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data/load.js';
import { validateData } from '../src/data/validate.js';
import { Game } from '../src/game.js';
import { partialLight, plateMarks, SWITCH_FX, heavyPairSquares } from '../src/render/switch-view.js';
import { buildRoom } from '../src/world/room.js';
import { analyzeRoom } from '../src/world/reach.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { BUG, CRATE, dataFiles, gameData, idle, roomFile } from './helpers.js';

/** Plate types as in defs.json: plain, heavy (D200) and a heavy timed one. */
const TYPES = {
  crate: CRATE,
  plate: { kind: 'plate', color: '#eef3ff', edges: 'dashed' },
  plate_heavy: { kind: 'plate', color: '#eef3ff', edges: 'dashed', weight: 2 },
  plate_heavy_timed: { kind: 'plate', color: '#eef3ff', edges: 'dashed', weight: 2, timer: 0.5 },
  plate_weight_3: { kind: 'plate', color: '#eef3ff', edges: 'dashed', weight: 3 },
  target: { kind: 'target', color: '#eef3ff' },
};

const PLATE = { id: 'p', type: 'plate_heavy', at: [5, 0, 5] };
const crate = (id, y) => ({ id, type: 'crate', at: [5, y, 5] });
const peaceful = (id, y) => ({ id, template: 'bug', at: [5, y, 5], variant: { movement: 'stationary', hostility: 'peaceful' } });

/** Room alpha (8×4×8) with `objects` and `enemies`; its east exit is locked on every switch. */
function files({ objects = [], enemies = [] } = {}) {
  return dataFiles({
    rooms: [
      roomFile('alpha', { exits: [{ id: 'east', side: '+x', at: 3, requires: [{ switch: '*' }] }], objects, enemies }),
      roomFile('beta', { spawn: [1, 0, 4], exits: [{ id: 'west', side: '-x', at: 3 }] }),
    ],
    objects: TYPES,
    enemies: { bug: BUG },
    connections: [['alpha.east', 'beta.west']],
  });
}

function gameWith(options) {
  return new Game(loadGameData(files(options)), { start: 'alpha', progress: new Progress() });
}

function run(game, ticks = 30) {
  for (let i = 0; i < ticks; i++) game.update(idle);
}

/** A game with `objects`, settled; its one plate. */
function settled(options) {
  const game = gameWith(options);
  run(game);
  return { game, plate: game.switches.find((object) => object.id === 'p') };
}

test('a heavy plate is off and not partial with nothing on it, partial with one crate, on with a stack of two', () => {
  const empty = settled({ objects: [PLATE] });
  assert.equal(empty.plate.weight, 2);
  assert.equal(empty.plate.on, false);
  assert.equal(empty.plate.partial, false);
  assert.equal(empty.plate.load, 0);

  const one = settled({ objects: [PLATE, crate('c1', 0)] });
  assert.equal(one.plate.on, false, 'one crate is too little');
  assert.equal(one.plate.partial, true, 'it flickers');
  assert.equal(one.plate.load, 1);

  const two = settled({ objects: [PLATE, crate('c1', 0), crate('c2', 1)] });
  assert.equal(two.plate.on, true);
  assert.equal(two.plate.partial, false);
  assert.equal(two.plate.load, 2);
});

test('two crates side by side, in the next cell, are no weight on the plate', () => {
  const { plate } = settled({ objects: [PLATE, crate('c1', 0), { id: 'c2', type: 'crate', at: [6, 0, 5] }] });
  assert.equal(plate.on, false);
  assert.equal(plate.load, 1);
});

test('a plain plate is unchanged: weight 1, on with one body, never partial', () => {
  const { plate } = settled({ objects: [{ id: 'p', type: 'plate', at: [5, 0, 5] }, crate('c1', 0)] });
  assert.equal(plate.weight, 1);
  assert.equal(plate.on, true);
  assert.equal(plate.partial, false);
});

test('a crate and a frozen enemy on it are two weights; the enemy alone is one', () => {
  const alone = gameWith({ objects: [PLATE], enemies: [peaceful('b', 0)] });
  alone.liveEnemies[0].freeze(600);
  run(alone);
  const plate = alone.switches[0];
  assert.equal(plate.on, false);
  assert.equal(plate.partial, true);

  const stacked = gameWith({ objects: [PLATE, crate('c1', 0)], enemies: [peaceful('b', 1)] });
  stacked.liveEnemies[0].freeze(600);
  run(stacked, 40);
  assert.equal(stacked.switches[0].load, 2);
  assert.equal(stacked.switches[0].on, true);
});

test('the decoy alone is one weight: the plate stays off and flickers', () => {
  const rooms = [roomFile('alpha', { size: [12, 4, 8], spawn: [0.5, 0, 7.5], objects: [{ ...PLATE, at: [2, 0, 3] }] })];
  const game = new Game(gameData({ rooms, objects: TYPES }), { progress: new Progress([saveBit('spells', 8)]) });
  game.player.spell = 'fork';
  game.player.place([1.5, 0, 3.5]);
  game.player.facing = game.player.targetFacing = Math.PI / 2;
  run(game, 20);
  game.update({ down: (a) => a === 'cast', pressed: (a) => a === 'cast' });
  run(game, 5);
  const [plate] = game.switches;
  assert.equal(game.decoy.active, true);
  assert.equal(plate.load, 1, 'the decoy weighs one');
  assert.equal(plate.on, false);
  assert.equal(plate.partial, true);
});

test('the wizard counts: on a crate on the plate he makes two, and the plate goes off when he steps off', () => {
  const game = gameWith({ objects: [PLATE, crate('c1', 0)] });
  run(game);
  const [plate] = game.switches;
  assert.equal(plate.on, false);
  game.player.place([5.5, 1, 5.5]);
  run(game, 3);
  assert.equal(plate.load, 2, 'a crate and the wizard on it');
  assert.equal(plate.on, true);
  game.player.place([2.5, 0, 2.5]);
  run(game, 3);
  assert.equal(plate.on, false, 'only while he stays');
  assert.equal(plate.partial, true);
});

test('a heavier weight takes more bodies; a timed heavy plate counts down once the weight is gone', () => {
  const three = settled({ objects: [{ ...PLATE, type: 'plate_weight_3' }, crate('c1', 0), crate('c2', 1)] });
  assert.equal(three.plate.load, 2);
  assert.equal(three.plate.on, false);
  const full = settled({ objects: [{ ...PLATE, type: 'plate_weight_3' }, crate('c1', 0), crate('c2', 1), crate('c3', 2)] });
  assert.equal(full.plate.on, true);

  const game = gameWith({ objects: [{ ...PLATE, type: 'plate_heavy_timed' }, crate('c1', 0), crate('c2', 1)] });
  run(game);
  const [plate] = game.switches;
  assert.equal(plate.on, true);
  assert.equal(plate.countdown, null, 'no countdown while pressed');
  // Take the stack away (derezzed crates leave no weight): it counts down, then goes off.
  for (const object of game.objects.filter((one) => one.kind === 'pushable')) object.pos[0] = 1.2;
  run(game, 5);
  assert.equal(plate.on, true, 'still on for its time');
  assert.ok(plate.countdown > 0);
  run(game, 40);
  assert.equal(plate.on, false);
});

test('a heavy plate powers a locked exit like any plate, only with its full weight', () => {
  const one = gameWith({ objects: [PLATE, crate('c1', 0)] });
  run(one);
  assert.equal(one.locks[0].open, false);
  const two = gameWith({ objects: [PLATE, crate('c1', 0), crate('c2', 1)] });
  run(two);
  assert.equal(two.locks[0].open, true);
});

test('weight is a plate property: validation takes it on plates, rejects it on other kinds', () => {
  assert.deepEqual(validateData(files({ objects: [PLATE] })), []);
  const bad = dataFiles({
    rooms: [roomFile('alpha', { objects: [{ id: 'c', type: 'crate_weighted', at: [2, 0, 2] }] })],
    objects: { ...TYPES, crate_weighted: { ...CRATE, weight: 2 } },
  });
  const errors = validateData(bad);
  assert.ok(errors.some((e) => /weight/.test(e)), errors.join('\n'));
});

test('heavy plate look: two squares overlapping in a corner, flicker between dark and half', () => {
  const [a, b] = heavyPairSquares();
  assert.ok(b[0] > a[0] && b[0] < a[1] && b[1] > a[1], 'the second starts inside the first and ends beyond it');
  assert.ok(Math.abs((a[0] + b[1]) / 2 - 0.5) < 1e-9, 'the pair is centred on the tile');
  const marks = plateMarks(0.01);
  assert.equal(marks.pair.length, 2);
  assert.equal(marks.pair[0].length, 4);
  const seen = new Set();
  for (let t = 0; t < 3; t += 0.01) seen.add(partialLight(t));
  assert.deepEqual([...seen].sort(), [SWITCH_FX.partialLo, SWITCH_FX.partialHi].sort());
  assert.ok(SWITCH_FX.partialHi < 0.7, 'never as lit as a pressed plate');
});

// --- reachability (D200) ---------------------------------------------------

const REACH_TUNING = { scanRange: 6, blinkRange: 3 };

/** Can he reach the pickup behind a gate wall at x = 5 (powered by the plate p) with `abilities`? */
function reachFar({ objects, blocks = [], enemies = [] }, abilities = []) {
  const wall = { type: 'gate', at: [5, 0, 0], to: [5, 3, 7] };
  const content = gameData({
    rooms: [roomFile('r', { size: [12, 4, 8], objects, blocks: [wall, ...blocks], enemies, pickups: [{ id: 'far', type: 'refill_energy', at: [10, 0, 4] }] })],
    objects: TYPES,
    enemies: { bug: BUG },
  });
  const room = buildRoom(content.rooms.get('r'), content);
  return analyzeRoom(room, { abilities, starts: [[1, 0, 1]], tuning: REACH_TUNING }).pickups.has('far');
}

const heavy = { id: 'p', type: 'plate_heavy', at: [2, 0, 4] };
const at = (id, x, y, z) => ({ id, type: 'crate', at: [x, y, z] });
/** A bug whose lane crosses the plate's tile. */
const lane = (id) => ({ id, template: 'bug', at: [2, 0, 1 + Number(id.slice(1))], path: { points: [[2, 0, 6]] } });

test('reach: one crate does not power a heavy plate, a stack of two does', () => {
  assert.equal(reachFar({ objects: [heavy, at('c1', 2, 0, 4)] }), false);
  assert.equal(reachFar({ objects: [heavy, at('c1', 2, 0, 4), at('c2', 2, 1, 4)] }), true);
  assert.equal(reachFar({ objects: [{ ...heavy, type: 'plate_weight_3' }, at('c1', 2, 0, 4), at('c2', 2, 1, 4)] }), false);
});

test('reach: a crate pushed off a ledge onto the crate on the plate builds the stack', () => {
  // A ledge two blocks wide at x = 3-4; crate B on it at x = 3, he climbs onto x = 4 and pushes it west onto A.
  const ledge = { at: [3, 0, 4], to: [4, 0, 4] };
  const stack = { objects: [heavy, at('a', 2, 0, 4), at('b', 3, 1, 4)], blocks: [ledge] };
  assert.equal(reachFar(stack), true);
  assert.equal(reachFar({ ...stack, objects: [heavy, at('a', 2, 0, 4)] }), false, 'without the ledge crate');
});

test('reach: frozen enemies each add one weight, the decoy one, and the same one never twice', () => {
  const lanes = (n) => Array.from({ length: n }, (_, i) => lane(`b${i}`));
  assert.equal(reachFar({ objects: [heavy], enemies: lanes(1) }, ['pause']), false);
  assert.equal(reachFar({ objects: [heavy], enemies: lanes(2) }, ['pause']), true);
  assert.equal(reachFar({ objects: [heavy] }, ['fork']), false, 'the decoy alone is one');
  assert.equal(reachFar({ objects: [heavy], enemies: lanes(1) }, ['pause', 'fork']), true, 'an enemy and the decoy');
  assert.equal(reachFar({ objects: [heavy, at('c1', 2, 0, 4)], enemies: lanes(1) }, ['pause']), false, 'the enemy lane is below the crate: it rests on top only');
});

test('reach: a crate placed by Compile is one weight, so it needs a crate under it too', () => {
  assert.equal(reachFar({ objects: [heavy] }, ['compile']), false);
  assert.equal(reachFar({ objects: [heavy, at('c1', 2, 0, 4)] }, ['compile']), true);
});

test('reach: the wizard counts only on a timed heavy plate, and then with one more weight', () => {
  const timed = { ...heavy, type: 'plate_heavy_timed' };
  assert.equal(reachFar({ objects: [heavy, at('c1', 2, 0, 4)] }), false, 'he cannot hold a plain one and pass');
  assert.equal(reachFar({ objects: [timed, at('c1', 2, 0, 4)] }), true, 'a crate and he runs on while it counts down');
  assert.equal(reachFar({ objects: [timed] }), false, 'he alone is one');
});
