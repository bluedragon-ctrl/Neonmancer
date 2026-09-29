import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chase, towards } from '../src/ai/chase.js';
import { castRay, cellsAlong, lineOfSight, reach } from '../src/ai/sight.js';
import { validateData } from '../src/data/validate.js';
import { ENEMY } from '../src/entities/enemy.js';
import { Game } from '../src/game.js';
import { BUG, CRATE, SENTINEL, VIRUS, dataFiles, eventTypes, gameData, grid, idle, roomFile } from './helpers.js';

/** Ticks a virus takes for one cell while chasing (3 units per second). */
const CELL_TICKS = 20;
/** Its charge and cooldown in ticks. */
const VIRUS_CHARGE = 24;
const SENTINEL_CHARGE = 42;

const TEMPLATES = { bug: BUG, virus: VIRUS, sentinel: SENTINEL };

/**
 * A game in one 8×4×8 room with the given enemies, objects and blocks; the
 * wizard is put at `pos`.
 */
function gameWith({ enemies, objects = [], blocks = [], holes = [], pos, templates = {} }) {
  const game = new Game(
    gameData({
      rooms: [roomFile('alpha', { enemies, objects, blocks, holes, spawn: [0.5, 0, 7.5] })],
      objects: { crate: CRATE },
      enemies: { bug: BUG, virus: VIRUS, sentinel: SENTINEL, ...templates },
    }),
  );
  game.player.place(pos);
  return game;
}

/** Run the game for `ticks` ticks; returns every event. */
function run(game, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(idle));
  return events;
}

/** Run until an event of `type` happens (at most `limit` ticks); returns the ticks it took. */
function until(game, type, limit = 600) {
  for (let i = 1; i <= limit; i++) if (game.update(idle).some((e) => e.type === type)) return i;
  assert.fail(`no "${type}" within ${limit} ticks`);
}

const virus = (at, id = 'v', overrides) => ({ id, template: 'virus', at, ...(overrides && { overrides }) });

// ---- sight

test('sight: a ray stops in the first solid cell or body; line of sight looks past neither', () => {
  const g = grid({ cells: [[4, 0, 1]] });
  const hit = castRay([1.5, 0.5, 1.5], [1, 0, 0], 6, g);
  assert.equal(hit.blocked, true);
  assert.ok(Math.abs(hit.point[0] - 4) < 0.06, `stops at the block: ${hit.point}`);
  const crate = { box: () => [[2.2, 2.8], [0, 1], [5, 6]] };
  assert.equal(castRay([1.5, 0.5, 5.5], [1, 0, 0], 6, g, [crate]).body, crate);
  assert.equal(castRay([1.5, 0.5, 5.5], [1, 0, 0], 0.5, g, [crate]).body, null, 'out of range');
  assert.equal(lineOfSight([1.5, 0.5, 1.5], [6.5, 0.5, 1.5], g), false);
  assert.equal(lineOfSight([1.5, 0.5, 2.5], [6.5, 0.5, 2.5], g), true);
  assert.equal(lineOfSight([1.5, 0.5, 5.5], [6.5, 0.5, 5.5], g, [crate]), false);
  assert.equal(lineOfSight([1.5, 1.5, 1.5], [6.5, 1.5, 1.5], g), true, 'over the block');
  assert.equal(reach([0, 0, 0], [[1, 2], [0, 1], [0, 1]]), 1);
  assert.equal(reach([1.5, 0.5, 0.5], [[1, 2], [0, 1], [0, 1]]), 0);
});

// ---- chase behavior

test('chase: greedy steps along the farther axis first, then the other', () => {
  assert.deepEqual(towards(1, 1, [5, 3]), [[1, 0], [0, 1]]);
  assert.deepEqual(towards(1, 1, [2, 5]), [[0, 1], [1, 0]]);
  assert.deepEqual(towards(3, 3, [0, 3]), [[-1, 0]]);
  assert.equal(towards(2, 2, [2, 2]), null);
  assert.equal(towards(2, 2, null), null);
});

