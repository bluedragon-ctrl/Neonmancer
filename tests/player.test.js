import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundBelow, moveAxis } from '../src/physics/collision.js';
import { JUMP_SPEED, PLAYER, Player } from '../src/entities/player.js';
import { Grid } from '../src/world/grid.js';
import { lerpAngle, lerpPosition, shadowScale } from '../src/render/interp.js';
import { WIZARD, wizardParts } from '../src/render/wizard.js';

const HITBOX = [0.6, 1.5, 0.6];

/** A room with the given block cells and hole tiles. */
function grid({ size = [8, 4, 8], cells = [], holes = [] } = {}) {
  return new Grid({ size, cells, holes });
}

/** Fake input: `held` actions are down every tick; `tap` is pressed on the first tick only. */
function input(held = [], tap = []) {
  let first = true;
  return {
    down: (a) => held.includes(a) || (first && tap.includes(a)),
    pressed: (a) => first && tap.includes(a),
    next() {
      first = false;
    },
  };
}

/** Run the player for `ticks` ticks; returns the events. */
function run(player, g, inp, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) {
    const e = player.update(inp, g);
    if (e) events.push(e);
    inp.next?.();
  }
  return events;
}

/** Let a fresh player settle on the ground. */
function standing(g, spawn) {
  const player = new Player(spawn);
  run(player, g, input(), 5);
  assert.equal(player.grounded, true);
  return player;
}

test('grid: room sides and the space below the floor are solid, above is open', () => {
  const g = grid({ cells: [[2, 0, 3]] });
  assert.equal(g.isSolid(2, 0, 3), true);
  assert.equal(g.isSolid(2, 1, 3), false);
  assert.equal(g.isSolid(-1, 0, 0), true);
  assert.equal(g.isSolid(8, 0, 0), true);
  assert.equal(g.isSolid(0, 0, 8), true);
  assert.equal(g.isSolid(0, -1, 0), true);
  assert.equal(g.isSolid(0, 4, 0), false);
});

test('grid: holes are found by point and can be filled', () => {
  const g = grid({ holes: [[5, 6]] });
  assert.equal(g.isHole(5.5, 6.9), true);
  assert.equal(g.isHole(4.99, 6.5), false);
  g.fillHole(5, 6);
  assert.equal(g.isHole(5.5, 6.5), false);
});

test('moveAxis stops at a block face and at the room side', () => {
  const g = grid({ cells: [[3, 0, 1]] });
  const pos = [2, 0, 1.5];
  assert.equal(moveAxis(pos, HITBOX, 0, 0.9, g), true);
  assert.ok(Math.abs(pos[0] - 2.7) < 1e-9);
  // Touching the face is not a collision: moving away works.
  assert.equal(moveAxis(pos, HITBOX, 0, -0.2, g), false);

  const edge = [0.5, 0, 1.5];
  moveAxis(edge, HITBOX, 0, -0.5, g);
  assert.ok(Math.abs(edge[0] - 0.3) < 1e-9);
});

test('moveAxis lands on block tops and hits ceilings', () => {
  const g = grid({ cells: [[1, 0, 1], [1, 3, 1]] });
  const pos = [1.5, 1.2, 1.5];
  assert.equal(moveAxis(pos, HITBOX, 1, -0.3, g), true);
  assert.equal(pos[1], 1);
  // Head (1.5 tall) against the block at y = 3.
  assert.equal(moveAxis(pos, HITBOX, 1, 0.8, g), true);
  assert.ok(Math.abs(pos[1] - 1.5) < 1e-9);
});

test('groundBelow finds the highest surface under the footprint', () => {
  const g = grid({ cells: [[1, 0, 1], [2, 0, 1], [2, 1, 1]] });
  assert.equal(groundBelow([1.5, 3, 1.5], HITBOX, g), 1);
  assert.equal(groundBelow([2, 3, 1.5], HITBOX, g), 2); // footprint over both columns
  assert.equal(groundBelow([5.5, 3, 5.5], HITBOX, g), 0);
  assert.equal(groundBelow([5.5, 1.5, 5.5], HITBOX, g), 0);
});

