import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Patrol } from '../src/ai/patrol.js';
import { ENEMY } from '../src/entities/enemy.js';
import { Game } from '../src/game.js';
import { BUG as BUG_LOOK, bugPose, popPixels } from '../src/render/bug.js';
import { BOUNCE_SPEED, PLAYER } from '../src/entities/player.js';
import { CRATE, LIFT, eventTypes, gameData, hold, idle, roomFile } from './helpers.js';

/** Ticks a bug takes for one cell at 3 units per second. */
const CELL_TICKS = 20;

/**
 * A game in one 8×4×8 room with the given enemies, objects, blocks and
 * holes; the wizard is put at `pos` (a far corner by default).
 */
function gameWith({ enemies, objects = [], blocks = [], holes = [], pos = [0.5, 0, 7.5] }) {
  const game = new Game(
    gameData({
      rooms: [roomFile('alpha', { enemies, objects, blocks, holes, spawn: [0.5, 0, 7.5] })],
      objects: { crate: CRATE, lift: LIFT },
    }),
  );
  game.player.place(pos);
  return game;
}

/** Run the game for `ticks` ticks with `inp`; returns every event. */
function run(game, inp, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(inp));
  return events;
}

/** A bug patrolling from `at` to `to` (ping-pong, no pause). */
const bug = (at, to, id = 'b') => ({ id, type: 'bug', at, path: { points: [to] } });

/** A bug staying in its cell, with more `overrides` of its type. */
const sitter = (at, id = 'b', overrides = {}) => ({ id, type: 'bug', at, overrides: { movement: 'stationary', ...overrides } });

/** Cells a patrol walks from [x, z] in `steps` calls (none while pausing). */
function walk(patrol, [x, z], steps) {
  const cells = [];
  for (let i = 0; i < steps; i++) {
    const step = patrol.next(x, z);
    if (!step) continue;
    x += step[0];
    z += step[1];
    cells.push([x, z]);
  }
  return cells;
}

test('patrol: ping-pong walks there and back, cell by cell', () => {
  const patrol = new Patrol([1, 0, 1], { points: [[3, 0, 1], [3, 0, 2]] });
  assert.deepEqual(walk(patrol, [1, 1], 6), [[2, 1], [3, 1], [3, 2], [3, 1], [2, 1], [1, 1]]);
});

test('patrol: a loop runs on from the last point back to the start', () => {
  const patrol = new Patrol([0, 0, 0], { points: [[1, 0, 0], [1, 0, 1], [0, 0, 1]], mode: 'loop' });
  assert.deepEqual(walk(patrol, [0, 0], 5), [[1, 0], [1, 1], [0, 1], [0, 0], [1, 0]]);
});

test('patrol: it pauses at the ends, not in between', () => {
  const patrol = new Patrol([0, 0, 0], { points: [[2, 0, 0]], pause: 0.1 }); // 6 ticks
  assert.deepEqual(patrol.next(0, 0), [1, 0]);
  assert.deepEqual(patrol.next(1, 0), [1, 0]);
  const waits = [];
  for (let i = 0; i < 6; i++) waits.push(patrol.next(2, 0));
  assert.deepEqual(waits, Array(6).fill(null));
  assert.deepEqual(patrol.next(2, 0), [-1, 0]);
});

test('patrol: turning back heads for the waypoint it came from, then carries on', () => {
  const patrol = new Patrol([0, 0, 0], { points: [[3, 0, 0], [3, 0, 3]] });
  assert.deepEqual(patrol.next(1, 0), [1, 0]);
  patrol.turnBack();
  assert.deepEqual(walk(patrol, [1, 0], 5), [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]]);
});

test('patrol: without a path it stays put', () => {
  assert.equal(new Patrol([2, 0, 2]).next(2, 2), null);
});

test('a bug walks its path one cell at a time, resting on whole cells', () => {
  const game = gameWith({ enemies: [bug([1, 0, 1], [4, 0, 1])] });
  const [enemy] = game.enemies;
  run(game, idle, CELL_TICKS);
  assert.deepEqual(enemy.pos, [2, 0, 1]);
  run(game, idle, 2 * CELL_TICKS);
  assert.deepEqual(enemy.pos, [4, 0, 1]);
  assert.ok(Math.abs(enemy.facing - Math.PI / 2) < 1e-9, 'faces +x');
  run(game, idle, 3 * CELL_TICKS);
  assert.deepEqual(enemy.pos, [1, 0, 1]); // and back
});

test('touching a bug hurts the wizard, who walks right through it', () => {
  const game = gameWith({ enemies: [sitter([3, 0, 3], 'b')], pos: [1.5, 0, 3.5] });
  // Down = +x: walk into the bug's cell and on.
  const events = run(game, hold('down'), 40);
  const hurt = events.find((event) => event.type === 'hurt');
  assert.ok(hurt, 'hurt');
  assert.equal(hurt.enemy, game.enemies[0]);
  assert.equal(game.player.integrity, game.player.maxIntegrity - 1);
  assert.ok(game.player.pos[0] > 3.8, `walked through: ${game.player.pos}`);
});