test('chase: calm → chase → search → return → calm; with a path it patrols again instead', () => {
  const chase = new Chase([1, 0, 1], undefined, { memory: 0.5 });
  const senses = (sees, extra = {}) => ({ sees, lastSeen: [4, 1], inRange: false, ...extra });
  assert.equal(chase.next(1, 1, senses(false)), null, 'calm at its post');
  chase.update(senses(true));
  assert.equal(chase.mode, 'chase');
  assert.equal(chase.chasing, true);
  assert.deepEqual(chase.next(1, 1, senses(true)), [[1, 0]]);
  assert.equal(chase.next(3, 1, senses(true, { inRange: true })), null, 'holds its ground in attack range');
  chase.update(senses(false));
  assert.equal(chase.mode, 'search');
  assert.deepEqual(chase.next(3, 1, senses(false)), [[1, 0]], 'to where it saw him');
  for (let i = 0; i < 30; i++) chase.update(senses(false));
  assert.equal(chase.mode, 'return');
  assert.deepEqual(chase.next(4, 1, senses(false)), [[-1, 0]], 'home');
  assert.equal(chase.next(1, 1, senses(false)), null);
  assert.equal(chase.mode, 'calm');

  const patrolling = new Chase([1, 0, 1], { points: [[4, 0, 1]] }, { memory: 0.1 });
  patrolling.update(senses(true));
  for (let i = 0; i < 10; i++) patrolling.update(senses(false));
  assert.equal(patrolling.mode, 'calm');
  assert.deepEqual(patrolling.next(1, 1, senses(false)), [1, 0], 'patrols');
});

// ---- viruses in the game

test('a virus notices the wizard ("!"), chases him at its chase speed and stops next to him', () => {
  const game = gameWith({ enemies: [virus([1, 0, 1])], pos: [5.5, 0, 1.5] });
  const [enemy] = game.enemies;
  const events = run(game, 1);
  assert.deepEqual(events.filter((e) => e.type === 'alert').map((e) => e.enemy), [enemy]);
  assert.equal(enemy.alerted, true);
  run(game, CELL_TICKS - 1);
  assert.deepEqual(enemy.pos, [2, 0, 1], 'one cell at the chase speed');
  run(game, 3 * CELL_TICKS);
  assert.deepEqual(enemy.pos, [4, 0, 1], 'next to him, within its attack range');
  run(game, 2 * CELL_TICKS);
  assert.deepEqual(enemy.pos, [4, 0, 1], 'it holds there');
});

test('a virus next to the wizard charges, then its burst hurts him; touching it does not', () => {
  const game = gameWith({ enemies: [virus([4, 0, 1])], pos: [4.5, 0, 1.5] });
  const [enemy] = game.enemies;
  const events = run(game, VIRUS_CHARGE);
  assert.ok(eventTypes(events).includes('charge'));
  assert.ok(!eventTypes(events).includes('hurt'), 'no contact damage while it charges, standing in him');
  const fired = run(game, 1);
  assert.deepEqual(eventTypes(fired).filter((t) => t === 'discharge' || t === 'hurt'), ['discharge', 'hurt']);
  assert.equal(game.player.integrity, game.player.maxIntegrity - VIRUS.damage);
  // It cools down (90 ticks) before the next one.
  const after = run(game, ENEMY.dischargeTicks + 80);
  assert.ok(!eventTypes(after).includes('charge'));
  assert.ok(eventTypes(run(game, 20)).includes('charge'));
});

test('a burst hits every enemy around it too, and nothing beyond its range', () => {
  const game = gameWith({
    enemies: [
      virus([2, 0, 2], 'v', { movement: 'stationary' }),
      { id: 'near', template: 'bug', at: [2, 0, 3], overrides: { movement: 'stationary' } },
      { id: 'far', template: 'bug', at: [2, 0, 5], overrides: { movement: 'stationary' } },
    ],
    pos: [3.5, 0, 2.5],
  });
  const [, near, far] = game.enemies;
  run(game, VIRUS_CHARGE + 1);
  assert.equal(game.player.integrity, game.player.maxIntegrity - 1);
  assert.equal(near.integrity, BUG.integrity - 1);
  assert.equal(near.hitTicks !== null, true);
  assert.equal(far.integrity, BUG.integrity);
});

test('a wall hides the wizard: the virus never notices him', () => {
  const game = gameWith({ enemies: [virus([1, 0, 3])], blocks: [{ at: [3, 0, 0], to: [3, 1, 7] }], pos: [5.5, 0, 3.5] });
  const [enemy] = game.enemies;
  const events = run(game, 60);
  assert.ok(!eventTypes(events).includes('alert'));
  assert.deepEqual(enemy.pos, [1, 0, 3]);
});

