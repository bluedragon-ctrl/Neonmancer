import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeMessages } from '../src/core/messages.js';
import { Game } from '../src/game.js';
import { eventTypes, gameData, hold, idle, roomFile } from './helpers.js';

/** Three unconnected rooms, only for debugJumpRoom() to cycle through. */
function content() {
  return gameData({ rooms: ['alpha', 'beta', 'gamma'].map((id) => roomFile(id)) });
}

test("hurt() reduces the wizard's integrity, floored at 0, and does nothing while invincible", () => {
  const game = new Game(content());
  const { player } = game;
  game.hurt(3);
  assert.equal(player.integrity, player.maxIntegrity - 3);
  game.hurt(100);
  assert.equal(player.integrity, 0);

  player.integrity = player.maxIntegrity;
  game.invincible = true;
  game.hurt(1);
  assert.equal(player.integrity, player.maxIntegrity);
});

test('hurt() is reported as an event with the next tick, with the integrity actually lost', () => {
  const game = new Game(content());
  game.player.integrity = 2;
  game.hurt(5);
  const [hurt] = game.update(idle);
  assert.deepEqual(hurt, { type: 'hurt', amount: 2 });
  assert.deepEqual(eventTypes(game.update(idle)), []);
});

test('debugJumpRoom cycles through the loaded rooms and wraps around', () => {
  const game = new Game(content());
  assert.equal(game.room.id, 'alpha');
  assert.equal(game.debugJumpRoom(1), true);
  assert.equal(game.room.id, 'beta');
  assert.equal(game.debugJumpRoom(1), true);
  assert.equal(game.room.id, 'gamma');
  assert.equal(game.debugJumpRoom(1), true);
  assert.equal(game.room.id, 'alpha');
  assert.equal(game.debugJumpRoom(-1), true);
  assert.equal(game.room.id, 'gamma');
});

test('debugJumpRoom is ignored during a room transition', () => {
  const game = new Game(content());
  game.transition = { phase: 'out', tick: 0, exit: {} };
  assert.equal(game.debugJumpRoom(1), false);
  assert.equal(game.room.id, 'alpha');
});

test('toggleMovementMode starts grid, flips both ways and announces the change (D38)', () => {
  const game = new Game(content());
  takeMessages();
  assert.equal(game.movementMode, 'grid');

  game.toggleMovementMode();
  assert.equal(game.movementMode, 'screen');
  assert.deepEqual(takeMessages(), [{ key: 'msg.movementScreen', values: undefined }]);

  game.toggleMovementMode();
  assert.equal(game.movementMode, 'grid');
  assert.deepEqual(takeMessages(), [{ key: 'msg.movementGrid', values: undefined }]);
});

test('room objects are built by kind, and their events name the object', () => {
  const game = new Game(
    gameData({ rooms: [roomFile('alpha', { spawn: [2.7, 0, 2.5], objects: [{ id: 'box', type: 'crate', at: [3, 0, 2] }] })] }),
  );
  assert.deepEqual(game.objects.map((object) => [object.id, object.kind, object.constructor.name]), [['box', 'pushable', 'Pushable']]);
  const events = [];
  for (let i = 0; i < 20; i++) events.push(...game.update(hold('down'))); // Down = +x, into the crate
  const push = events.find((event) => event.type === 'push');
  assert.equal(push.object, game.objects[0]);
});
