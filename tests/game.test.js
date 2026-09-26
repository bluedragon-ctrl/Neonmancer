import { test } from 'node:test';
import assert from 'node:assert/strict';
import STRINGS from '../data/strings.json' with { type: 'json' };
import { takeMessages } from '../src/core/messages.js';
import { loadGameData } from '../src/data/load.js';
import { Game } from '../src/game.js';

/** Three unconnected rooms, only for debugJumpRoom() to cycle through. */
function content() {
  const room = (id) => ({
    schemaVersion: 1,
    id,
    name: id,
    biome: 'home',
    size: [8, 4, 8],
    spawn: [1.5, 0, 1.5],
  });
  return loadGameData({
    'defs.json': { schemaVersion: 1, objects: {} },
    'biomes.json': { schemaVersion: 1, biomes: { home: { name: 'Home', color: '#ffb020' } } },
    'world.json': { schemaVersion: 1, start: 'alpha', connections: [] },
    'strings.json': structuredClone(STRINGS),
    'rooms/alpha.json': room('alpha'),
    'rooms/beta.json': room('beta'),
    'rooms/gamma.json': room('gamma'),
  });
}

test('hurt() reduces integrity, floored at 0, and does nothing while invincible', () => {
  const game = new Game(content());
  game.hurt(3);
  assert.equal(game.integrity, game.maxIntegrity - 3);
  game.hurt(100);
  assert.equal(game.integrity, 0);

  game.integrity = game.maxIntegrity;
  game.invincible = true;
  game.hurt(1);
  assert.equal(game.integrity, game.maxIntegrity);
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
