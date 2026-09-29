import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeAnnouncements, takeMessages } from '../src/core/messages.js';
import { PLAYER } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { SHRINE_FX, shrineMotes, shrinePulse, shrineRings } from '../src/render/shrine-view.js';
import { nearestShrine } from '../src/world/map.js';
import { eventTypes, gameData, idle, roomFile } from './helpers.js';

/**
 * Three rooms in a row on the map, unconnected: alpha [0, 0] (the start,
 * no shrine), beta [1, 0] and gamma [2, 0], both with a shrine.
 */
function content({ shrines = { beta: [4, 4], gamma: [6, 2] } } = {}) {
  const rooms = ['alpha', 'beta', 'gamma'].map((id) => roomFile(id, shrines[id] ? { shrine: shrines[id] } : {}));
  return gameData({ rooms });
}

/** Kill the wizard and run the game until he recompiles; the events of those ticks. */
function dieAndRecompile(game) {
  game.player.invulnerable = 0;
  game.hurt(99);
  const events = [];
  for (let i = 0; i <= PLAYER.deathTicks && !events.includes('respawn'); i++) events.push(...eventTypes(game.update(idle)));
  return events;
}

test('he starts with 8 backups; a death uses one and he recompiles in the room, saying how many are left', () => {
  const game = new Game(content());
  assert.equal(game.player.backups, 8);
  takeMessages();
  const events = dieAndRecompile(game);
  assert.deepEqual(events, ['hurt', 'die', 'respawn', 'room']);
  assert.equal(game.player.backups, 7);
  assert.equal(game.room.id, 'alpha');
  assert.deepEqual(
    takeMessages().map(({ key, values }) => [key, values?.backups]),
    [['msg.derez', undefined], ['msg.respawn', 7]],
  );
});

test('dying with no backups left crashes: he reboots on the nearest shrine, refilled, keeping what he found', () => {
  const game = new Game(content());
  const { player } = game;
  game.progress.collect(0);
  player.backups = 0;
  player.maxEnergy = 60;
  player.clipboard = { kind: 'object', data: {}, integrity: null };
  takeMessages();
  takeAnnouncements();

  player.invulnerable = 0;
  game.hurt(99);
  const [, die] = game.update(idle);
  assert.deepEqual(die, { type: 'die', cause: 'damage', crash: true });
  assert.equal(player.clipboard, null, 'the clipboard goes with his death');
  const events = [];
  for (let i = 0; i < PLAYER.deathTicks && !events.includes('respawn'); i++) events.push(...eventTypes(game.update(idle)));
  assert.deepEqual(events, ['shrine', 'crash', 'respawn', 'room']);

  // beta is one map cell from alpha, gamma two.
  assert.equal(game.room.id, 'beta');
  assert.deepEqual(player.pos, [4.5, 0, 4.5]);
  assert.equal(player.integrity, player.maxIntegrity);
  assert.equal(player.energy, 60);
  assert.equal(player.backups, PLAYER.backups);
  assert.ok(game.progress.has(0), 'nothing found is lost');
  assert.equal(game.lastShrine, 'beta');
  assert.deepEqual(game.transition, { phase: 'in', tick: 0 });
  assert.deepEqual(
    takeMessages().map((m) => m.key),
    ['msg.derez', 'msg.noBackups', 'msg.crash'],
  );
  assert.deepEqual(takeAnnouncements().at(-1), {
    key: 'banner.crash',
    values: {},
    sub: 'banner.crashSub',
    subValues: { room: 'beta' },
    color: '#ff3b5c',
  });

  // Standing on the shrine he rebooted on doesn't use it again.
  for (let i = 0; i < 30; i++) assert.ok(!eventTypes(game.update(idle)).includes('shrine'));
});

test('a crash in a room with a shrine reboots him on it', () => {
  const game = new Game(content());
  game.enterRoom('gamma');
  game.player.backups = 0;
  dieAndRecompile(game);
  assert.equal(game.room.id, 'gamma');
  assert.deepEqual(game.player.pos, [6.5, 0, 2.5]);
});