test('player walks along grid axes: Right = −z (up-right), Up = −x (up-left)', () => {
  const g = grid();
  const player = standing(g, [4, 0, 4]);
  run(player, g, input(['right']), 30);
  assert.ok(Math.abs(player.pos[2] - (4 - PLAYER.speed / 2)) < 1e-6);
  assert.equal(player.pos[0], 4);
  run(player, g, input(['up']), 10);
  assert.ok(player.pos[0] < 4);
  run(player, g, input(['down']), 20);
  run(player, g, input(['left']), 20);
  assert.ok(player.pos[0] > 4 && player.pos[2] > 4 - PLAYER.speed / 2);
});

test('diagonal movement is not faster than straight movement', () => {
  const g = grid({ size: [16, 4, 16] });
  const player = standing(g, [8, 0, 8]);
  run(player, g, input(['down', 'right']), 30);
  const distance = Math.hypot(player.pos[0] - 8, player.pos[2] - 8);
  assert.ok(Math.abs(distance - PLAYER.speed / 2) < 1e-6);
});

test('screen-relative movement: up moves straight up-screen (both −x and −z)', () => {
  const g = grid({ size: [16, 4, 16] });
  const player = standing(g, [8, 0, 8]);
  const inp = input(['up']);
  for (let i = 0; i < 30; i++) {
    player.update(inp, g, { movementMode: 'screen' });
    inp.next();
  }
  assert.ok(player.pos[0] < 8 && player.pos[2] < 8, 'moved toward -x and -z');
  assert.ok(Math.abs((8 - player.pos[0]) - (8 - player.pos[2])) < 1e-9, 'equal parts of each axis');
});

test('screen-relative movement: two adjacent screen keys collapse to one grid axis', () => {
  const g = grid({ size: [16, 4, 16] });
  const player = standing(g, [8, 0, 8]);
  const inp = input(['up', 'right']); // screen up-right collapses to grid Right (−z only)
  for (let i = 0; i < 30; i++) {
    player.update(inp, g, { movementMode: 'screen' });
    inp.next();
  }
  assert.equal(player.pos[0], 8);
  assert.ok(player.pos[2] < 8);
  assert.ok(Math.abs((8 - player.pos[2]) - PLAYER.speed / 2) < 1e-6, 'full grid-axis speed, not slower');
});

test('a jump peaks at jumpHeight: clears one block, never two (D3)', () => {
  assert.ok(Math.abs(JUMP_SPEED ** 2 / (2 * PLAYER.gravity) - PLAYER.jumpHeight) < 1e-9);

  const g = grid();
  const player = standing(g, [4, 0, 4]);
  let apex = 0;
  const inp = input([], ['jump']);
  for (let i = 0; i < 90; i++) {
    player.update(inp, g);
    inp.next();
    apex = Math.max(apex, player.pos[1]);
  }
  assert.ok(apex > 1.15 && apex <= PLAYER.jumpHeight + 1e-9, `apex ${apex}`);
  assert.equal(player.grounded, true);
});

test('the player jumps onto a 1-high block but not onto a 2-high one', () => {
  // A wide step, so the wizard doesn't walk off the far side.
  const low = grid({ cells: [3, 4, 5, 6].flatMap((x) => [[x, 0, 1], [x, 0, 2], [x, 0, 3]]) });
  const a = standing(low, [2, 0, 2.5]);
  run(a, low, input(['down'], ['jump']), 40);
  assert.equal(a.pos[1], 1);
  assert.ok(a.pos[0] > 3);

  const high = grid({ cells: [[3, 0, 2], [3, 1, 2]] });
  const b = standing(high, [2, 0, 2.5]);
  run(b, high, input(['down'], ['jump']), 60);
  assert.equal(b.pos[1], 0);
  assert.ok(Math.abs(b.pos[0] - 2.7) < 1e-9);
});

test('a jump pressed just before landing still happens (buffer)', () => {
  const g = grid();
  const player = new Player([4, 0.1, 4]); // spawned just above the floor, falls
  const events = run(player, g, input([], ['jump']), 30);
  assert.deepEqual(events.slice(0, 2), ['land', 'jump']);
});

