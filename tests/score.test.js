import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeAnnouncements, takeMessages } from '../src/core/messages.js';
import { validateData } from '../src/data/validate.js';
import { SECRET_COLOR } from '../src/entities/pickup.js';
import { Game } from '../src/game.js';
import { createSecret } from '../src/render/secret.js';
import { SCORE_ROLL, rollScore } from '../src/ui/hud.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { completion, placedBits, scoreOf } from '../src/world/score.js';
import { PICKUPS, SCORE, SPELLS, dataFiles, gameData, idle, roomFile } from './helpers.js';

/** A game in one 8×4×8 room with these pickups. */
function gameWith(pickups, options) {
  return new Game(gameData({ rooms: [roomFile('alpha', { pickups })] }), options);
}

/** Put the wizard on a cell's middle and run one tick. */
function stepOnto(game, [x, y, z]) {
  game.player.place([x + 0.5, y, z + 0.5]);
  return game.update(idle);
}

test('score: 50 a permanent pickup, 200 a secret, 500 an access level; nothing else (D100)', () => {
  const progress = new Progress([saveBit('spells', 0), saveBit('buffs', 3), saveBit('upgrades', 1), saveBit('secrets', 0)]);
  assert.equal(scoreOf(progress, SCORE), 3 * 50 + 200);
  assert.equal(scoreOf(progress, SCORE, 2), 3 * 50 + 200 + 2 * 500);
  assert.equal(scoreOf(new Progress(), SCORE), 0);
});

test('completion: the share of permanent pickups placed in the world that he found, rounded down', () => {
  const rooms = [
    { pickups: [{ type: 'disk_zap' }, { type: 'refill_energy' }, { type: 'secret_0' }] },
    { pickups: [{ type: 'disk_zap' }, { type: 'buff_recharge' }, { type: 'nonsense' }] },
    {},
  ];
  const placed = placedBits(PICKUPS, SPELLS, rooms);
  assert.deepEqual([...placed].sort((a, b) => a - b), [0, 25, 112], 'each item once, refills and unknown types left out');
  assert.equal(completion(new Progress([0]), placed), 33);
  assert.equal(completion(new Progress([0, 25, 112, 5]), placed), 100, 'items placed nowhere do not count');
  assert.equal(completion(new Progress([0]), new Set()), 0);
});

test('a secret: a permanent pickup in its own save block; taking it scores 200 with a banner (D100)', () => {
  takeMessages();
  takeAnnouncements();
  const game = gameWith([
    { id: 'a', type: 'secret_0', at: [4, 0, 4] },
    { id: 'b', type: 'secret_1', at: [6, 0, 6] },
    { id: 'disk', type: 'disk_zap', at: [2, 0, 5] },
  ]);
  assert.equal(game.score, 0);
  assert.equal(game.completion, 0);
  assert.ok(stepOnto(game, [4, 0, 4]).some((event) => event.type === 'pickup'));
  assert.ok(game.progress.has(saveBit('secrets', 0)));
  assert.equal(game.score, 200);
  assert.equal(game.completion, 33);
  assert.deepEqual(takeMessages().map(({ key, values }) => [key, values]), [['msg.secretFound', { found: 1, total: 2 }]]);
  assert.equal(takeAnnouncements().at(-1).key, 'banner.secret');

  stepOnto(game, [2, 0, 5]);
  assert.equal(game.score, 250, 'a disk adds 50');
});

test('the score follows the save: a loaded one scores what it holds, and found items stay ghosts', () => {
  const game = gameWith([{ id: 'a', type: 'secret_0', at: [4, 0, 4] }], { progress: new Progress([saveBit('secrets', 0), 0]) });
  assert.equal(game.score, 250);
  assert.equal(game.pickups[0].state, 'ghost');
  assert.ok(!stepOnto(game, [4, 0, 4]).some((event) => event.type === 'pickup'), 'a ghost cannot be taken');
  assert.equal(game.score, 250);
});

test('refills score nothing', () => {
  const game = gameWith([{ id: 'e', type: 'refill_energy', at: [4, 0, 4] }]);
  game.player.energy = 0;
  assert.ok(stepOnto(game, [4, 0, 4]).some((event) => event.type === 'pickup'));
  assert.equal(game.score, 0);
});

test('defs: secret slots are unique (D100)', () => {
  const files = dataFiles({ rooms: [roomFile('alpha')] });
  files['defs.json'].pickups.secret_1 = { kind: 'secret', slot: 0 };
  assert.match(validateData(files).join('\n'), /pickups\.secret_1\.slot: secret slot 0 is taken by "secret_0"/);
});

test('secret model: a star in the magenta of the wizard, gray once found', () => {
  assert.equal(createSecret().userData.color, SECRET_COLOR);
  assert.notEqual(createSecret({ ghost: true }).userData.color, SECRET_COLOR);
});

test('HUD score rolls up to a new value: fast at first, then settling on it', () => {
  assert.equal(rollScore(100, 300, 0), 100);
  assert.ok(rollScore(100, 300, SCORE_ROLL / 2) > 200, 'eases out');
  assert.equal(rollScore(100, 300, SCORE_ROLL), 300);
  assert.equal(rollScore(100, 300, SCORE_ROLL * 2), 300);
  assert.ok(Number.isInteger(rollScore(0, 50, 0.123)));
});
