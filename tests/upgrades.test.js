import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../src/data/validate.js';
import { PLAYER, Player } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { CARD, createCard } from '../src/render/card.js';
import { createPickupModel } from '../src/render/pickup-model.js';
import { JUMP_FX, jumpRings } from '../src/render/jump-fx.js';
import { Progress, pickupBit, saveBit } from '../src/world/progress.js';
import { BUG, PICKUPS, SPELLS, dataFiles, eventTypes, gameData, grid, idle, roomFile } from './helpers.js';

/** A stationary bug firing slow bolts (as in firewall.test.js). */
const SHOOTER = { extends: 'bug', movement: 'stationary', attack: 'bolt', aggroRange: 6, attackRange: 6, attackCharge: 0.2, attackCooldown: 2, boltSpeed: 6 };
/** A bug standing still, with 3 integrity. */
const SITTER = { extends: 'bug', movement: 'stationary', integrity: 3 };

/** Fake input pressing one action this tick. */
const press = (action) => ({ down: (a) => a === action, pressed: (a) => a === action });

/** The save bit of an upgrade pickup type. */
const upgradeBit = (type) => pickupBit(PICKUPS[type], SPELLS);

/**
 * A game in one 8×4×8 room; the wizard knows Zap and Shield, has the
 * given upgrades (pickup type ids) and stands at `pos`.
 */
function gameWith({ enemies = [], objects, upgrades = [], pos = [1.5, 0, 1.5] } = {}) {
  const room = roomFile('alpha', { enemies, ...(objects && { objects }), spawn: [0.5, 0, 7.5] });
  const game = new Game(gameData({ rooms: [room], enemies: { bug: BUG, shooter: SHOOTER, sitter: SITTER } }), {
    progress: new Progress([saveBit('spells', 0), saveBit('spells', 1), ...upgrades.map(upgradeBit)]),
  });
  game.player.place(pos);
  return game;
}

/** Turn him to aim along [dx, dz]. */
function aim(player, [dx, dz]) {
  player.targetFacing = player.facing = Math.atan2(dx, dz);
}

/** Run the game for `ticks` ticks; returns every event. */
function run(game, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(idle));
  return events;
}

test('upgrades have their own save bits, 32–47, by their slot (D88, D95)', () => {
  assert.equal(upgradeBit('upgrade_zap_plus'), 32);
  assert.equal(upgradeBit('upgrade_double_jump'), 34);
  const found = new Progress([saveBit('upgrades', 1)]).upgrades(PICKUPS);
  assert.deepEqual([...found.keys()], ['shield_plus']);
  assert.equal(found.get('shield_plus').spell, 'shield');
});

test('taking an upgrade disk installs it: the upgraded spell selected, ZAP shows as ZAP+ (D95)', () => {
  const room = roomFile('alpha', { pickups: [{ id: 'u', type: 'upgrade_zap_plus', at: [2, 0, 1] }] });
  const game = new Game(gameData({ rooms: [room] }), { progress: new Progress([saveBit('spells', 0), saveBit('spells', 1)]) });
  game.player.spell = 'shield';
  assert.equal(game.spellNameKey('zap'), 'spell.zap');
  game.player.place([2.5, 0, 1.5]);
  const events = game.update(idle);
  assert.ok(eventTypes(events).includes('pickup'));
  assert.ok(game.progress.has(32));
  assert.ok(game.player.upgrades.has('zap_plus'));
  assert.equal(game.player.spell, 'zap', 'the upgraded spell is selected');
  assert.equal(game.spellNameKey('zap'), 'upgrade.zap_plus');
  assert.equal(game.spellNameKey('shield'), 'spell.shield');
  assert.equal(game.player.install.item, 'upgrade_zap_plus', 'the install animation runs');
  assert.deepEqual(game.player.spells, ['zap', 'shield'], 'the Tab cycle stays as short');
});

test('Zap+ bounces off the room side and hits an enemy behind him; a plain Zap stops at the wall', () => {
  for (const upgraded of [true, false]) {
    const game = gameWith({ enemies: [{ id: 'e', template: 'sitter', at: [5, 0, 1] }], upgrades: upgraded ? ['upgrade_zap_plus'] : [] });
    aim(game.player, [-1, 0]);
    const events = [...game.update(press('cast')), ...run(game, 60)];
    assert.ok(eventTypes(events).includes('cast'));
    assert.equal(eventTypes(events).includes('ricochet'), upgraded);
    assert.equal(game.enemies[0].integrity, upgraded ? 2 : 3);
    assert.ok(!eventTypes(events).includes('hurt'), 'his own bolt never hurts him');
  }
});

test('Zap+ stops at a room object as a Zap does: it hits a crate, never glances off it', () => {
  const game = gameWith({ objects: [{ id: 'c', type: 'crate', at: [4, 0, 1] }], upgrades: ['upgrade_zap_plus'] });
  aim(game.player, [1, 0]);
  const events = [...game.update(press('cast')), ...run(game, 30)];
  assert.ok(!eventTypes(events).includes('ricochet'));
  assert.equal(events.find((e) => e.type === 'zap')?.bolt.target, game.objects[0]);
});

test('Shield+ sends a bolt back: it hits its shooter, he stays whole (D95)', () => {
  const game = gameWith({ enemies: [{ id: 's', template: 'shooter', at: [1, 0, 1] }], upgrades: ['upgrade_shield_plus'], pos: [5.5, 0, 1.5] });
  game.update(press('spellNext'));
  game.update(press('cast'));
  assert.equal(game.player.shield.reflects, true);
  const events = run(game, 100);
  const reflect = events.find((e) => e.type === 'reflect');
  assert.equal(reflect?.enemy, game.enemies[0]);
  assert.equal(reflect.bolt.reflected, true);
  assert.ok(game.enemies[0].integrity < BUG.integrity, 'the shooter took its own bolt');
  assert.ok(!eventTypes(events).includes('hurt'));
  assert.equal(typeof game.player.shield.blockedAt, 'number', 'the ring flares');
});

