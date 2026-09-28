import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data/load.js';
import { validateData } from '../src/data/validate.js';
import { Game } from '../src/game.js';
import { SWITCH_FX, plateMarks, targetMarks } from '../src/render/switch-view.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { CRATE, dataFiles, eventTypes, hold, idle, roomFile } from './helpers.js';

/** Switch types as in defs.json. */
const TYPES = {
  crate: CRATE,
  target: { kind: 'target', color: '#eef3ff' },
  plate: { kind: 'plate', color: '#eef3ff', edges: 'dashed' },
};

/** Fake input pressing cast this tick. */
const cast = { down: (a) => a === 'cast', pressed: (a) => a === 'cast' };

/**
 * Two rooms: alpha (8×4×8, its east exit locked, with `objects` and
 * `enemies`) and beta, joined alpha.east ↔ beta.west.
 */
function files({ objects = [], enemies = [], exit = { id: 'east', side: '+x', at: 3, locked: true } } = {}) {
  return dataFiles({
    rooms: [
      roomFile('alpha', { exits: [exit], objects, enemies }),
      roomFile('beta', { spawn: [1, 0, 4], exits: [{ id: 'west', side: '-x', at: 3 }] }),
    ],
    objects: TYPES,
    connections: [['alpha.east', 'beta.west']],
  });
}

/** A game in `start` (alpha by default) with the Zap disk found. */
function gameWith(options = {}, start = 'alpha') {
  return new Game(loadGameData(files(options)), { start, progress: new Progress([saveBit('spells', 0)]) });
}

/** Run the game for `ticks` ticks with `inp`; returns every event. */
function run(game, inp, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(inp));
  return events;
}

const lockOf = (game) => game.locks[0];

test('a Zap switches a target on, the next one off again; it stops the bolt and cannot be pushed', () => {
  const game = gameWith({ objects: [{ id: 't', type: 'target', at: [3, 0, 3] }] });
  const [target] = game.switches;
  game.player.place([0.5, 0, 3.5]);
  game.player.targetFacing = Math.PI / 2; // aiming along +x
  const first = [...game.update(cast), ...run(game, idle, 30)];
  assert.ok(first.some((e) => e.type === 'switch' && e.object === target));
  assert.equal(target.on, true);
  assert.equal(game.bolts.length, 0, 'the bolt stopped at it');
  game.update(cast);
  run(game, idle, 30);
  assert.equal(target.on, false);

  run(game, hold('down'), 60); // walk into it along +x
  assert.deepEqual(target.pos, [3, 0, 3]);
  assert.ok(game.player.pos[0] < 3, 'it blocks him like a crate');
});

test('a plate is on while a crate, an enemy or the wizard stands on it, not while he jumps over it', () => {
  const plate = { id: 'p', type: 'plate', at: [5, 0, 5] };
  const withCrate = gameWith({ objects: [plate, { id: 'c', type: 'crate', at: [5, 0, 5] }] });
  withCrate.update(idle);
  assert.equal(withCrate.switches[0].on, true);

  const withBug = gameWith({ objects: [plate], enemies: [{ id: 'b', template: 'bug', at: [5, 0, 5], overrides: { movement: 'stationary', hostility: 'peaceful' } }] });
  withBug.update(idle);
  assert.equal(withBug.switches[0].on, true);

  const game = gameWith({ objects: [plate] });
  const [p] = game.switches;
  game.update(idle);
  assert.equal(p.on, false);
  game.player.place([5.5, 0, 5.5]);
  assert.ok(eventTypes(game.update(idle)).includes('switch'));
  assert.equal(p.on, true);
  // Standing on its edge, with his middle off the tile, doesn't count.
  game.player.place([6.1, 0, 5.5]);
  game.update(idle);
  assert.equal(p.on, false);
  game.player.place([5.5, 0, 5.5]);
  game.update(idle);
  game.update({ down: (a) => a === 'jump', pressed: (a) => a === 'jump' });
  run(game, idle, 3);
  assert.equal(p.on, false, 'in the air');
});

