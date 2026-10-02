import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeMessages } from '../src/core/messages.js';
import { BOOST, boostTicks } from '../src/entities/boost.js';
import { PLAYER } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { validateData } from '../src/data/validate.js';
import { createBoost } from '../src/render/boost.js';
import { SPARKLE, sparkleStep } from '../src/render/sparkle-fx.js';
import { dataFiles, eventTypes, gameData, idle, roomFile } from './helpers.js';

const walk = { down: (a) => a === 'down', pressed: () => false };
const cast = { down: (a) => a === 'cast', pressed: (a) => a === 'cast' };

/** A game in one 8×4×8 room with these pickups; the wizard stands at [1.5, 0, 1.5]. */
function gameWith(pickups = []) {
  return new Game(gameData({ rooms: [roomFile('alpha', { pickups })] }));
}

/** Put the wizard on a cell's middle and run one tick. */
function stepOnto(game, [x, y, z]) {
  game.player.place([x + 0.5, y, z + 0.5]);
  return eventTypes(game.update(idle));
}

/** Take a boost pickup lying at [4, 0, 4]. */
function take(type, game = gameWith([{ id: 'b', type, at: [4, 0, 4] }])) {
  assert.ok(stepOnto(game, [4, 0, 4]).includes('boost'));
  return game;
}

/** Kill him and run until he recompiles (the room is built again). */
function dieAndRecompile(game) {
  game.player.invulnerable = 0;
  game.hurt(99);
  for (let i = 0; i <= PLAYER.deathTicks + 2 && game.player.dead; i++) game.update(idle);
}

test('a functional boost runs for its seconds, ends with the room, and says so in the terminal', () => {
  takeMessages();
  const game = take('boost_overdrive');
  assert.equal(game.player.boosts.overdrive, boostTicks(15));
  assert.deepEqual(takeMessages().map(({ key, values }) => [key, values.seconds]), [['msg.boostOn', 15]]);
  assert.equal(game.pickups[0].state, 'taken');
  // Taking it again starts over.
  game.player.boosts.overdrive = 10;
  game.pickups[0].state = 'idle';
  stepOnto(game, [4, 0, 4]);
  assert.equal(game.player.boosts.overdrive, boostTicks(15));

  dieAndRecompile(game);
  assert.deepEqual(game.player.boosts, {}, 'the room reset');
  assert.equal(game.pickups[0].state, 'idle', 'the pickup is back with the room');
});

test('a functional boost times out', () => {
  const game = take('boost_patch');
  game.player.boosts.patch = 3;
  for (let i = 0; i < 3; i++) game.update(idle);
  assert.equal(game.player.boosts.patch, undefined);
});

test('a functional boost does not survive leaving the room', () => {
  const game = take('boost_overclock');
  game.enterRoom('alpha');
  assert.deepEqual(game.player.boosts, {});
});

test('overdrive: 50% faster on the ground, the same in the air', () => {
  const run = (boosted, grounded) => {
    const game = gameWith();
    const { player } = game;
    for (let i = 0; i < 30 && !player.grounded; i++) game.update(idle);
    if (boosted) player.boosts.overdrive = 600;
    player.place([1.5, grounded ? 0 : 3, 1.5]);
    player.grounded = grounded;
    const from = player.pos[0];
    player.update(walk, game.grid);
    return player.pos[0] - from;
  };
  assert.ok(Math.abs(run(true, true) / run(false, true) - BOOST.overdriveSpeed) < 1e-6);
  assert.ok(Math.abs(run(true, false) - run(false, false)) < 1e-9);
});

test('patch absorbs the next hit, then is gone', () => {
  takeMessages();
  const game = take('boost_patch');
  takeMessages();
  game.hurt(3);
  const { player } = game;
  assert.equal(player.integrity, player.maxIntegrity, 'no damage');
  assert.equal(player.boosts.patch, undefined);
  assert.ok(player.invulnerable > 0, 'a moment of safety');
  assert.deepEqual(takeMessages().map(({ key }) => key), ['msg.patchUsed']);
  assert.ok(eventTypes(game.update(idle)).includes('patch'));
  player.invulnerable = 0;
  game.hurt(1);
  assert.equal(player.integrity, player.maxIntegrity - 1, 'the next hit hurts');
});

test('a patch is kept through a hit that arrives while he is invulnerable', () => {
  const game = take('boost_patch');
  game.player.invulnerable = 30;
  game.hurt(1);
  assert.ok(game.player.boosts.patch > 0);
});

test('overclock: spells cost no energy, and without it they do', () => {
  const game = gameWith();
  game.learnSpells('zap');
  const { player } = game;
  player.boosts.overclock = 600;
  player.energy = 5;
  assert.ok(eventTypes(game.update(cast)).includes('cast'), 'cast with less energy than the cost');
  assert.equal(player.energy, 5);
  player.boosts = {};
  player.cooldown = 0;
  assert.ok(eventTypes(game.update(cast)).includes('deny'));
});

test('cosmetic boosts last through deaths and rooms, are taken once, and a crash wipes them', () => {
  const game = take('boost_sparkle');
  assert.ok(game.player.looks.has('sparkle'));
  assert.deepEqual(game.player.boosts, {});

  // Lying again after a room reset, but he has it: it stays lying.
  dieAndRecompile(game);
  assert.ok(game.player.looks.has('sparkle'), 'a death does not take it');
  assert.equal(game.pickups[0].state, 'idle');
  assert.ok(!stepOnto(game, [4, 0, 4]).includes('pickup'), 'left lying while he has it');

  // The reboot after the last backup.
  game.player.backups = 0;
  dieAndRecompile(game);
  assert.equal(game.player.looks.size, 0);
  assert.ok(stepOnto(game, [4, 0, 4]).includes('boost'), 'he can take it again');
});

test('boost types: functional ones need seconds, cosmetic ones have none', () => {
  const files = dataFiles({ rooms: [roomFile('alpha')] });
  assert.deepEqual(validateData(files), []);
  files['defs.json'].pickups.boost_overdrive = { kind: 'boost', effect: 'overdrive' };
  files['defs.json'].pickups.boost_sparkle = { kind: 'boost', effect: 'sparkle', seconds: 5 };
  const errors = validateData(files).join('\n');
  assert.match(errors, /pickups\.boost_overdrive\.seconds: overdrive is a functional boost: it needs "seconds"/);
  assert.match(errors, /pickups\.boost_sparkle\.seconds: sparkle is cosmetic/);
});

test('boost models: each effect has a look of its own, in its color', () => {
  for (const effect of Object.keys(BOOST.colors)) {
    const model = createBoost(effect);
    assert.equal(model.userData.color, parseInt(BOOST.colors[effect].slice(1), 16));
  }
});

test('sparkle trail: pixels spawn while he walks, age out, and stay within the cap', () => {
  const pixels = [];
  const state = { carry: 0, serial: 0 };
  for (let i = 0; i < 120; i++) sparkleStep(pixels, 1 / 60, [1, 0, 1], state);
  assert.ok(pixels.length > 5 && pixels.length <= SPARKLE.count);
  for (let i = 0; i < 120; i++) sparkleStep(pixels, 1 / 60, null, state);
  assert.equal(pixels.length, 0, 'none left once he stops and they fade');
});