test('standing on a hole kills the player, who respawns at the spawn', () => {
  const g = grid({ holes: [[5, 4]] });
  const player = standing(g, [3.5, 0, 4.5]);
  const events = run(player, g, input(['down']), 40); // Down = +x
  assert.ok(events.includes('die'));
  assert.equal(player.dead, true);

  const later = run(player, g, input(), PLAYER.deathTicks);
  assert.ok(later.includes('respawn'));
  assert.equal(player.dead, false);
  assert.deepEqual(player.pos, [3.5, 0, 4.5]);
});

test('a room reset point is independent of where the wizard entered, and he falls if it is above the floor (D39)', () => {
  const g = grid({ holes: [[5, 4]] });
  // He entered far from the room's own reset point.
  const player = new Player([3.5, 0, 4.5], [1, 2, 1]);
  const inp = input(['down']); // walks himself onto the hole
  let respawned = false;
  for (let i = 0; i < 200 && !respawned; i++) {
    respawned = player.update(inp, g) === 'respawn';
    inp.next();
  }
  // Checked the instant he respawns: nothing has moved him since (D39: not
  // the tile he entered on, and not the tile he died on either).
  assert.ok(respawned);
  assert.deepEqual(player.pos, [1, 2, 1]);
  assert.equal(player.grounded, false); // above the floor: falling, not standing

  run(player, g, input(), 30);
  assert.equal(player.grounded, true);
  assert.equal(player.pos[1], 0);
});

test('debug invincibility: standing on a hole never kills', () => {
  const g = grid({ holes: [[5, 4]] });
  const player = standing(g, [3.5, 0, 4.5]);
  const events = [];
  const inp = input(['down']);
  for (let i = 0; i < 40; i++) {
    events.push(player.update(inp, g, { invincible: true })); // Down = +x, invincible
    inp.next();
  }
  assert.ok(!events.includes('die'));
  assert.equal(player.dead, false);
  assert.ok(player.pos[0] > 5, 'walked straight across the hole');
});

test('grazing a hole edge is safe, and jumping over one is too', () => {
  const g = grid({ holes: [[5, 4]] });
  // Center stays on x < 5: the hitbox overlaps the hole but the player lives.
  const edge = standing(g, [4.8, 0, 4.5]);
  run(edge, g, input(), 10);
  assert.equal(edge.dead, false);

  const jumper = standing(g, [4.6, 0, 4.5]);
  const events = run(jumper, g, input(['down'], ['jump']), 40);
  assert.ok(!events.includes('die'), events.join());
  assert.ok(jumper.pos[0] > 6);
});

test('a jump crosses a 1-tile hole but never a 2-tile one on the same level (D34)', () => {
  // Start as close to the edge as possible without dying (center on the last safe tile).
  const wide = grid({ holes: [[5, 4], [6, 4]] });
  const far = standing(wide, [4.99, 0, 4.5]);
  const events = run(far, wide, input(['down'], ['jump']), 60);
  assert.ok(events.includes('die'), 'a 2-tile hole is too wide to jump');

  // A sloppy take-off half a tile back still clears a 1-tile hole.
  const narrow = grid({ holes: [[5, 4]] });
  const near = standing(narrow, [4.5, 0, 4.5]);
  assert.ok(!run(near, narrow, input(['down'], ['jump']), 60).includes('die'));
});

test('interpolation helpers', () => {
  assert.deepEqual(lerpPosition([0, 0, 0], [2, 4, -2], 0.5), [1, 2, -1]);
  // The short way round across ±π.
  const angle = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
  assert.ok(Math.abs(Math.abs(angle) - Math.PI) < 1e-9);
  assert.deepEqual(shadowScale(0), { scale: 1, opacity: 1 });
  assert.ok(shadowScale(2).scale < 1);
});

test('wizard: hat reaches above the hitbox, body fits inside it, hands float beside', () => {
  const { main, hat } = wizardParts();
  const tip = hat.find((p) => p.r1 === 0);
  assert.ok(WIZARD.brim.y + tip.center[1] + tip.height / 2 > HITBOX[1], 'the hat towers over the hitbox');
  const body = main.find((p) => p.role === 'body');
  assert.ok(body.r0 <= HITBOX[0] / 2);
  const hands = main.filter((p) => p.shape === 'ball' && p.center[0] !== 0);
  assert.equal(hands.length, 2);
  assert.ok(hands.every((p) => Math.abs(p.center[0]) > body.r0));
});