test('a virus that loses him searches where he was, then goes back to its post', () => {
  const game = gameWith({ enemies: [virus([1, 0, 1])], pos: [4.5, 0, 1.5] });
  const [enemy] = game.enemies;
  run(game, CELL_TICKS);
  assert.equal(enemy.behavior.mode, 'chase');
  game.player.place([7.5, 0, 7.5]); // out of its sight
  run(game, 2);
  assert.equal(enemy.behavior.mode, 'search');
  run(game, 400);
  assert.deepEqual(enemy.pos, [1, 0, 1]);
  assert.equal(enemy.behavior.mode, 'calm');
  assert.equal(enemy.alerted, false);
});

test('a chasing virus never follows the wizard into a hole', () => {
  const game = gameWith({ enemies: [virus([1, 0, 1])], holes: [{ at: [3, 0], to: [3, 7] }], pos: [5.5, 0, 1.5] });
  const [enemy] = game.enemies;
  run(game, 200);
  assert.equal(enemy.alive, true);
  assert.deepEqual(enemy.pos, [2, 0, 1], 'waits at the edge');
});

test('a peaceful virus never chases nor attacks', () => {
  // Peaceful with a burst is a data error (D80: it could never fire), so no attack here.
  const game = gameWith({ enemies: [virus([1, 0, 1], 'v', { hostility: 'peaceful', attack: 'none' })], pos: [2.5, 0, 1.5] });
  const events = run(game, 120);
  assert.deepEqual(eventTypes(events).filter((t) => ['alert', 'charge', 'hurt'].includes(t)), []);
  assert.deepEqual(game.enemies[0].pos, [1, 0, 1]);
});

// ---- sentinels (arc)

test('a sentinel keeps its distance: it comes into range, stops and fires an arc that hurts', () => {
  const game = gameWith({ enemies: [{ id: 's', template: 'sentinel', at: [0, 0, 1] }], pos: [7.5, 0, 1.5] });
  const [enemy] = game.enemies;
  const ticks = until(game, 'charge');
  assert.deepEqual(enemy.pos, [2, 0, 1], 'stopped 5 away');
  assert.ok(ticks > 2 * CELL_TICKS - 5);
  assert.ok(enemy.aim.end[0] > 6, `aims all the way: ${enemy.aim.end}`);
  run(game, SENTINEL_CHARGE);
  assert.equal(game.player.integrity, game.player.maxIntegrity - 1);
  assert.ok(enemy.boltEnd[0] > 7.4, `the bolt runs on through him: ${enemy.boltEnd}`);
});

test('an arc hits everything in the squares along its path, not beside it', () => {
  const game = gameWith({
    enemies: [
      { id: 's', template: 'sentinel', at: [1, 0, 1], overrides: { movement: 'stationary' } },
      { id: 'inline', template: 'bug', at: [3, 0, 1], overrides: { movement: 'stationary' } },
      { id: 'beside', template: 'bug', at: [3, 0, 2], overrides: { movement: 'stationary' } },
    ],
    pos: [5.5, 0, 1.5],
  });
  const [, inline, beside] = game.enemies;
  until(game, 'charge');
  const events = run(game, SENTINEL_CHARGE);
  assert.equal(game.player.integrity, game.player.maxIntegrity - 1, 'through the bug to him');
  assert.equal(inline.integrity, BUG.integrity - 1);
  assert.equal(beside.integrity, BUG.integrity);
  assert.deepEqual(events.filter((e) => e.type === 'hit').map((e) => e.enemy), [inline]);
});

