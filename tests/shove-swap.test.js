import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseEnemy } from '../src/combat.js';
import { Game } from '../src/game.js';
import { PLAYER } from '../src/entities/player.js';
import { shoveTarget } from '../src/entities/pull.js';
import { swapTarget } from '../src/entities/swap.js';
import { pullPixels } from '../src/render/pull-fx.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { BUG, CRATE, SPELLS, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** Fake input pressing one action this tick. */
const press = (action) => ({ down: (a) => a === action, pressed: (a) => a === action });

/** A bug that stays in its cell. */
const STILL = { ...BUG, movement: 'stationary' };

/**
 * A game in a 12×4×8 room with `props`; the wizard knows Pause, Shove and
 * Swap, has `spell` selected, stands at `pos` and aims along +x.
 */
function gameWith(spell, props = {}, pos = [1.5, 0, 3.5]) {
  const rooms = [roomFile('alpha', { size: [12, 4, 8], spawn: [0.5, 0, 7.5], ...props })];
  const game = new Game(gameData({ rooms, objects: { crate: CRATE }, enemies: { bug: BUG, still: STILL } }), {
    progress: new Progress([3, 11, 12].map((slot) => saveBit('spells', slot))),
  });
  game.player.spell = spell;
  game.player.place(pos);
  game.player.facing = game.player.targetFacing = Math.PI / 2;
  return game;
}

/** Cast the selected spell after the cooldown of the last one; returns this tick's events. */
function cast(game) {
  for (let i = 0; i < 20; i++) game.update(idle);
  return game.update(press('cast'));
}

/** Run `ticks` ticks without input; returns their events. */
function run(game, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(idle));
  return events;
}

const crate = (at, id = 'box', type = 'crate') => ({ id, type, at });
/** A wall of `type` blocks across the room at x, the full height. */
const wall = (x, type) => ({ type, at: [x, 0, 0], to: [x, 3, 7] });

// Shove (D261)

test('Shove slides the first crate in line one cell away from him for 15 energy', () => {
  const game = gameWith('shove', { objects: [crate([5, 0, 3])] });
  const [box] = game.objects;
  const events = cast(game);
  assert.deepEqual(eventTypes(events), ['shove', 'cast']);
  assert.equal(events[0].object, box);
  assert.deepEqual(events[0].cell, [5, 0, 3]);
  assert.equal(game.player.energy, PLAYER.maxEnergy - SPELLS.shove.cost);
  assert.equal(game.player.shove.target, box);
  run(game, 30);
  assert.deepEqual(box.pos, [6, 0, 3]);
  assert.equal(box.state, 'rest');
  assert.equal(game.player.shove, null, 'the beam is over');
});

test('Shove takes a crate right in front of him too, and reaches through a fence but not a wall', () => {
  const near = gameWith('shove', { objects: [crate([2, 0, 3])] });
  assert.deepEqual(eventTypes(cast(near)), ['shove', 'cast']);
  run(near, 30);
  assert.deepEqual(near.objects[0].pos, [3, 0, 3]);

  const fenced = gameWith('shove', { blocks: [wall(4, 'fence')], objects: [crate([6, 0, 3])] });
  assert.equal(shoveTarget(fenced, SPELLS.shove.range).object, fenced.objects[0]);
  assert.deepEqual(eventTypes(cast(fenced)), ['shove', 'cast']);
  run(fenced, 30);
  assert.deepEqual(fenced.objects[0].pos, [7, 0, 3]);

  const walled = gameWith('shove', { blocks: [wall(4, 'block')], objects: [crate([6, 0, 3])] });
  assert.equal(shoveTarget(walled, SPELLS.shove.range), null);
});

test('nothing to shove fizzles and costs nothing: against the side, loaded, out of range, nothing beyond free', () => {
  const cases = [
    { objects: [crate([11, 0, 3])] },
    { objects: [crate([5, 0, 3]), crate([5, 1, 3], 'top')] },
    { objects: [crate([2 + SPELLS.shove.range, 0, 3])] },
    { objects: [crate([5, 0, 3]), crate([6, 0, 3], 'next')] },
    { objects: [crate([5, 0, 3])], blocks: [{ at: [6, 0, 3] }] },
  ];
  for (const props of cases) {
    const game = gameWith('shove', props);
    assert.deepEqual(eventTypes(cast(game)), ['fizzle'], JSON.stringify(props));
    assert.equal(game.player.energy, PLAYER.maxEnergy);
  }
});

test('a crate shoved over a hole plugs it', () => {
  const game = gameWith('shove', { holes: [{ at: [6, 3] }], objects: [crate([5, 0, 3])] });
  cast(game);
  assert.ok(eventTypes(run(game, 40)).includes('plug'));
  assert.equal(game.objects[0].state, 'plugged');
});

test('Shove drives an enemy a cell away, over a hole it pops, and he gets the blame (D81)', () => {
  const game = gameWith('shove', { holes: [{ at: [6, 3] }], enemies: [{ id: 'b', template: 'still', at: [5, 0, 3] }] });
  const [bug] = game.enemies;
  assert.deepEqual(eventTypes(cast(game)), ['alert', 'shove', 'cast']);
  assert.ok(eventTypes(run(game, 60)).includes('pop'));
  assert.equal(bug.deathCause, 'hole');
});

