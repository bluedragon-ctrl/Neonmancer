import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { MENUS, MenuFlow } from '../src/ui/menus.js';
import { gameData, idle, roomFile } from './helpers.js';

/** Run ticks until the wizard has recompiled; their event types. */
function untilRespawn(game) {
  const types = [];
  for (let i = 0; i < PLAYER.deathTicks + 5; i++) types.push(...game.update(idle).map((event) => event.type));
  return types;
}

test('restart room is a death by choice: one backup, then the room resets', () => {
  const game = new Game(gameData({ rooms: [roomFile('a')] }));
  assert.equal(game.restartRoom(), true);
  assert.equal(game.player.deathCause, 'restart');
  assert.equal(game.player.backups, PLAYER.backups - 1);
  assert.ok(untilRespawn(game).includes('respawn'));
  assert.equal(game.room.id, 'a');
  assert.equal(game.player.dead, false);
});

test('restart room is refused with no backups, or while already dead', () => {
  const game = new Game(gameData({ rooms: [roomFile('a')] }));
  game.player.backups = 0;
  assert.equal(game.restartRoom(), false);
  assert.equal(game.player.dead, false);
  game.player.backups = 3;
  assert.equal(game.restartRoom(), true);
  assert.equal(game.restartRoom(), false);
  assert.equal(game.player.backups, 2);
});

test('debug invincibility makes the restart free', () => {
  const game = new Game(gameData({ rooms: [roomFile('a')] }));
  game.invincible = true;
  assert.equal(game.restartRoom(), true);
  assert.equal(game.player.backups, PLAYER.backups);
});

test('the pause menu asks first; no backups means a notice, not a question', () => {
  const flow = new MenuFlow('playing');
  flow.backups = 2;
  flow.pause();
  flow.select(MENUS.pause.indexOf('restart'));
  assert.equal(flow.choose(), null);
  assert.equal(flow.top.id, 'restart');
  assert.equal(flow.top.selected, MENUS.restart.indexOf('restartNo')); // the safe answer first
  assert.equal(flow.choose(), null);
  assert.equal(flow.top.id, 'pause');

  flow.choose();
  flow.select(MENUS.restart.indexOf('restartYes'));
  assert.equal(flow.choose(), 'restart');
  assert.equal(flow.playing, true);

  flow.backups = 0;
  flow.pause();
  flow.select(MENUS.pause.indexOf('restart'));
  assert.equal(flow.choose(), null);
  assert.equal(flow.top.id, 'pause');
  assert.equal(flow.notice, 'menu.noBackups');
});

test('behind a one-way exit (D259) restart goes with no backups left too: a crash to a shrine', () => {
  const game = new Game(
    gameData({
      rooms: [roomFile('a', { exits: [{ id: 'east', side: '+x', at: 3 }] }), roomFile('b', { exits: [{ id: 'west', side: '-x', at: 3, oneWay: true }] })],
      connections: [['a.east', 'b.west']],
    }),
  );
  game.enterRoom('b', [0.5, 0, 4], 'west');
  game.player.backups = 0;
  assert.equal(game.sealedIn, true);
  assert.equal(game.restartRoom(), true);
  assert.equal(game.crashing, true);

  const flow = new MenuFlow('playing');
  flow.backups = 0;
  flow.sealed = true;
  flow.pause();
  flow.select(MENUS.pause.indexOf('restart'));
  assert.equal(flow.choose(), null);
  assert.equal(flow.top.id, 'restart', 'asks, as with backups left');
});