test('sight: the cells along a ray, each once, in order', () => {
  assert.deepEqual(cellsAlong([0.5, 0.5, 0.5], [1, 0, 0], 2.2), [[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  assert.deepEqual(cellsAlong([0.5, 0.5, 0.5], [0, 0, 1], 0), [[0, 0, 0]]);
});

test('an arc flies where he stood when it started charging: stepping aside dodges it', () => {
  const game = gameWith({ enemies: [{ id: 's', template: 'sentinel', at: [1, 0, 1], overrides: { movement: 'stationary' } }], pos: [5.5, 0, 1.5] });
  until(game, 'charge');
  game.player.place([5.5, 0, 3.5]);
  const events = run(game, SENTINEL_CHARGE);
  assert.ok(eventTypes(events).includes('discharge'));
  assert.equal(game.player.integrity, game.player.maxIntegrity);
});

test('a crate in the way hides the wizard from a sentinel, and a crate stops an arc', () => {
  const hidden = gameWith({
    enemies: [{ id: 's', template: 'sentinel', at: [1, 0, 1], overrides: { movement: 'stationary' } }],
    objects: [{ id: 'c', type: 'crate', at: [3, 0, 1] }],
    pos: [5.5, 0, 1.5],
  });
  assert.ok(!eventTypes(run(hidden, 60)).includes('charge'));

  const game = gameWith({ enemies: [{ id: 's', template: 'sentinel', at: [1, 0, 1], overrides: { movement: 'stationary' } }], pos: [5.5, 0, 1.5] });
  until(game, 'charge');
  // The aim is fixed; a crate dropped into its line now takes the bolt.
  game.objects.push(...new Game(gameData({ rooms: [roomFile('b', { objects: [{ id: 'c', type: 'crate', at: [3, 0, 1] }] })] })).objects);
  game.refreshBodies();
  run(game, SENTINEL_CHARGE);
  assert.equal(game.player.integrity, game.player.maxIntegrity);
  assert.ok(game.enemies[0].boltEnd[0] < 3.3, `stopped at the crate: ${game.enemies[0].boltEnd}`);
});

// ---- any enemy (D78)

test('any enemy can have any attack: a bug with a burst hurts from a cell away, not by touch', () => {
  const zapper = { extends: 'bug', movement: 'stationary', attack: 'burst', aggroRange: 3, attackRange: 1.2, attackCharge: 0.2 };
  const game = gameWith({ enemies: [{ id: 'b', template: 'zapper', at: [2, 0, 2] }], pos: [3.5, 0, 2.5], templates: { zapper } });
  const events = run(game, 13);
  assert.deepEqual(eventTypes(events).filter((t) => ['alert', 'charge', 'discharge', 'hurt'].includes(t)), ['alert', 'charge', 'discharge', 'hurt']);
  assert.equal(game.enemies[0].data.look, 'bug');
});

test('a "!" pops up over a provoked enemy when a spell turns it hostile, and goes after a while', () => {
  const game = gameWith({ enemies: [{ id: 'b', template: 'bug', at: [2, 0, 2], overrides: { movement: 'stationary', hostility: 'provoked' } }], pos: [6.5, 0, 6.5] });
  const [enemy] = game.enemies;
  assert.equal(enemy.alerted, false);
  enemy.hit(1, 'zap');
  assert.equal(enemy.alerted, true);
  run(game, ENEMY.alertTicks);
  assert.equal(enemy.alerted, false);
});

// ---- data

test('data: discharge values are checked; a discharge enemy must notice what it can hit', () => {
  const room = (enemies) => roomFile('alpha', { enemies });
  const errors = (enemies) => validateData(dataFiles({ rooms: [room(enemies)], enemies: TEMPLATES, objects: { crate: CRATE } })).join('\n');
  assert.equal(errors([virus([1, 0, 1]), { id: 's', template: 'sentinel', at: [5, 0, 5] }]), '');
  assert.match(errors([virus([1, 0, 1], 'v', { aggroRange: 1 })]), /aggroRange 1 is shorter than its attackRange 1\.2/);
  assert.match(errors([virus([1, 0, 1], 'v', { attackColor: 'yellow' })]), /"attackColor" must be #rrggbb/);
  assert.match(errors([virus([1, 0, 1], 'v', { attackRange: 40 })]), /"attackRange" must be between/);
  assert.match(errors([virus([1, 0, 1], 'v', { attack: 'ring' })]), /"attack" must be one of touch, burst, arc, bolt, none/);
  assert.match(errors([virus([1, 0, 1], 'v', { look: 'dragon' })]), /"look" must be one of bug, virus, sentinel, cron, worm, crawler, warden, daemon, golem, wyrm, phish, overclock, pixie/);
  assert.equal(errors([virus([1, 0, 1], 'v', { attack: 'touch', aggroRange: 0, movement: 'stationary' })]), '', 'only a charged attack or a chaser needs the aggro range');
  assert.equal(errors([virus([1, 0, 1], 'v', { chaseSpeed: 4, memory: 3, attackColor: '#ffffff' })]), '');
  assert.equal(errors([virus([1, 0, 1], 'v')]), '', 'a chaser needs no path');
});
