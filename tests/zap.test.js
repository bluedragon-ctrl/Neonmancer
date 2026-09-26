import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOLT } from '../src/entities/bolt.js';
import { PLAYER } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { ZAP_FX, castFlare, damagedGlitch, enemyHitLook, sparkPixels, trailPoints } from '../src/render/zap-fx.js';
import { SPELLS, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** Fake input pressing cast this tick. */
const cast = { down: (a) => a === 'cast', pressed: (a) => a === 'cast' };

/**
 * A game in one 8×4×8 room with the given enemies, objects and blocks; the
 * wizard stands at [0.5, 0, 3.5] aiming along +x.
 */
function gameWith({ enemies = [], objects = [], blocks = [] } = {}) {
  const game = new Game(gameData({ rooms: [roomFile('alpha', { enemies, objects, blocks })] }));
  game.player.place([0.5, 0, 3.5]);
  game.player.targetFacing = Math.PI / 2;
  return game;
}

/** Run the game for `ticks` ticks with `inp`; returns every event. */
function run(game, inp, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(inp));
  return events;
}

/** A bug staying in its cell, with more `overrides` of its type. */
const sitter = (at, id = 'b', overrides = {}) => ({ id, type: 'bug', at, overrides: { movement: 'stationary', ...overrides } });

test('casting Zap spends energy and sends a bolt from his hands the way he aims', () => {
  const game = gameWith();
  const events = game.update(cast);
  assert.ok(eventTypes(events).includes('cast'));
  assert.equal(game.bolts.length, 1);
  const [bolt] = game.bolts;
  assert.deepEqual(bolt.dir.map((d) => Math.round(d * 1e9) / 1e9), [1, 0]);
  assert.ok(Math.abs(bolt.pos[1] - BOLT.height) < 1e-9);
  // Cast, then one tick of flight.
  assert.ok(Math.abs(bolt.pos[0] - (0.5 + BOLT.reach + SPELLS.zap.speed / 60)) < 1e-9);
  assert.ok(Math.abs(game.player.energy - (PLAYER.maxEnergy - SPELLS.zap.cost)) < 0.1);
});

test('no second cast while cooling down; without enough energy the cast is denied', () => {
  const game = gameWith();
  game.update(cast);
  assert.ok(!eventTypes(game.update(cast)).includes('cast'), 'cooling down');
  run(game, idle, 15);
  assert.ok(eventTypes(game.update(cast)).includes('cast'), 'cooled down after 0.25 s');

  game.player.energy = SPELLS.zap.cost - 0.5;
  run(game, idle, 15);
  const events = game.update(cast);
  assert.ok(eventTypes(events).includes('deny'));
  assert.ok(!eventTypes(events).includes('cast'));
});

test('energy recharges at energyRecharge per second up to the maximum; respawning refills it', () => {
  const game = gameWith();
  game.player.energy = 0;
  run(game, idle, 60);
  assert.ok(Math.abs(game.player.energy - PLAYER.energyRecharge) < 1e-6);
  run(game, idle, 60 * PLAYER.maxEnergy);
  assert.equal(game.player.energy, PLAYER.maxEnergy);

  game.player.energy = 0;
  game.player.die('void');
  run(game, idle, PLAYER.deathTicks);
  assert.equal(game.player.energy, PLAYER.maxEnergy);
});

test('a bolt stops at a block, reported with a zap event, and is gone', () => {
  const game = gameWith({ blocks: [{ at: [4, 0, 3] }] });
  game.update(cast);
  const events = run(game, idle, 30);
  const zap = events.find((e) => e.type === 'zap');
  assert.ok(zap, 'stopped');
  assert.ok(zap.bolt.pos[0] + BOLT.size / 2 > 4 && zap.bolt.pos[0] < 4.2, 'at the block face');
  assert.equal(game.bolts.length, 0);
});

test('a bolt stops at a crate and at the side of the room', () => {
  const game = gameWith({ objects: [{ id: 'c', type: 'crate', at: [3, 0, 3] }] });
  game.update(cast);
  const zap = run(game, idle, 30).find((e) => e.type === 'zap');
  assert.ok(zap.bolt.pos[0] < 3.2);

  const open = gameWith();
  open.update(cast);
  const edge = run(open, idle, 60).find((e) => e.type === 'zap');
  assert.ok(edge && edge.bolt.pos[0] <= 8.1, 'stopped at the room side');
});

