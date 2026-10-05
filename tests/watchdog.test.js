import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT } from '../src/core/loop.js';
import { takeMessages } from '../src/core/messages.js';
import { PLAYER } from '../src/entities/player.js';
import { Game, TRANSITION, WATCHDOG } from '../src/game.js';
import { formatTime, roomTimerState } from '../src/ui/room-timer.js';
import { eventTypes, gameData, idle, roomFile } from './helpers.js';

const SECOND = Math.round(1 / DT);

/** Two rooms: "timed" (the start) with a watchdog timer of `seconds` (D171), "calm" without. */
function content(seconds = 10) {
  return gameData({ rooms: [roomFile('timed', { timer: seconds }), roomFile('calm')] });
}

/** Run `ticks` idle ticks; their events. */
function run(game, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(idle));
  return events;
}

test('a room without a timer has none; one with a timer arms it on entry and says so', () => {
  takeMessages();
  const game = new Game(content(10));
  assert.equal(game.timeLeft, 10 * SECOND);
  assert.deepEqual(takeMessages().find(({ key }) => key === 'msg.watchdog').values, { seconds: 10 });
  game.enterRoom('calm');
  assert.equal(game.timeLeft, null);
  assert.equal(roomTimerState(game), null);
});

test('the timer runs once the room has faded in, and stands still while he is invincible', () => {
  const game = new Game(content(10));
  game.transition = { phase: 'in', tick: 0 };
  run(game, TRANSITION.inTicks - 1);
  assert.equal(game.timeLeft, 10 * SECOND, 'held during the fade-in');
  run(game, 1);
  assert.equal(game.timeLeft, 10 * SECOND - 1);
  game.invincible = true;
  run(game, SECOND);
  assert.equal(game.timeLeft, 10 * SECOND - 1);
});

test('at zero he dies of a timeout, uses a backup, and his respawn resets the room and the timer', () => {
  const game = new Game(content(3));
  takeMessages();
  const events = run(game, 3 * SECOND);
  assert.deepEqual(events.find((event) => event.type === 'die'), { type: 'die', cause: 'timeout' });
  assert.equal(game.player.deathCause, 'timeout');
  assert.equal(game.player.backups, PLAYER.backups - 1);
  assert.ok(takeMessages().some(({ key }) => key === 'msg.timeout'));
  // Dead, the timer waits at zero; the respawn starts it over.
  const after = eventTypes(run(game, PLAYER.deathTicks + 1));
  assert.ok(after.includes('respawn'));
  assert.equal(game.room.id, 'timed');
  assert.ok(game.timeLeft > 3 * SECOND - 5, 'full again after the respawn');
});

test('its last seconds tick once a second', () => {
  const game = new Game(content(8));
  const ticks = run(game, 8 * SECOND - 1).filter((event) => event.type === 'tick');
  assert.equal(ticks.length, WATCHDOG.warnTicks / SECOND, 'at 5, 4, 3, 2 and 1 s left');
});

test('leaving the room drops the timer; coming back starts it from full', () => {
  const game = new Game(content(10));
  run(game, 2 * SECOND);
  game.enterRoom('calm');
  assert.equal(game.timeLeft, null);
  game.enterRoom('timed');
  assert.equal(game.timeLeft, 10 * SECOND);
});

test('the HUD shows minutes, seconds and tenths, rounded up, red in the last seconds', () => {
  assert.equal(formatTime(90), '1:30.0');
  assert.equal(formatTime(27.41), '0:27.5');
  assert.equal(formatTime(0.05), '0:00.1');
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime((10 * SECOND - 1) * DT), '0:10.0');
  const game = new Game(content(10));
  assert.deepEqual(roomTimerState(game), { text: '0:10.0', warn: false });
  game.timeLeft = WATCHDOG.warnTicks;
  assert.equal(roomTimerState(game).warn, true);
});
