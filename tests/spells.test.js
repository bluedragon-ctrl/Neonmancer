import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { DISK, bitGlow } from '../src/render/disk.js';
import { INSTALL_FX, installLook } from '../src/render/install-fx.js';
import { SHIELD_FX, arcPoints, shieldLook } from '../src/render/shield-fx.js';
import { Progress } from '../src/world/progress.js';
import { SPELLS, eventTypes, gameData, hold, idle, roomFile } from './helpers.js';

/** Fake input pressing one action this tick. */
const press = (action) => ({ down: (a) => a === action, pressed: (a) => a === action });

/** A game in one 8×4×8 room with a Zap disk and a Shield disk; the wizard stands at [1.5, 0, 1.5]. */
function twoDisks(options) {
  const pickups = [
    { id: 'zap', type: 'disk_zap', at: [4, 0, 4] },
    { id: 'shield', type: 'disk_shield', at: [6, 0, 4] },
  ];
  return new Game(gameData({ rooms: [roomFile('alpha', { pickups })] }), options);
}

/** Put the wizard on a cell's middle, take what is there and wait out the install. */
function take(game, [x, y, z]) {
  game.player.place([x + 0.5, y, z + 0.5]);
  const events = eventTypes(game.update(idle));
  for (let i = 0; i < PLAYER.installTicks; i++) game.update(idle);
  return events;
}

test('the install animation does not hold the wizard up: he walks, casts, switches and can be hurt (D74)', () => {
  const game = twoDisks({ progress: new Progress([0]) });
  game.player.place([6.5, 0, 4.5]);
  game.update(idle);
  const { player } = game;
  assert.deepEqual(player.install, { spell: 'shield', at: [6.5, 0.5, 4.5], tick: 0 });
  const x = player.pos[0];
  game.update(hold('down'));
  assert.notEqual(player.pos[0], x, 'he walks');
  assert.ok(eventTypes(game.update(press('cast'))).includes('cast'));
  assert.ok(eventTypes(game.update(press('spellNext'))).includes('spell'));
  game.hurt(1);
  assert.equal(player.integrity, player.maxIntegrity - 1, 'he can be hurt');
  assert.ok(player.install, 'the animation runs on');
  for (let i = 0; i < PLAYER.installTicks; i++) game.update(idle);
  assert.equal(player.install, null, 'over after installTicks');
});

test('with two disks Tab switches between Zap and Shield; installing selects the new spell', () => {
  const game = twoDisks();
  take(game, [4, 0, 4]);
  assert.equal(game.player.spell, 'zap');
  take(game, [6, 0, 4]);
  assert.deepEqual(game.player.spells, ['zap', 'shield']);
  assert.equal(game.player.spell, 'shield', 'the spell just installed');
  assert.deepEqual(game.update(press('spellNext')).find((e) => e.type === 'spell'), { type: 'spell', spell: 'zap' });
  assert.deepEqual(game.update(press('spellPrev')).find((e) => e.type === 'spell'), { type: 'spell', spell: 'shield' });
});

test('Shield costs its energy and stays up for its duration; casting again starts it over; death ends it', () => {
  const game = twoDisks({ progress: new Progress([1]) });
  const { player } = game;
  assert.equal(player.spell, 'shield');
  assert.deepEqual(game.update(press('cast')).find((e) => e.type === 'cast'), { type: 'cast', spell: 'shield' });
  assert.equal(player.energy, PLAYER.maxEnergy - SPELLS.shield.cost);
  const ticks = SPELLS.shield.duration * 60;
  assert.deepEqual(player.shield, { tick: 0, ticks });
  for (let i = 0; i < ticks - 1; i++) game.update(idle);
  assert.ok(player.shield, 'still up');
  game.update(press('cast'));
  assert.equal(player.shield.tick, 0, 'cast again: starts over');
  for (let i = 0; i < ticks; i++) game.update(idle);
  assert.equal(player.shield, null, 'down after its duration');
  game.update(press('cast'));
  game.hurt(99);
  assert.equal(player.shield, null, 'gone when he dies');
});

test('install look: the disk shrinks, bits spiral in, rings sweep up, a flash at the end, then done', () => {
  const start = installLook(0, [0, 0.5, 1]);
  assert.ok(start.disk.visible && start.disk.scale === 1);
  assert.deepEqual(start.disk.pos, [0, 0.5, 1]);
  assert.equal(installLook(INSTALL_FX.shrinkTicks, [0, 0.5, 1]).disk.visible, false);
  const spiral = installLook(INSTALL_FX.bitsAt + INSTALL_FX.bitsTicks / 2);
  assert.equal(spiral.pixels.length, INSTALL_FX.pixels);
  const rings = installLook(INSTALL_FX.ringsAt + INSTALL_FX.ringGap * 2 + 1).rings;
  assert.equal(rings.length, 3);
  assert.ok(rings[0].y > rings[1].y && rings[1].y > rings[2].y, 'one after another, the first highest');
  assert.equal(installLook(INSTALL_FX.flashAt).flash, 1);
  const done = installLook(INSTALL_FX.ticks);
  assert.ok(done.done && done.pixels.length === 0 && done.rings.length === 0 && done.flash === 0);
  assert.equal(INSTALL_FX.ticks, PLAYER.installTicks);
});

test('shield look: pops up, flickers between zigzags, blinks before it ends', () => {
  const ticks = 300;
  assert.ok(shieldLook(0, ticks).scale < shieldLook(SHIELD_FX.growTicks, ticks).scale);
  assert.equal(shieldLook(SHIELD_FX.growTicks, ticks).scale, 1);
  assert.notEqual(shieldLook(10, ticks).variant, shieldLook(10 + SHIELD_FX.flickerTicks, ticks).variant);
  const middle = Array.from({ length: 100 }, (_, i) => shieldLook(50 + i, ticks).visible);
  assert.ok(middle.every(Boolean), 'steady in the middle');
  const end = Array.from({ length: SHIELD_FX.warnTicks }, (_, i) => shieldLook(ticks - SHIELD_FX.warnTicks + i, ticks).visible);
  assert.ok(end.includes(true) && end.includes(false), 'blinks at the end');
  assert.equal(shieldLook(ticks, ticks).visible, false);
  const points = arcPoints(0);
  assert.equal(points.length, SHIELD_FX.kinks);
  for (const [x, y, z] of points) {
    assert.ok(Math.abs(Math.hypot(x, z) - SHIELD_FX.radius) <= SHIELD_FX.jitter + 1e-9);
    assert.ok(Math.abs(y) <= SHIELD_FX.jitter);
  }
});

test('a lit disk bit in a darker spell color glows brighter, within bounds (D74)', () => {
  assert.equal(bitGlow(SPELLS.zap.color), DISK.bitBrightness, 'cyan as it is');
  assert.equal(bitGlow('#ffffff'), DISK.bitBrightness, 'never dimmer');
  const blue = bitGlow(SPELLS.shield.color);
  assert.ok(blue > DISK.bitBrightness && blue <= DISK.bitBrightness * DISK.bitBoost);
});
