import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { FIREWALL_FX, firewallSegments } from '../src/render/firewall-fx.js';
import { SHIELD_FX, shieldLook } from '../src/render/shield-fx.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { BUG, SENTINEL, SPELLS, VIRUS, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** A stationary bug firing slow bolts (D80): 12 ticks of charge, 6 units per second. */
const SHOOTER = { extends: 'bug', movement: 'stationary', attack: 'bolt', aggroRange: 6, attackRange: 6, attackCharge: 0.2, attackCooldown: 2, boltSpeed: 6 };
/** A stationary bug with a burst. */
const ZAPPER = { extends: 'bug', movement: 'stationary', attack: 'burst', aggroRange: 3, attackRange: 1.2, attackCharge: 0.2 };
/** A stationary sentinel with its arc. */
const TURRET = { extends: 'sentinel', movement: 'stationary', attackCharge: 0.2 };
/** A bug standing still, with its touch attack. */
const SITTER = { extends: 'bug', movement: 'stationary', integrity: 3 };

const TEMPLATES = { bug: BUG, virus: VIRUS, sentinel: SENTINEL, shooter: SHOOTER, zapper: ZAPPER, turret: TURRET, sitter: SITTER };

/** Fake input pressing one action this tick. */
const press = (action) => ({ down: (a) => a === action, pressed: (a) => a === action });

/**
 * A game in one 8×4×8 room with the given enemies; the wizard knows Zap,
 * Shield and Firewall and stands at `pos`.
 */
function gameWith(enemies, pos) {
  const game = new Game(gameData({ rooms: [roomFile('alpha', { enemies, spawn: [0.5, 0, 7.5] })], enemies: TEMPLATES }), {
    progress: new Progress([0, 1, 2].map((slot) => saveBit('spells', slot))),
  });
  game.player.place(pos);
  return game;
}

/** Raise a ring spell by casting it (selecting it first). */
function raise(game, spell) {
  while (game.player.spell !== spell) game.update(press('spellNext'));
  return game.update(press('cast'));
}

/** Run the game for `ticks` ticks; returns every event. */
function run(game, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(idle));
  return events;
}

test('the Shield absorbs a bolt at its ring: no hurt, sparks, a block that flares it (D84)', () => {
  const game = gameWith([{ id: 's', template: 'shooter', at: [1, 0, 1] }], [5.5, 0, 1.5]);
  raise(game, 'shield');
  const events = run(game, 100);
  const block = events.find((e) => e.type === 'block');
  assert.equal(block?.enemy, game.enemies[0]);
  assert.ok(block.bolt, 'the bolt it absorbed');
  assert.ok(block.bolt.pos[0] <= 5.5 - PLAYER.shieldRadius, 'stopped at the ring, not at him');
  assert.ok(eventTypes(events).includes('zap'), 'sparks');
  assert.ok(!eventTypes(events).includes('hurt'));
  assert.equal(game.player.integrity, game.player.maxIntegrity);
  assert.equal(game.player.invulnerable, 0, 'no blinking either');
  assert.equal(typeof game.player.shield.blockedAt, 'number');
});

test('the Shield blocks bursts and arcs, but touching an enemy still hurts (D84)', () => {
  const burst = gameWith([{ id: 'z', template: 'zapper', at: [2, 0, 2] }], [3.5, 0, 2.5]);
  raise(burst, 'shield');
  const bursts = run(burst, 60);
  assert.ok(eventTypes(bursts).includes('discharge'));
  assert.ok(eventTypes(bursts).includes('block'));
  assert.equal(burst.player.integrity, burst.player.maxIntegrity);

  const arc = gameWith([{ id: 't', template: 'turret', at: [1, 0, 1] }], [4.5, 0, 1.5]);
  raise(arc, 'shield');
  const arcs = run(arc, 60);
  assert.ok(eventTypes(arcs).includes('discharge'));
  assert.ok(eventTypes(arcs).includes('block'));
  assert.equal(arc.player.integrity, arc.player.maxIntegrity);

  const touch = gameWith([{ id: 'b', template: 'sitter', at: [3, 0, 3] }], [3.5, 0, 3.2]);
  raise(touch, 'shield');
  run(touch, 2);
  assert.equal(touch.player.integrity, touch.player.maxIntegrity - BUG.damage, 'touch gets through');
});

test('Firewall costs 40, replaces the Shield, blocks touch and burns what touches it every burnInterval (D84)', () => {
  const game = gameWith([{ id: 'b', template: 'sitter', at: [3, 0, 3] }], [1.5, 0, 1.5]);
  raise(game, 'shield');
  run(game, SPELLS.shield.cooldown * 60);
  game.player.energy = PLAYER.maxEnergy;
  raise(game, 'firewall');
  assert.equal(game.player.shield.spell, 'firewall', 'replaces the Shield');
  assert.equal(game.player.energy, PLAYER.maxEnergy - SPELLS.firewall.cost);
  const [bug] = game.enemies;
  // The bug's box reaches the ring (radius 0.55), not his own box.
  game.player.place([bug.box()[0][1] + PLAYER.shieldRadius - 0.05, 0, 3.5]);
  assert.ok(game.player.box()[0][0] > bug.box()[0][1], 'his own box is clear of it');
  const first = game.update(idle);
  assert.ok(eventTypes(first).includes('hit'), 'burnt at once');
  assert.equal(bug.integrity, SITTER.integrity - 1);
  const interval = SPELLS.firewall.burnInterval * 60;
  run(game, interval - 1);
  assert.equal(bug.integrity, SITTER.integrity - 1, 'not again before burnInterval');
  run(game, 1);
  assert.equal(bug.integrity, SITTER.integrity - 2);
  // Walking into it: touch doesn't hurt him while the Firewall is up.
  game.player.place([3.5, 0, 3.2]);
  run(game, 2);
  assert.equal(game.player.integrity, game.player.maxIntegrity);
  const popped = run(game, interval);
  assert.ok(eventTypes(popped).includes('pop'), 'burnt to pixels');
  assert.equal(bug.deathCause, 'firewall');
});

test('Firewall also blocks bolts; it ends after its duration and touch hurts again', () => {
  const game = gameWith([{ id: 's', template: 'shooter', at: [1, 0, 1] }], [5.5, 0, 1.5]);
  raise(game, 'firewall');
  assert.ok(eventTypes(run(game, 100)).includes('block'));
  assert.equal(game.player.integrity, game.player.maxIntegrity);
  run(game, SPELLS.firewall.duration * 60);
  assert.equal(game.player.shield, null);
});

test('shield look: a block flares it for flareTicks, brighter and bigger', () => {
  const calm = shieldLook(100, 400);
  const flared = shieldLook(100, 400, 0);
  assert.ok(flared.glow > calm.glow && flared.scale > calm.scale);
  assert.deepEqual(shieldLook(100, 400, SHIELD_FX.flareTicks), calm);
  assert.deepEqual(shieldLook(100, 400, -3), calm, 'not before the block');
});

test('firewall look: flames on the ring, no taller than tongueHigh, flickering between variants', () => {
  const segments = firewallSegments(0);
  assert.ok(segments.length > SHIELD_FX.kinks + FIREWALL_FX.tongues * 4);
  for (const [a, b] of segments) {
    for (const [x, y, z] of [a, b]) {
      assert.ok(Math.hypot(x, z) <= SHIELD_FX.radius + SHIELD_FX.jitter + 1e-9, 'on the ring');
      assert.ok(y >= 0 && y <= FIREWALL_FX.tongueHigh + 1e-9, 'height');
    }
  }
  assert.notDeepEqual(firewallSegments(1), segments, 'flickers');
});
