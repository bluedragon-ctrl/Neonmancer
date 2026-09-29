import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeAnnouncements, takeMessages } from '../src/core/messages.js';
import { validateData } from '../src/data/validate.js';
import { SCORE_COLOR } from '../src/entities/pickup.js';
import { Game } from '../src/game.js';
import { createGem } from '../src/render/gem.js';
import { SCORE_POPUP, popupState } from '../src/render/score-popup.js';
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

test('a secret: a permanent pickup in its own save block; taking it scores 200 with a popup event and a banner (D100)', () => {
  takeMessages();
  takeAnnouncements();
  const game = gameWith([
    { id: 'a', type: 'secret_0', at: [4, 0, 4] },
    { id: 'b', type: 'secret_1', at: [6, 0, 6] },
    { id: 'disk', type: 'disk_zap', at: [2, 0, 5] },
  ]);
  assert.equal(game.score, 0);
  assert.equal(game.completion, 0);
  const events = stepOnto(game, [4, 0, 4]);
  const score = events.find((event) => event.type === 'score');
  assert.deepEqual(score, { type: 'score', points: 200, at: [4.5, 0.5, 4.5], color: SCORE_COLOR });
  assert.ok(game.progress.has(saveBit('secrets', 0)));
  assert.equal(game.score, 200);
  assert.equal(game.completion, 33);
  assert.deepEqual(takeMessages().map(({ key, values }) => [key, values]), [['msg.secretFound', { found: 1, total: 2 }]]);
  assert.equal(takeAnnouncements().at(-1).key, 'banner.secret');

  const disk = stepOnto(game, [2, 0, 5]).find((event) => event.type === 'score');
  assert.equal(disk.points, 50);
  assert.equal(game.score, 250);
});

test('the score follows the save: a loaded one scores what it holds, and found items stay ghosts', () => {
  const game = gameWith([{ id: 'a', type: 'secret_0', at: [4, 0, 4] }], { progress: new Progress([saveBit('secrets', 0), 0]) });
  assert.equal(game.score, 250);
  assert.equal(game.pickups[0].state, 'ghost');
  assert.ok(!stepOnto(game, [4, 0, 4]).some((event) => event.type === 'score'), 'a ghost scores nothing');
});

test('refills score nothing', () => {
  const game = gameWith([{ id: 'e', type: 'refill_energy', at: [4, 0, 4] }]);
  game.player.energy = 0;
  const events = stepOnto(game, [4, 0, 4]);
  assert.ok(events.some((event) => event.type === 'pickup'));
  assert.ok(!events.some((event) => event.type === 'score'));
});

test('defs: secret slots are unique (D100)', () => {
  const files = dataFiles({ rooms: [roomFile('alpha')] });
  files['defs.json'].pickups.secret_1 = { kind: 'secret', slot: 0 };
  assert.match(validateData(files).join('\n'), /pickups\.secret_1\.slot: secret slot 0 is taken by "secret_0"/);
});

test('gem model: gold, gray once found', () => {
  assert.equal(createGem().userData.color, SCORE_COLOR);
  assert.notEqual(createGem({ ghost: true }).userData.color, SCORE_COLOR);
});

test('score popup: rises easing out, fades in its last part, then goes', () => {
  const start = popupState(0);
  assert.deepEqual(start, { rise: 0, opacity: 1 });
  const mid = popupState(SCORE_POPUP.seconds * 0.5);
  assert.ok(mid.rise > SCORE_POPUP.rise * 0.5, 'eases out');
  assert.equal(mid.opacity, 1);
  assert.ok(popupState(SCORE_POPUP.seconds * 0.9).opacity < 0.5);
  assert.equal(popupState(SCORE_POPUP.seconds), null);
});
