import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_HITBOX } from '../src/core/rules.js';
import { Game } from '../src/game.js';
import { railSegments } from '../src/render/rails.js';
import { advance, buildTrack, pathCells, positionOf, startState } from '../src/world/path.js';
import { CRATE, LIFT, eventTypes, gameData, hold, idle, roomFile } from './helpers.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/** Units a platform at `speed` covers per tick. */
const perTick = (speed) => speed / 60;

/** Position after `ticks` ticks along the track. */
function after(track, ticks) {
  let state = startState();
  for (let i = 0; i < ticks; i++) state = advance(track, state, perTick(track.speed));
  return positionOf(track, state);
}

test('path: a ping-pong path runs there and back, stopping at both ends', () => {
  const track = buildTrack([1, 0, 1], { points: [[3, 0, 1], [3, 0, 2]], pause: 0.5 });
  assert.deepEqual(
    track.legs.map(({ from, to, stop }) => [from, to, stop]),
    [
      [[1, 0, 1], [3, 0, 1], false],
      [[3, 0, 1], [3, 0, 2], true],
      [[3, 0, 2], [3, 0, 1], false],
      [[3, 0, 1], [1, 0, 1], true],
    ],
  );
  assert.equal(track.pauseTicks, 30);
  assert.equal(track.speed, 2); // the default
});

test('path: a loop runs back to the start and stops only there', () => {
  const track = buildTrack([0, 0, 0], { points: [[2, 0, 0], [2, 0, 2], [0, 0, 2]], mode: 'loop' });
  assert.deepEqual(track.legs.at(-1).to, [0, 0, 0]);
  assert.deepEqual(track.legs.map((leg) => leg.stop), [false, false, false, true]);
});

test('path: corners keep the speed, stops wait out the pause, points are exact', () => {
  const track = buildTrack([0, 0, 0], { points: [[1, 0, 0], [1, 0, 1]], speed: 3, pause: 0.25 });
  // 1 unit at 3 units/s = 20 ticks; the corner costs no time.
  assert.deepEqual(after(track, 20), [1, 0, 0]);
  assert.ok(near(after(track, 30)[2], 0.5));
  assert.deepEqual(after(track, 40), [1, 0, 1]); // the far end
  assert.deepEqual(after(track, 40 + 15), [1, 0, 1]); // pausing 15 ticks
  assert.ok(after(track, 40 + 16)[2] < 1); // on its way back
});

test('path: the cells a path sweeps, each once', () => {
  assert.deepEqual(pathCells([1, 0, 1], { points: [[1, 2, 1], [2, 2, 1]] }), [
    [1, 0, 1],
    [1, 1, 1],
    [1, 2, 1],
    [2, 2, 1],
  ]);
});

test('rails: two rails with ties along the ground, guide posts up a lift, each drawn once', () => {
  const across = railSegments(buildTrack([1, 0, 1], { points: [[4, 0, 1]] }));
  assert.equal(across.length, 4); // 2 rails + 2 ties, though ping-pong runs the leg twice
  assert.ok(across.every(([a, b]) => a[1] === b[1] && a[1] > 0 && a[1] < 0.1));

  const lift = railSegments(buildTrack([1, 0, 1], { points: [[1, 2, 1]] }));
  assert.equal(lift.length, 2);
  for (const [a, b] of lift) assert.deepEqual([a[1], b[1]], [0, 3]); // bottom to the top of the platform at y 2
});

/**
 * A game in one 8×4×8 room with the given objects and blocks, the wizard
 * put at `pos`.
 */
function gameWith({ objects, blocks = [], pos = [0.5, 0, 7.5] }) {
  const game = new Game(
    gameData({ rooms: [roomFile('alpha', { objects, blocks, spawn: [0.5, 0, 7.5] })], objects: { crate: CRATE, lift: LIFT } }),
  );
  game.player.place(pos);
  return game;
}

/** Run the game for `ticks` ticks with `inp`; returns every event. */
function run(game, inp, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(inp));
  return events;
}

test('a platform carries the wizard standing on it', () => {
  // 2 units at 2 units/s along +x: 60 ticks.
  const game = gameWith({ objects: [{ id: 'p', type: 'lift', at: [1, 0, 1], path: { points: [[3, 0, 1]], pause: 1 } }], pos: [1.5, 1, 1.5] });
  run(game, idle, 60);
  const [platform] = game.objects;
  assert.deepEqual(platform.pos, [3, 0, 1]);
  assert.ok(near(game.player.pos[0], 3.5), `wizard at ${game.player.pos}`);
  assert.equal(game.player.pos[1], 1);
  assert.equal(game.player.grounded, true);
});

test('a lift carries the wizard up and down', () => {
  const game = gameWith({ objects: [{ id: 'p', type: 'lift', at: [2, 0, 2], path: { points: [[2, 2, 2]], pause: 0.5 } }], pos: [2.5, 1, 2.5] });
  run(game, idle, 61);
  assert.ok(near(game.player.pos[1], 3), `up: ${game.player.pos}`);
  assert.equal(game.player.grounded, true);
  run(game, idle, 30 + 60);
  assert.ok(near(game.player.pos[1], 1, 1e-3), `down: ${game.player.pos}`);
  assert.equal(game.player.dead, false);
});