test('a bolt cast into a wall right in front of him stops at once', () => {
  const game = gameWith({ blocks: [{ at: [1, 0, 3] }] });
  game.player.place([0.7, 0, 3.5]);
  game.player.targetFacing = Math.PI / 2;
  assert.ok(eventTypes(game.update(cast)).includes('zap'));
  assert.equal(game.bolts.length, 0);
});

test('a bug takes two hits: the first hurts it, the second pops it', () => {
  const game = gameWith({ enemies: [sitter([4, 0, 3])] });
  const [bug] = game.enemies;
  assert.equal(bug.integrity, 2);
  game.update(cast);
  let events = run(game, idle, 30);
  assert.deepEqual(eventTypes(events).filter((t) => t === 'hit' || t === 'pop'), ['hit']);
  assert.equal(bug.integrity, 1);
  assert.ok(bug.alive && bug.damaged);
  assert.ok(bug.hitTicks > 0, 'the view can time its flash');

  game.update(cast);
  events = run(game, idle, 30);
  assert.ok(eventTypes(events).includes('pop'));
  assert.ok(!bug.alive);
  assert.equal(bug.deathCause, 'zap');
  assert.ok(!game.liveEnemies.includes(bug));
});

test('the integrity of an enemy follows its overrides; a bolt only hits the first enemy in its way', () => {
  const game = gameWith({ enemies: [sitter([3, 0, 3], 'front', { integrity: 3 }), sitter([5, 0, 3], 'back')] });
  const [front, back] = game.enemies;
  for (let i = 0; i < 3; i++) {
    game.update(cast);
    run(game, idle, 30);
  }
  assert.ok(!front.alive);
  assert.equal(back.integrity, 2);
});

test('a hit provokes a provoked enemy (it turns hostile); peaceful ones take damage but stay peaceful', () => {
  const game = gameWith({ enemies: [sitter([3, 0, 3], 'p', { hostility: 'provoked' })] });
  const [enemy] = game.enemies;
  assert.ok(!enemy.hostile);
  game.update(cast);
  run(game, idle, 30);
  assert.ok(enemy.hostile);

  const calm = gameWith({ enemies: [sitter([3, 0, 3], 'q', { hostility: 'peaceful' })] });
  calm.update(cast);
  run(calm, idle, 30);
  assert.equal(calm.enemies[0].integrity, 1);
  assert.ok(!calm.enemies[0].hostile);
});

test('bolts fly over a bug when he stands a block higher', () => {
  const game = gameWith({ enemies: [sitter([4, 0, 3])], blocks: [{ at: [0, 0, 3] }] });
  game.player.place([0.5, 1, 3.5]);
  game.player.targetFacing = Math.PI / 2;
  game.update(cast);
  const events = run(game, idle, 60);
  assert.ok(!eventTypes(events).includes('hit'));
});

test('bolts are gone when the room resets', () => {
  const game = gameWith();
  game.update(cast);
  game.enterRoom('alpha');
  assert.equal(game.bolts.length, 0);
});

test('zap look: the trail runs back from the core to its tail, both ends on the flight line', () => {
  for (let v = 0; v < ZAP_FX.trail.variants; v++) {
    const points = trailPoints(v);
    // == 0: the zero may be negative.
    assert.ok(points[0].every((c) => c == 0));
    assert.ok(points.at(-1)[0] == 0 && points.at(-1)[1] == 0);
    assert.equal(points.at(-1)[2], -ZAP_FX.trail.length);
  }
});

test('zap look: the cast flare and the sparks end; a hit flashes white, then cyan, then nothing', () => {
  assert.ok(castFlare(0) > 0);
  assert.equal(castFlare(ZAP_FX.cast.ticks), 0);
  assert.equal(sparkPixels(0).length, ZAP_FX.sparks.pixels);
  assert.deepEqual(sparkPixels(ZAP_FX.sparks.ticks), []);
  assert.deepEqual(enemyHitLook(null), { flash: 0, color: 'white', squash: 0 });
  assert.equal(enemyHitLook(0).flash, 1);
  assert.equal(enemyHitLook(ZAP_FX.hit.hotTicks).color, 'cyan');
  assert.equal(enemyHitLook(ZAP_FX.hit.flashTicks).flash, 0);
});

test('zap look: a damaged enemy glitches for a few ticks in every round', () => {
  const { every, ticks } = ZAP_FX.glitch;
  const glitching = Array.from({ length: every }, (_, t) => damagedGlitch(t, 3).flash > 0).filter(Boolean);
  assert.equal(glitching.length, ticks);
});
