import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT } from '../src/core/loop.js';
import { pauseEnemy } from '../src/combat.js';
import { Game } from '../src/game.js';
import { PAUSE_FX, pauseLook } from '../src/render/pause-fx.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { BUG, SPELLS, eventTypes, gameData, hold, idle, roomFile } from './helpers.js';

/** A bug standing still, with its touch attack; not bouncy (a plain body to stand on). */
const SITTER = { extends: 'bug', movement: 'stationary', bounce: false, integrity: 3 };
/** A bouncy bug standing still. */
const HOPPER = { extends: 'bug', movement: 'stationary' };
/** A stationary bug firing slow bolts (D80) at the wizard, after a second of charge. */
const SHOOTER = { extends: 'bug', movement: 'stationary', attack: 'bolt', aggroRange: 8, attackRange: 8, attackCharge: 1, attackCooldown: 0.5, boltSpeed: 6 };
/** A guardian Pause can't freeze. */
const WARDEN = { extends: 'sitter', pausable: false };

const TEMPLATES = { bug: BUG, sitter: SITTER, hopper: HOPPER, shooter: SHOOTER, warden: WARDEN };

/** Ticks an enemy stays frozen. */
const FROZEN = Math.round(SPELLS.pause.duration / DT);

/** Fake input pressing one action this tick. */
const press = (action) => ({ down: (a) => a === action, pressed: (a) => a === action });

/**
 * A game in one 8×4×8 room with the given enemies; the wizard knows Zap
 * and Pause, stands at `pos` and aims along +x.
 */
function gameWith(enemies, pos = [1.5, 0, 3.5]) {
  const game = new Game(gameData({ rooms: [roomFile('alpha', { enemies, spawn: [0.5, 0, 7.5] })], enemies: TEMPLATES }), {
    progress: new Progress([0, 3].map((slot) => saveBit('spells', slot))),
  });
  game.player.place(pos);
  game.player.facing = game.player.targetFacing = Math.PI / 2;
  return game;
}

/** Cast `spell` (selecting it first); returns this tick's events. */
function cast(game, spell) {
  while (game.player.spell !== spell) game.update(press('spellNext'));
  return game.update(press('cast'));
}

/** Run the game for `ticks` ticks with `input`; returns every event. */
function run(game, ticks, input = idle) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(input));
  return events;
}

/** Cast Pause and run until the bolt has hit; returns every event. */
function freeze(game) {
  const events = [...cast(game, 'pause')];
  for (let i = 0; i < 60 && !events.some((e) => e.type === 'freeze' || e.type === 'zap'); i++) events.push(...game.update(idle));
  return events;
}

test('Pause fires a bolt in its color that freezes the enemy it hits, unhurt (D85)', () => {
  const game = gameWith([{ id: 'b', template: 'sitter', at: [5, 0, 3] }]);
  const energy = game.player.energy;
  const events = cast(game, 'pause');
  assert.equal(game.player.energy, energy - SPELLS.pause.cost);
  events.push(...freeze(game).filter((e) => e.type !== 'cast'));
  const [bug] = game.enemies;
  assert.equal(events.find((e) => e.type === 'freeze')?.enemy, bug);
  assert.ok(eventTypes(events).includes('zap'), 'sparks');
  assert.deepEqual(bug.frozen, { tick: 0, ticks: FROZEN });
  assert.equal(bug.integrity, SITTER.integrity);
  assert.ok(bug.solid, 'a frozen enemy is solid');
  assert.ok(game.solids.includes(bug));
  assert.equal(bug.hurtsOnContact, false);
});

test('a frozen enemy stops mid-step and walks on once it thaws', () => {
  const game = gameWith([{ id: 'b', template: 'bug', at: [5, 0, 3], path: { points: [[7, 0, 3]] } }], [1.5, 0, 3.5]);
  const [bug] = game.enemies;
  run(game, 3); // it starts walking
  freeze(game);
  assert.ok(bug.frozen);
  const at = [...bug.pos];
  run(game, FROZEN - 10);
  assert.deepEqual(bug.pos, at, 'held still');
  const events = run(game, 10);
  assert.equal(events.find((e) => e.type === 'thaw')?.enemy, bug);
  assert.equal(bug.frozen, null);
  assert.equal(bug.solid, false);
  assert.ok(!game.solids.includes(bug));
  run(game, 5);
  assert.notDeepEqual(bug.pos, at, 'walking again');
});