test('without Shield+ the Shield only absorbs the bolt', () => {
  const game = gameWith({ enemies: [{ id: 's', template: 'shooter', at: [1, 0, 1] }], pos: [5.5, 0, 1.5] });
  game.update(press('spellNext'));
  game.update(press('cast'));
  const events = run(game, 100);
  assert.ok(!eventTypes(events).includes('reflect'));
  assert.ok(eventTypes(events).includes('block'));
  assert.equal(game.enemies[0].integrity, BUG.integrity);
});

/** Highest his feet get in `ticks` ticks, pressing jump on the ticks in `presses`. */
function peak(player, room, presses, ticks = 90) {
  let top = 0;
  for (let i = 0; i < ticks; i++) {
    player.update(presses.includes(i) ? press('jump') : idle, room);
    top = Math.max(top, player.pos[1]);
  }
  return top;
}

/** A standing wizard on an empty floor, with `airJumps`. */
function standing(airJumps) {
  const room = grid({ size: [8, 6, 8] });
  const player = new Player([4, 0, 4]);
  player.airJumps = airJumps;
  player.update(idle, room); // lands
  return { player, room };
}

test('double jump: a second jump at the top reaches about twice as high, clearing 2 blocks (D95)', () => {
  const single = standing(0);
  const one = peak(single.player, single.room, [0, 20]);
  assert.ok(Math.abs(one - PLAYER.jumpHeight) < 0.05, 'no air jump without the upgrade');
  const double = standing(1);
  const two = peak(double.player, double.room, [0, 20]);
  assert.ok(two > 2.2 && two < 2.5, `apex ${two}`);
});

test('double jump: once per time in the air, back on landing; also when falling without a jump', () => {
  const { player, room } = standing(1);
  player.update(press('jump'), room);
  for (let i = 0; i < 10; i++) player.update(idle, room);
  assert.equal(player.update(press('jump'), room), 'airjump');
  assert.equal(player.airJumpsLeft, 0);
  assert.deepEqual(player.airJumpFrom.map((v) => Math.round(v)), [4, 1, 4], 'where he kicked off, for the rings');
  player.update(idle, room);
  const vy = player.vy;
  player.update(press('jump'), room);
  assert.ok(player.vy < vy, 'no third jump');
  for (let i = 0; i < 90; i++) player.update(idle, room);
  assert.equal(player.grounded, true);
  assert.equal(player.airJumpsLeft, 1, 'back after landing');
  // Falling without a jump (placed in the air): the air jump is there.
  player.place([4, 3, 4]);
  for (let i = 0; i < PLAYER.coyoteTicks + 1; i++) player.update(idle, room);
  assert.equal(player.update(press('jump'), room), 'airjump');
});

test('the game gives him the double jump from the save', () => {
  assert.equal(gameWith().player.airJumps, 0);
  assert.equal(gameWith({ upgrades: ['upgrade_double_jump'] }).player.airJumps, 1);
});

test('jump look: rings grow and fade, gone after airJumpTicks', () => {
  const [first] = jumpRings(0);
  assert.ok(first.glow > 0 && Math.abs(first.radius - JUMP_FX.from) < 1e-9);
  const later = jumpRings(8);
  assert.ok(later[0].radius > first.radius && later[0].glow < first.glow);
  assert.ok(jumpRings(PLAYER.airJumpTicks + 1).every((ring) => ring.glow === 0));
});

test('upgrade card model: a white card, fingers and lit bit in its color, gray once found; the model of an upgrade pickup', () => {
  const card = createCard({ color: '#cfe8ff', slot: 1 });
  assert.equal(card.userData.bitColor, '#cfe8ff');
  assert.equal(card.userData.color, 0xffffff, 'white like a data disk');
  const fingers = card.userData.spin.children.filter((node) => node.isMesh && !node.isLineSegments2).length - 1;
  assert.equal(fingers, CARD.fingers, 'the fingers, one left out for the key notch');
  const ghost = createCard({ color: '#cfe8ff', ghost: true });
  assert.notEqual(ghost.userData.bitColor, '#cfe8ff');
  assert.equal(createPickupModel({}, PICKUPS.upgrade_shield_plus).userData.bitColor, '#cfe8ff');
});

test('defs: upgrade slots and upgrades unique, each upgrading its own spell; Zap+ needs bounces (D95)', () => {
  const files = dataFiles({ rooms: [roomFile('alpha')] });
  const { pickups } = files['defs.json'];
  pickups.upgrade_shield_plus.slot = 0;
  pickups.upgrade_shield_plus.spell = 'zap';
  delete pickups.upgrade_zap_plus.bounces;
  pickups.upgrade_double_jump.spell = 'zap';
  pickups.upgrade_twice = { kind: 'upgrade', upgrade: 'double_jump', slot: 5, color: '#ffffff' };
  const errors = validateData(files).join('\n');
  assert.match(errors, /pickups\.upgrade_shield_plus\.slot: upgrade slot 0 is taken by "upgrade_zap_plus"/);
  assert.match(errors, /pickups\.upgrade_shield_plus\.spell: shield_plus upgrades "shield"/);
  assert.match(errors, /pickups\.upgrade_zap_plus: missing bounces/);
  assert.match(errors, /pickups\.upgrade_double_jump\.spell: double_jump upgrades no spell/);
  assert.match(errors, /pickups\.upgrade_twice\.upgrade: upgrade "double_jump" is "upgrade_double_jump" already/);
});