test('the shove beam runs out of his hands and grows into the target', () => {
  const target = [4.5, 0.5, 3.5];
  const hands = [1.8, 0.7, 3.5];
  const first = pullPixels(0, target, hands, true).filter((p) => p.scale > 0);
  assert.equal(first.length, 8, 'one ring at the start');
  const middle = first.reduce((sum, p) => sum.map((v, i) => v + p.offset[i] / 8), [0, 0, 0]);
  assert.ok(middle.every((v, i) => Math.abs(v - hands[i]) < 1e-9), 'round his hands');
  const spread = (list) => Math.max(...list.map((p) => p.offset[1])) - Math.min(...list.map((p) => p.offset[1]));
  const late = pullPixels(10, target, hands, true).filter((p) => p.scale > 0 && p.offset[0] > 3.5);
  assert.ok(late.length > 0 && spread(late) > spread(first), 'bigger near the target');
});

// Swap (D261)

test('Swap: he and the first crate in line trade places for 25 energy', () => {
  const game = gameWith('swap', { objects: [crate([5, 0, 3])] });
  const [box] = game.objects;
  const events = cast(game);
  assert.deepEqual(eventTypes(events), ['swap', 'cast']);
  assert.equal(events[0].object, box);
  assert.deepEqual([events[0].cell, events[0].to], [[5, 0, 3], [1, 0, 3]]);
  assert.equal(game.player.energy, PLAYER.maxEnergy - SPELLS.swap.cost);
  assert.deepEqual(game.player.pos, [5.5, 0, 3.5]);
  assert.deepEqual(box.pos, [1, 0, 3]);
  assert.equal(game.player.warp.spell, 'swap', 'his afterimage');
  assert.deepEqual(game.player.swap.from, [5, 0, 3]);
  run(game, 40);
  assert.deepEqual(box.pos, [1, 0, 3], 'it rests where he stood');
  assert.equal(game.player.swap, null);
});

test('Swap crosses a crate stream: he gets past his own barrier (D198)', () => {
  const game = gameWith('swap', { blocks: [wall(4, 'stream')], objects: [crate([6, 0, 3])] });
  assert.deepEqual(eventTypes(cast(game)), ['swap', 'cast']);
  assert.deepEqual(game.player.pos, [6.5, 0, 3.5]);
  assert.deepEqual(game.objects[0].pos, [1, 0, 3]);
});

test('Swap takes a frozen enemy, which stays frozen; an active one fizzles', () => {
  const game = gameWith('swap', { enemies: [{ id: 'b', template: 'still', at: [5, 0, 3] }] });
  const [bug] = game.enemies;
  assert.deepEqual(eventTypes(cast(game)), ['fizzle'], 'not frozen');
  pauseEnemy(game, bug, 300);
  assert.deepEqual(eventTypes(cast(game)), ['swap', 'cast']);
  assert.deepEqual(bug.pos, [1, 0, 3]);
  assert.deepEqual(game.player.pos, [5.5, 0, 3.5]);
  run(game, 10);
  assert.ok(bug.frozen);
  assert.deepEqual(bug.pos, [1, 0, 3]);
});

test('nothing to swap fizzles and costs nothing: loaded, no headroom, a pickup or a block in his cell', () => {
  const cases = [
    { objects: [crate([5, 0, 3]), crate([5, 1, 3], 'top')] },
    { objects: [crate([5, 0, 3])], blocks: [{ at: [5, 1, 3] }] },
    { objects: [crate([5, 0, 3])], pickups: [{ id: 'p', type: 'refill_energy', at: [1, 0, 3] }] },
    { objects: [crate([2 + SPELLS.swap.range, 0, 3])] },
    { blocks: [{ at: [3, 0, 3] }], objects: [crate([5, 0, 3])] },
  ];
  for (const props of cases) {
    const game = gameWith('swap', props);
    assert.deepEqual(eventTypes(cast(game)), ['fizzle'], JSON.stringify(props));
    assert.equal(game.player.energy, PLAYER.maxEnergy);
    assert.deepEqual(game.objects[0]?.pos ?? null, props.objects?.[0]?.at ?? null);
  }
});

test('Swap never casts from the air', () => {
  const game = gameWith('swap', { objects: [crate([5, 0, 3])] });
  for (let i = 0; i < 20; i++) game.update(idle);
  game.player.place([1.5, 2, 3.5]);
  game.player.grounded = false;
  assert.equal(swapTarget(game, SPELLS.swap.range), null);
});

test('Swap runs at his feet: a crate below him is out of line, one level with him on a ledge swaps', () => {
  // He stands on a 1-high ledge at x = 1, the crate on the floor beyond: not in line (his feet are higher).
  const ledge = gameWith('swap', { blocks: [{ at: [1, 0, 3] }], objects: [crate([5, 0, 3])] }, [1.5, 1, 3.5]);
  assert.equal(swapTarget(ledge, SPELLS.swap.range), null, 'the line runs at his feet');
  // A crate on a ledge level with him swaps; it lands in his cell on the ledge.
  const level = gameWith('swap', { blocks: [{ at: [1, 0, 3] }, { at: [5, 0, 3] }], objects: [crate([5, 1, 3])] }, [1.5, 1, 3.5]);
  assert.deepEqual(eventTypes(cast(level)), ['swap', 'cast']);
  assert.deepEqual(level.objects[0].pos, [1, 1, 3]);
  assert.deepEqual(level.player.pos, [5.5, 1, 3.5]);
});