test('with no shrine in the world a crash reboots him at the start, refilled', () => {
  const game = new Game(content({ shrines: {} }));
  game.enterRoom('gamma');
  game.player.backups = 0;
  game.player.energy = 3;
  const events = dieAndRecompile(game);
  assert.ok(events.includes('crash'));
  assert.ok(!events.includes('shrine'));
  assert.equal(game.room.id, 'alpha');
  assert.deepEqual(game.player.pos, game.room.spawn);
  assert.equal(game.player.backups, PLAYER.backups);
  assert.equal(game.player.energy, game.player.maxEnergy);
});

test('stepping onto a shrine refills integrity, energy and backups once, until he steps off', () => {
  const game = new Game(content());
  game.enterRoom('beta');
  game.update(idle); // he lands
  const { player } = game;
  Object.assign(player, { integrity: 2, energy: 1, backups: 3 });
  takeMessages();
  player.pos = [4.5, 0, 4.5];
  assert.deepEqual(eventTypes(game.update(idle)), ['shrine']);
  assert.deepEqual([player.integrity, player.energy, player.backups], [player.maxIntegrity, player.maxEnergy, PLAYER.backups]);
  assert.deepEqual(takeMessages().map((m) => m.key), ['msg.backupSaved']);
  assert.equal(game.lastShrine, 'beta');

  player.backups = 5;
  assert.deepEqual(eventTypes(game.update(idle)), [], 'staying on it does nothing');
  player.pos = [2.5, 0, 2.5];
  game.update(idle);
  player.pos = [4.1, 0, 4.9];
  assert.deepEqual(eventTypes(game.update(idle)), ['shrine'], 'stepping back on uses it again');
  assert.equal(player.backups, PLAYER.backups);

  // In the air above it doesn't count.
  player.pos = [2.5, 0, 2.5];
  game.update(idle);
  player.pos = [4.5, 1.5, 4.5];
  player.vy = 5;
  assert.ok(!eventTypes(game.update(idle)).includes('shrine'));
});

test('nearestShrine: fewest map cells along the grid, its own room first, ties to the last used, then room order', () => {
  const rooms = new Map([
    ['home', {}],
    ['west', { shrine: [1, 1] }],
    ['east', { shrine: [1, 1] }],
    ['far', { shrine: [1, 1] }],
  ]);
  const positions = { home: [0, 0], west: [-1, 0], east: [1, 0], far: [3, 3] };
  assert.equal(nearestShrine(rooms, positions, 'home'), 'west');
  assert.equal(nearestShrine(rooms, positions, 'home', 'east'), 'east');
  assert.equal(nearestShrine(rooms, positions, 'home', 'far'), 'west', 'the last used only breaks ties');
  assert.equal(nearestShrine(rooms, positions, 'far'), 'far');
  // Diagonal neighbours are two cells away: [1, 1] from home is as far as [2, 0].
  positions.far = [1, 1];
  positions.east = [2, 0];
  assert.equal(nearestShrine(rooms, positions, 'home', 'far'), 'west');
  assert.equal(nearestShrine(new Map([['home', {}]]), positions, 'home'), null);
});

test('shrine look: motes rise inside the tile and shrink away; idle rings; a use flares and fades', () => {
  for (const time of [0, 0.7, 1.9, 5.3]) {
    for (const { offset: [x, y, z], scale } of shrineMotes(time)) {
      assert.ok(x > 0 && x < 1 && z > 0 && z < 1);
      assert.ok(y >= SHRINE_FX.lift && y <= SHRINE_FX.lift + SHRINE_FX.height);
      assert.ok(scale >= 0 && scale <= 1);
    }
  }
  assert.equal(shrineMotes(1).length, SHRINE_FX.motes);
  assert.equal(shrineRings(0.5).length, 1);
  assert.equal(shrineRings(SHRINE_FX.ringTime + 0.1).length, 0, 'a gap between idle rings');
  assert.equal(shrineRings(SHRINE_FX.ringTime + 0.1, 0.2).length, 2, 'a use sweeps rings up');
  assert.equal(shrinePulse(0).flare, 0);
  assert.equal(shrinePulse(0, 0).flare, 1);
  assert.ok(shrinePulse(0, SHRINE_FX.useTime / 2).flare < 1);
  assert.equal(shrinePulse(0, SHRINE_FX.useTime).flare, 0);
});