test('the wizard bumps into a frozen enemy and stands on it, unhurt; a frozen bouncy one does not bounce', () => {
  const game = gameWith([{ id: 'b', template: 'sitter', at: [4, 0, 3] }]);
  freeze(game);
  const events = run(game, 40, hold('down'));
  assert.ok(!eventTypes(events).includes('hurt'));
  assert.ok(game.player.pos[0] <= 4.2 - 0.3 + 1e-6, `blocked at its side: ${game.player.pos}`);

  const hop = gameWith([{ id: 'h', template: 'hopper', at: [4, 0, 3] }]);
  freeze(hop);
  hop.player.place([4.5, 1.2, 3.5]);
  const landed = run(hop, 30);
  assert.ok(!eventTypes(landed).includes('bounce'));
  assert.ok(Math.abs(hop.player.pos[1] - 0.6) < 1e-6, `stands on it: ${hop.player.pos}`);
  assert.ok(!eventTypes(landed).includes('hurt'));
});

test('an enemy frozen round the wizard lets him out, then turns solid for him', () => {
  const game = gameWith([{ id: 'b', template: 'sitter', at: [3, 0, 3] }], [3.5, 0, 3.5]);
  // As a Pause bolt hitting it while he stands inside it.
  pauseEnemy(game, game.enemies[0], FROZEN);
  const [bug] = game.enemies;
  assert.ok(bug.passable);
  assert.ok(!game.solids.includes(bug), 'not solid for him while he is inside');
  run(game, 30, hold('down'));
  assert.ok(game.player.pos[0] > 4.2, `walked out: ${game.player.pos}`);
  assert.equal(bug.passable, false);
  assert.ok(game.solids.includes(bug));
  run(game, 30, hold('up'));
  assert.ok(game.player.pos[0] >= 3 + 0.8 + 0.3 - 1e-6, `blocked on the way back: ${game.player.pos}`);
});

test('a frozen enemy still takes hits: Zap pops it', () => {
  const game = gameWith([{ id: 'b', template: 'sitter', at: [5, 0, 3] }]);
  freeze(game);
  const [bug] = game.enemies;
  const events = [];
  for (let i = 0; i < SITTER.integrity; i++) {
    events.push(...cast(game, 'zap'), ...run(game, 30));
  }
  assert.ok(eventTypes(events).includes('pop'));
  assert.equal(bug.alive, false);
  assert.equal(bug.frozen, null);
  assert.ok(!game.solids.includes(bug));
});

test('a frozen shooter holds its fire; freezing it again starts the freeze over', () => {
  const game = gameWith([{ id: 's', template: 'shooter', at: [6, 0, 3] }]);
  freeze(game);
  const [shooter] = game.enemies;
  assert.equal(shooter.attackTick, null);
  run(game, 60);
  const events = [...freeze(game)];
  assert.equal(shooter.frozen.tick, 0, 'started over');
  events.push(...run(game, FROZEN - 20));
  assert.ok(!eventTypes(events).includes('discharge'), 'no shots while frozen');
  assert.equal(game.player.integrity, game.player.maxIntegrity);
});

test('an enemy that is not pausable shrugs Pause off, alarmed (D81, D85)', () => {
  const game = gameWith([{ id: 'w', template: 'warden', at: [5, 0, 3] }]);
  const events = freeze(game);
  const [warden] = game.enemies;
  assert.ok(!eventTypes(events).includes('freeze'));
  assert.equal(warden.frozen, null);
  assert.equal(warden.integrity, SITTER.integrity);
  assert.ok(eventTypes(events).includes('alert'));
});

test('a Pause bolt provokes: a provoked enemy thaws hostile', () => {
  const game = gameWith([{ id: 'b', template: 'sitter', at: [5, 0, 3], variant: { hostility: 'provoked' } }]);
  const [bug] = game.enemies;
  assert.equal(bug.hostile, false);
  freeze(game);
  assert.equal(bug.hostile, true);
  assert.equal(bug.hurtsOnContact, false, 'harmless while frozen');
  run(game, FROZEN);
  assert.equal(bug.hurtsOnContact, true);
});

test('pauseLook: sets in, holds, blinks before it thaws, then is over', () => {
  const ticks = 300;
  assert.equal(pauseLook(-1, ticks).frozen, false);
  assert.equal(pauseLook(0, ticks).grow, 0);
  assert.equal(pauseLook(PAUSE_FX.growTicks, ticks).grow, 1);
  for (let t = 0; t < ticks - PAUSE_FX.warnTicks; t++) assert.ok(pauseLook(t, ticks).on, `on at ${t}`);
  const warning = Array.from({ length: PAUSE_FX.warnTicks }, (_, i) => pauseLook(ticks - PAUSE_FX.warnTicks + i, ticks).on);
  assert.ok(warning.includes(false) && warning.includes(true), 'blinks');
  assert.equal(pauseLook(ticks, ticks).frozen, false);
});