test('a locked exit is solid until every switch is on, and closes again when one goes off', () => {
  const game = gameWith({ objects: [{ id: 'p', type: 'plate', at: [2, 0, 2] }, { id: 'q', type: 'plate', at: [5, 0, 5] }, { id: 'c', type: 'crate', at: [5, 0, 5] }] });
  assert.equal(game.grid.isSolid(8, 0, 3), true);
  assert.equal(game.exitOpen(game.room.exits[0]), false);
  game.update(idle);
  assert.equal(game.switchesOn(), 1);
  assert.equal(lockOf(game).open, false);

  game.player.place([2.5, 0, 2.5]);
  const events = game.update(idle);
  assert.ok(events.some((e) => e.type === 'unlock' && e.exit.id === 'east'));
  assert.equal(game.grid.isSolid(8, 0, 3), false);
  assert.equal(game.exitOpen(game.room.exits[0]), true);

  game.player.place([4.5, 0, 2.5]);
  assert.ok(eventTypes(game.update(idle)).includes('lock'));
  assert.equal(game.grid.isSolid(8, 1, 4), true);
});

test('a locked exit never closes on the wizard: it waits while he stands in the opening', () => {
  const game = gameWith({ objects: [{ id: 'p', type: 'plate', at: [2, 0, 2] }] });
  game.player.place([2.5, 0, 2.5]);
  game.update(idle);
  assert.equal(lockOf(game).open, true);
  game.player.place([7.9, 0, 4]); // his body reaches into the opening
  assert.ok(!eventTypes(game.update(idle)).includes('lock'));
  assert.equal(lockOf(game).open, true);
  game.player.place([6, 0, 4]);
  game.update(idle);
  assert.equal(lockOf(game).open, false);
});

test('the locked exit he came in through stays open for him, even after a respawn', () => {
  const game = gameWith({ objects: [{ id: 'p', type: 'plate', at: [2, 0, 2] }] }, 'beta');
  game.player.place([1, 0, 4]);
  let events = [];
  for (let i = 0; i < 120 && !events.includes('room'); i++) events.push(...eventTypes(game.update(hold('up'))));
  assert.equal(game.room.id, 'alpha');
  assert.equal(game.entryExit, 'east');
  assert.equal(lockOf(game).open, true);
  game.enterRoom('alpha', game.room.reset); // what a respawn does
  assert.equal(lockOf(game).open, true);
  // Nothing turns it off: stepping off a plate he never pressed doesn't close it.
  events = run(game, idle, 5);
  assert.ok(!eventTypes(events).includes('lock'));
  // Arriving some other way, it is locked again.
  game.enterRoom('beta');
  game.enterRoom('alpha');
  assert.equal(lockOf(game).open, false);
});

test('switch data: plates lie on the floor and on no hole; a locked exit needs a switch in its room', () => {
  const errorsOf = (options, change = () => {}) => {
    const data = files(options);
    change(data['rooms/alpha.json']);
    return validateData(data);
  };
  assert.deepEqual(errorsOf({ objects: [{ id: 'p', type: 'plate', at: [2, 0, 2] }, { id: 'c', type: 'crate', at: [2, 0, 2] }] }), [], 'a crate may start on a plate');
  const raised = errorsOf({ objects: [{ id: 'p', type: 'plate', at: [2, 1, 2] }] });
  assert.equal(raised.length, 1);
  assert.match(raised[0], /objects\[0\]\.at: a plate lies on the floor/);
  const overHole = errorsOf({ objects: [{ id: 'p', type: 'plate', at: [2, 0, 2] }] }, (room) => (room.holes = [{ at: [2, 2] }]));
  assert.equal(overHole.length, 1);
  assert.match(overHole[0], /tile \[2,2\] is under objects\[0\]/);
  const underBlock = errorsOf({ objects: [{ id: 'p', type: 'plate', at: [2, 0, 2] }] }, (room) => (room.blocks = [{ at: [2, 0, 2] }]));
  assert.equal(underBlock.length, 1);
  assert.match(underBlock[0], /is filled by blocks\[0\]/);
  const noSwitch = errorsOf({});
  assert.equal(noSwitch.length, 1);
  assert.match(noSwitch[0], /exits\[0\]\.locked: a locked exit needs a switch/);
});

test("switch looks: the bull's-eye on every face of a target and on a plate's tile", () => {
  const { outer, inner } = targetMarks();
  assert.equal(outer.length, 24); // 4 sides × 6 faces
  assert.equal(inner.length, 24);
  // Every point lies on the unit cube's surface.
  for (const [a, b] of [...outer, ...inner]) for (const p of [a, b]) assert.ok(p.some((v) => v === 0 || v === 1));
  const plate = plateMarks(0.01);
  assert.equal(plate.tile.length, 4);
  assert.equal(plate.brackets.length, 8);
  assert.deepEqual(plate.inner[0], [[SWITCH_FX.inner, 0.01, SWITCH_FX.inner], [1 - SWITCH_FX.inner, 0.01, SWITCH_FX.inner]]);
});
