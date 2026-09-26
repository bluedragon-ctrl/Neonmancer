import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, Player } from '../src/entities/player.js';
import { Pushable } from '../src/entities/pushable.js';
import { Grid } from '../src/world/grid.js';

/**
 * A tiny world like Game: grid, pushables and the player, updated in the
 * game's order (player → push → objects, lowest first).
 */
function world({ size = [8, 4, 8], cells = [], holes = [], crates = [], spawn = [0.5, 0, 0.5] } = {}) {
  const grid = new Grid({ size, cells, holes });
  const pushables = crates.map((at, i) => new Pushable({ id: `c${i}`, at }));
  const player = new Player(spawn);
  const w = { grid, pushables, player, bodies: [...pushables, player], events: [] };
  w.tick = (inp = idle) => {
    const e = player.update(inp, grid, { bodies: pushables });
    if (e) w.events.push(e);
    if (player.pushIntent && player.pushIntent.body.push(player.pushIntent.dir, w)) w.events.push('push');
    for (const p of [...pushables].sort((a, b) => a.pos[1] - b.pos[1])) {
      const pe = p.update(w);
      if (pe) w.events.push(pe);
    }
  };
  w.run = (inp, ticks) => {
    for (let i = 0; i < ticks; i++) w.tick(inp);
  };
  return w;
}

const idle = { down: () => false, pressed: () => false };
const hold = (action) => ({ down: (a) => a === action, pressed: () => false });

test('objects rest on the floor and on each other, falling when unsupported', () => {
  const w = world({ crates: [[3, 0, 3], [3, 2, 3], [5, 3, 5]] });
  w.run(idle, 60);
  assert.deepEqual(w.pushables[1].pos, [3, 1, 3]); // stacked on the first
  assert.deepEqual(w.pushables[2].pos, [5, 0, 5]);
  assert.ok(w.events.includes('land'));
  assert.ok(w.pushables.every((p) => p.state === 'rest'));
});

test('walking into an object pushes it one cell after a short delay', () => {
  // Down = +x (D23). The wizard touches the crate from the west, lined up with it.
  const w = world({ crates: [[3, 0, 2]], spawn: [2.7, 0, 2.5] });
  w.run(idle, 3);
  w.run(hold('down'), PLAYER.pushDelay - 1);
  assert.equal(w.pushables[0].state, 'rest');
  w.run(hold('down'), 2);
  assert.equal(w.pushables[0].state, 'slide');
  w.run(idle, 40);
  assert.deepEqual(w.pushables[0].pos, [4, 0, 2]);
});

test('holding the direction keeps pushing, cell after cell', () => {
  const w = world({ crates: [[2, 0, 2]], spawn: [1.7, 0, 2.5] });
  w.run(hold('down'), 90);
  assert.ok(w.pushables[0].pos[0] >= 4, `crate at ${w.pushables[0].pos}`);
  assert.equal(w.pushables[0].pos[2], 2); // stays on its row
});

test('grazing an object at its corner does not push it', () => {
  // Wizard center z = 1.9 is outside the crate's z span [2, 3].
  const w = world({ crates: [[3, 0, 2]], spawn: [2.7, 0, 1.9] });
  w.run(hold('down'), 40);
  assert.deepEqual(w.pushables[0].pos, [3, 0, 2]);
});

test('an object with something on top cannot be pushed (D4)', () => {
  const w = world({ crates: [[3, 0, 2], [3, 1, 2]], spawn: [2.7, 0, 2.5] });
  w.run(hold('down'), 60);
  assert.deepEqual(w.pushables[0].pos, [3, 0, 2]);
  assert.deepEqual(w.pushables[1].pos, [3, 1, 2]);
});

test('an object cannot be pushed into a block, the wall or another object', () => {
  const block = world({ cells: [[4, 0, 2]], crates: [[3, 0, 2]], spawn: [2.7, 0, 2.5] });
  block.run(hold('down'), 60);
  assert.deepEqual(block.pushables[0].pos, [3, 0, 2]);

  const wall = world({ crates: [[7, 0, 2]], spawn: [6.7, 0, 2.5] });
  wall.run(hold('down'), 60);
  assert.deepEqual(wall.pushables[0].pos, [7, 0, 2]);

  const pair = world({ crates: [[3, 0, 2], [4, 0, 2]], spawn: [2.7, 0, 2.5] });
  pair.run(hold('down'), 60);
  assert.deepEqual(pair.pushables[0].pos, [3, 0, 2]); // no chain pushing
});

test('an object pushed off a ledge falls and lands below', () => {
  // Crate on a 1-high platform at x = 2..3; the wizard stands on it too.
  const cells = [[1, 0, 2], [2, 0, 2], [3, 0, 2]];
  const w = world({ cells, crates: [[3, 1, 2]], spawn: [2.7, 1, 2.5] });
  w.run(idle, 3);
  w.run(hold('down'), PLAYER.pushDelay + 2);
  w.run(idle, 60);
  assert.deepEqual(w.pushables[0].pos, [4, 0, 2]);
  assert.ok(w.events.includes('land'));
});

test('an object pushed onto a hole drops in and fills it (D18)', () => {
  const w = world({ holes: [[4, 2]], crates: [[3, 0, 2]], spawn: [2.7, 0, 2.5] });
  w.run(idle, 3);
  w.run(hold('down'), PLAYER.pushDelay + 2);
  w.run(idle, 60);
  const crate = w.pushables[0];
  assert.equal(crate.state, 'plugged');
  assert.deepEqual(crate.pos, [4, -1, 2]);
  assert.equal(w.grid.isHole(4.5, 2.5), false);
  assert.ok(w.events.includes('plug'));
});

test('the wizard walks safely over a filled hole', () => {
  const w = world({ holes: [[4, 2]], crates: [[3, 0, 2]], spawn: [2.7, 0, 2.5] });
  w.run(idle, 3);
  w.run(hold('down'), PLAYER.pushDelay + 2); // crate into the hole
  w.run(idle, 60);
  w.run(hold('down'), 40); // walk on over it
  assert.equal(w.player.dead, false);
  assert.ok(w.player.pos[0] > 4.5);
  assert.equal(w.player.pos[1], 0);
});

test('the wizard stands on objects and they carry his drop shadow', () => {
  const w = world({ crates: [[3, 0, 2]], spawn: [3.5, 1.5, 2.5] });
  w.run(idle, 30);
  assert.equal(w.player.pos[1], 1);
  assert.equal(w.player.grounded, true);
});

test('an object falling onto the wizard rests on him and falls on when he leaves', () => {
  const w = world({ crates: [[3, 3, 2]], spawn: [3.5, 0, 2.5] });
  w.run(idle, 40);
  const crate = w.pushables[0];
  assert.equal(crate.state, 'rest');
  assert.ok(Math.abs(crate.pos[1] - 1.5) < 1e-9);
  w.run(hold('up'), 40); // Up = −x: walk out from under it
  w.run(idle, 30);
  assert.deepEqual(crate.pos, [3, 0, 2]);
});

test('holding the key while the object reaches a hole: it drops in, not over it', () => {
  // A 2-long pit: the first push onto it must not chain into a second one.
  const w = world({ holes: [[4, 2], [5, 2]], crates: [[3, 0, 2]], spawn: [2.7, 0, 2.5] });
  w.run(idle, 3);
  w.run(hold('down'), PLAYER.pushDelay + 45);
  assert.deepEqual(w.pushables[0].pos, [4, -1, 2]);
  assert.equal(w.pushables[0].state, 'plugged');
  assert.equal(w.grid.isHole(5.5, 2.5), true);
});
