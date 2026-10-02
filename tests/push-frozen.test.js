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