test('a platform carries a stack of crates, which stay on whole cells at its stops', () => {
  const game = gameWith({
    objects: [
      { id: 'p', type: 'lift', at: [1, 0, 1], path: { points: [[4, 0, 1]], pause: 1 } },
      { id: 'a', type: 'crate', at: [1, 1, 1] },
      { id: 'b', type: 'crate', at: [1, 2, 1] },
    ],
  });
  run(game, idle, 90);
  const [, a, b] = game.objects;
  assert.deepEqual(a.pos, [4, 1, 1]);
  assert.deepEqual(b.pos, [4, 2, 1]);
});

test('a crate in the way makes a platform wait', () => {
  const game = gameWith({
    objects: [
      { id: 'p', type: 'lift', at: [1, 0, 1], path: { points: [[4, 0, 1]] } },
      { id: 'c', type: 'crate', at: [3, 0, 1] },
    ],
  });
  run(game, idle, 120);
  const [platform, crate] = game.objects;
  assert.deepEqual(platform.pos, [2, 0, 1]); // up against the crate
  assert.deepEqual(crate.pos, [3, 0, 1]);
});

test('a platform shoves the wizard along when it runs into him', () => {
  const game = gameWith({ objects: [{ id: 'p', type: 'lift', at: [1, 0, 3], path: { points: [[4, 0, 3]] } }], pos: [2.5, 0, 3.5] });
  const events = run(game, idle, 60);
  assert.ok(game.player.pos[0] >= game.objects[0].pos[0] + 1.3 - 1e-9, `wizard at ${game.player.pos}`);
  assert.ok(!eventTypes(events).includes('hurt'));
});

test('a platform coming down on the wizard pushes him aside if it only just catches him', () => {
  // He stands under the edge of the platform, 0.2 of him under it.
  const game = gameWith({ objects: [{ id: 'p', type: 'lift', at: [3, 2, 3], path: { points: [[3, 0, 3]] } }], pos: [2.9, 0, 3.5] });
  const events = run(game, idle, 60);
  assert.deepEqual(game.objects[0].pos, [3, 0, 3]);
  assert.ok(game.player.pos[0] <= 2.7 + 1e-9, `wizard at ${game.player.pos}`);
  assert.ok(!eventTypes(events).includes('hurt'));
});

test('a platform squeezing the wizard with no room hurts him and waits; it never kills outright', () => {
  // Right under a platform coming down to the floor.
  const game = gameWith({ objects: [{ id: 'p', type: 'lift', at: [3, 2, 3], path: { points: [[3, 0, 3]], pause: 1 } }], pos: [3.5, 0, 3.5] });
  const { player } = game;
  const events = run(game, idle, 60);
  assert.deepEqual(eventTypes(events).filter((t) => t === 'hurt'), ['hurt']);
  assert.equal(player.integrity, player.maxIntegrity - 1);
  const platform = game.objects[0];
  assert.ok(near(platform.pos[1], 1.5, 0.05), `platform at ${platform.pos}`); // resting on his head
  // Walking out from under it lets it go on.
  run(game, hold('up'), 30);
  run(game, idle, 60);
  assert.deepEqual(platform.pos, [3, 0, 3]);
  assert.equal(player.dead, false);
});

test('a lift carrying the wizard into a ceiling hurts him and waits', () => {
  const game = gameWith({
    objects: [{ id: 'p', type: 'lift', at: [3, 0, 3], path: { points: [[3, 2, 3]] } }],
    blocks: [{ at: [3, 3, 3] }],
    pos: [3.5, 1, 3.5],
  });
  const events = run(game, idle, 60);
  assert.ok(eventTypes(events).includes('hurt'));
  assert.ok(near(game.player.pos[1] + PLAYER_HITBOX[1], 3), `wizard at ${game.player.pos}`); // head against the block
});

test('a crate on a platform between stops cannot be pushed; at a stop it can', () => {
  const game = gameWith({
    objects: [
      { id: 'p', type: 'lift', at: [2, 0, 2], path: { points: [[2, 2, 2]], pause: 2 } },
      { id: 'c', type: 'crate', at: [2, 1, 2] },
    ],
  });
  const [, crate] = game.objects;
  run(game, idle, 15);
  assert.equal(crate.push([1, 0], game), false); // on its way up
  run(game, idle, 50);
  assert.deepEqual(crate.pos, [2, 3, 2]);
  assert.equal(crate.push([1, 0], game), true);
});

test('platforms reset with the room', () => {
  const game = gameWith({ objects: [{ id: 'p', type: 'lift', at: [1, 0, 1], path: { points: [[4, 0, 1]] } }] });
  run(game, idle, 40);
  game.enterRoom('alpha');
  assert.deepEqual(game.objects[0].pos, [1, 0, 1]);
});