test('peaceful and not yet provoked bugs never hurt; a provoked one does', () => {
  const game = gameWith({
    enemies: [sitter([1, 0, 3], 'calm', { hostility: 'peaceful' }), sitter([3, 0, 3], 'touchy', { hostility: 'provoked' })],
    pos: [1.5, 0, 3.5],
  });
  const [calm, touchy] = game.enemies;
  assert.equal(calm.hostile, false);
  assert.ok(!eventTypes(run(game, hold('down'), 30)).includes('hurt'), 'walked through both');
  touchy.provoke();
  assert.equal(touchy.hostile, true);
  game.player.place([3.5, 0, 3.5]);
  assert.ok(eventTypes(run(game, idle, 1)).includes('hurt'));
});

test('a bug without a contact attack never hurts', () => {
  const game = gameWith({ enemies: [sitter([1, 0, 3], 'b', { attack: 'none' })], pos: [1.5, 0, 3.5] });
  assert.ok(!eventTypes(run(game, idle, 5)).includes('hurt'));
});

test('landing on a bug bounces the wizard up, clearing 2 blocks, without hurting him', () => {
  const game = gameWith({ enemies: [sitter([3, 0, 3])], pos: [3.5, 2, 3.5] });
  const events = run(game, idle, 30);
  const bounce = events.find((e) => e.type === 'bounce');
  assert.equal(bounce?.enemy, game.enemies[0]);
  assert.ok(!eventTypes(events).includes('hurt'));
  let top = 0;
  for (let i = 0; i < 60; i++) {
    game.update(idle);
    top = Math.max(top, game.player.pos[1]);
  }
  const bugTop = ENEMY.size[1];
  assert.ok(top > bugTop + 2 && top <= bugTop + PLAYER.bounceHeight + 0.05, `apex ${top}`);
  assert.ok(BOUNCE_SPEED > 0);
});

test('a hostile bug still hurts from the side; one without bounce hurts from the top', () => {
  const side = gameWith({ enemies: [sitter([3, 0, 3])], pos: [2.2, 0, 3.5] });
  assert.ok(eventTypes(run(side, hold('down'), 20)).includes('hurt'));
  const top = gameWith({ enemies: [sitter([3, 0, 3], 'b', { bounce: false })], pos: [3.5, 2, 3.5] });
  const events = run(top, idle, 30);
  assert.ok(!eventTypes(events).includes('bounce'));
  assert.ok(eventTypes(events).includes('hurt'));
});

test('a debug-invincible wizard is not hurt by bugs', () => {
  const game = gameWith({ enemies: [sitter([1, 0, 3], 'b')], pos: [1.5, 0, 3.5] });
  game.invincible = true;
  assert.ok(!eventTypes(run(game, idle, 5)).includes('hurt'));
});

test('a crate in its way turns a bug back, after a short wait', () => {
  const game = gameWith({ enemies: [bug([1, 0, 1], [5, 0, 1])], objects: [{ id: 'c', type: 'crate', at: [3, 0, 1] }] });
  const [enemy] = game.enemies;
  run(game, idle, CELL_TICKS);
  assert.deepEqual(enemy.pos, [2, 0, 1]);
  // One tick to find the crate in the way, the wait, then a cell back.
  run(game, idle, 1 + ENEMY.turnTicks + CELL_TICKS);
  assert.deepEqual(enemy.pos, [1, 0, 1]);
  run(game, idle, CELL_TICKS);
  assert.deepEqual(enemy.pos, [2, 0, 1]); // and on again, up to the crate
});

test('another bug blocks a bug', () => {
  const game = gameWith({ enemies: [sitter([3, 0, 4], 'still'), bug([1, 0, 4], [5, 0, 4], 'walker')] });
  const [still, walker] = game.enemies;
  for (let i = 0; i < 120; i++) {
    game.update(idle);
    assert.ok(walker.pos[0] <= 2 + 0.2, `stopped before the other bug: ${walker.pos}`);
  }
  assert.deepEqual(still.pos, [3, 0, 4]);
});

test('a crate cannot be pushed into a bug; a crate rests on one', () => {
  const game = gameWith({
    enemies: [sitter([3, 0, 3], 'b'), sitter([5, 0, 5], 'under')],
    objects: [
      { id: 'c', type: 'crate', at: [2, 0, 3] },
      { id: 'top', type: 'crate', at: [5, 2, 5] },
    ],
    pos: [1.5, 0, 3.5],
  });
  run(game, hold('down'), 60);
  assert.deepEqual(game.objects[0].pos, [2, 0, 3]);
  assert.equal(game.objects[1].pos[1], ENEMY.size[1]); // fell onto the bug
});

test('a bug walks off a ledge, falls, and keeps to its path below; it cannot climb back', () => {
  const game = gameWith({ enemies: [bug([4, 1, 1], [1, 1, 1])], blocks: [{ at: [3, 0, 1], to: [5, 0, 1] }] });
  const [enemy] = game.enemies;
  // Two cells, the second one off the ledge, then a fall of 1.
  let ticks = 0;
  while (!game.update(idle).some((e) => e.type === 'land' && e.enemy)) assert.ok(++ticks < 100, 'lands');
  assert.deepEqual(enemy.pos, [2, 0, 1], 'fell off');
  for (let i = 0; i < 8 * CELL_TICKS; i++) {
    game.update(idle);
    assert.ok(enemy.pos[0] <= 2 + 0.2 && enemy.pos[1] === 0, `stays below: ${enemy.pos}`);
  }
});

