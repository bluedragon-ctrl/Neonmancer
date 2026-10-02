import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseEnemy } from '../src/combat.js';
import { Game } from '../src/game.js';
import { BUG, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** Walking along +x (the Down action). */
const walk = { down: (a) => a === 'down', pressed: () => false };

/** A bug that stays in its cell. */
const STILL = { ...BUG, movement: 'stationary' };

/** A 12×4×8 room with a still bug at [6, 0, 3]; the wizard stands at [4.5, 0, 3.5], facing +x. */
function gameWith(props = {}) {
  const rooms = [roomFile('alpha', { size: [12, 4, 8], spawn: [4.5, 0, 3.5], enemies: [{ id: 'b', template: 'still', at: [6, 0, 3] }], ...props })];
  return new Game(gameData({ rooms, enemies: { bug: BUG, still: STILL } }));
}

/** Walk into it for up to `ticks`; the events seen. */
function pushFor(game, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...eventTypes(game.update(walk)));
  return events;
}

test('a frozen enemy can be pushed a cell, and stays frozen', () => {
  const game = gameWith();
  const [bug] = game.enemies;
  pauseEnemy(game, bug, 600);
  const events = pushFor(game, 90);
  assert.ok(events.includes('push'));
  assert.ok(bug.pos[0] > 6, 'it moved away from him');
  assert.ok(bug.frozen, 'still frozen');
});

test('an enemy that is not frozen cannot be pushed', () => {
  const game = gameWith();
  const [bug] = game.enemies;
  assert.equal(bug.push([1, 0], game), false);
  assert.ok(!bug.pushable);
  assert.ok(!pushFor(game, 60).includes('push'));
  assert.deepEqual(bug.pos, [6, 0, 3]);
});

test('a frozen enemy is pushed one cell at a time, and not into a block', () => {
  const game = gameWith({ blocks: [{ at: [7, 0, 3] }] });
  const [bug] = game.enemies;
  pauseEnemy(game, bug, 600);
  assert.equal(bug.push([1, 0], game), false, 'a block is in the way');
  const free = gameWith();
  const [other] = free.enemies;
  pauseEnemy(free, other, 600);
  assert.ok(other.push([1, 0], free));
  assert.equal(other.push([1, 0], free), false, 'one push at a time');
});

test('a frozen enemy is a whole cell: a block to stand on, and to climb a two-block wall from (D155)', () => {
  const game = gameWith({ blocks: [{ at: [1, 0, 1], to: [5, 1, 1] }], spawn: [4.5, 0, 7.5], enemies: [{ id: 'b', template: 'still', at: [3, 0, 3] }] });
  const [bug] = game.enemies;
  assert.ok(Math.abs(bug.box()[0][1] - bug.box()[0][0] - 0.6) < 1e-9, 'a small box while it moves');
  pauseEnemy(game, bug, 6000);
  assert.deepEqual(bug.box(), [[3, 4], [0, 1], [3, 4]]);

  // Push it to the wall (the Right action is −z), stand on it, jump up onto the wall.
  const up = { down: (a) => a === 'right', pressed: () => false };
  game.player.place([3.5, 0, 5.5]);
  for (let i = 0; i < 90; i++) game.update(up);
  assert.equal(bug.pos[2], 2, 'against the wall');
  game.player.place([3.5, 1.2, 2.5]);
  for (let i = 0; i < 20 && !game.player.grounded; i++) game.update(idle);
  assert.equal(game.player.pos[1], 1, 'standing on its top');
  const jump = { down: (a) => a === 'right', pressed: (a) => a === 'jump' };
  game.update(jump);
  let onWall = false;
  for (let i = 0; i < 60; i++) {
    game.update(up);
    if (game.player.grounded && game.player.pos[1] === 2) onWall = true;
  }
  assert.ok(onWall, 'up on the two-block wall');
});