test('a bug falling into a hole pops and is gone until the room resets', () => {
  const game = gameWith({ enemies: [bug([1, 0, 1], [4, 0, 1])], holes: [{ at: [2, 1] }] });
  const [enemy] = game.enemies;
  const events = run(game, idle, CELL_TICKS + 30);
  assert.equal(enemy.state, 'dead');
  assert.equal(enemy.deathCause, 'hole');
  assert.deepEqual(events.filter((e) => e.type === 'pop').map((e) => e.enemy), [enemy]);
  assert.ok(!game.liveEnemies.includes(enemy));
  assert.equal(game.grid.isHole(2.5, 1.5), true); // it doesn't plug the hole
  game.enterRoom('alpha');
  assert.equal(game.enemies[0].state, 'rest');
});

test('a bug stepping onto a void block pops; hazard blocks do not hurt it', () => {
  const game = gameWith({
    enemies: [bug([1, 1, 1], [3, 1, 1], 'a'), bug([1, 1, 4], [3, 1, 4], 'b')],
    blocks: [
      { at: [1, 0, 1] },
      { at: [2, 0, 1], type: 'void' },
      { at: [3, 0, 1] },
      { at: [1, 0, 4], to: [3, 0, 4], type: 'hazard' },
    ],
  });
  const [voidBug, hazardBug] = game.enemies;
  run(game, idle, CELL_TICKS);
  assert.equal(voidBug.deathCause, 'void');
  run(game, idle, 3 * CELL_TICKS);
  assert.equal(hazardBug.alive, true);
});

test('a platform carries a bug standing on it', () => {
  const game = gameWith({
    enemies: [sitter([1, 1, 1], 'b')],
    objects: [{ id: 'p', type: 'lift', at: [1, 0, 1], path: { points: [[4, 0, 1]], pause: 1 } }],
  });
  run(game, idle, 90);
  assert.deepEqual(game.enemies[0].pos, [4, 1, 1]);
});

test('a platform waits while a bug steps on or off it', () => {
  const game = gameWith({
    enemies: [sitter([2, 1, 1], 'b')],
    objects: [
      { id: 'ledge', type: 'crate', at: [1, 0, 1] },
      { id: 'p', type: 'lift', at: [2, 0, 1], path: { points: [[5, 0, 1]] } },
    ],
  });
  // The bug is stepping off the platform onto the crate.
  Object.assign(game.enemies[0], { state: 'walk', from: [2, 1, 1], target: [1, 1, 1] });
  // Its box (0.6 wide) leaves the platform's top after 0.8 of the step.
  run(game, idle, 15);
  assert.deepEqual(game.objects[1].pos, [2, 0, 1]);
  run(game, idle, 10);
  assert.ok(game.objects[1].pos[0] > 2, 'moves on once the bug is off');
  assert.deepEqual(game.enemies[0].pos, [1, 1, 1]);
});

test('a bug in its way makes a platform wait', () => {
  const game = gameWith({
    enemies: [sitter([3, 0, 1], 'b')],
    objects: [{ id: 'p', type: 'lift', at: [1, 0, 1], path: { points: [[5, 0, 1]] } }],
  });
  run(game, idle, 120);
  assert.ok(game.objects[0].pos[0] <= 2.2 + 1e-9, `platform at ${game.objects[0].pos}`);
});

test('bugs reset with the room', () => {
  const game = gameWith({ enemies: [bug([1, 0, 1], [4, 0, 1])] });
  run(game, idle, 50);
  game.enterRoom('alpha');
  assert.deepEqual(game.enemies[0].pos, [1, 0, 1]);
});

test('look: a hop lifts the bug in the air and squashes it on landing', () => {
  const up = bugPose(BUG_LOOK.hop.air / 2);
  assert.ok(Math.abs(up.lift - BUG_LOOK.hop.height) < 1e-9);
  assert.ok(up.scale[1] > 1);
  const land = bugPose((BUG_LOOK.hop.air + 1) / 2);
  assert.equal(land.lift, 0);
  assert.ok(land.scale[1] < 1 && land.scale[0] > 1);
  assert.deepEqual(bugPose(0), { lift: 0, scale: [1, 1, 1] });
  assert.ok(bugPose(BUG_LOOK.hop.air / 2, 0.5).lift < up.lift);
});

test('look: a pop bursts out from the ball and is over after its time', () => {
  const start = popPixels(0);
  assert.equal(start.length, BUG_LOOK.pop.pixels);
  assert.ok(start.every(({ scale }) => scale === 1));
  assert.ok(popPixels(BUG_LOOK.pop.ticks - 1).every(({ scale }) => scale < 0.1));
  assert.deepEqual(popPixels(BUG_LOOK.pop.ticks), []);
});
