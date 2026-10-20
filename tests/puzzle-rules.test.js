import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/core/random.js';
import { Game } from '../src/game.js';
import { wizardCells } from '../src/world/cell-view.js';
import { pushStep, settle, throwLanding } from '../src/world/puzzle-rules.js';
import { RoomModel } from '../src/world/reach.js';
import { buildRoom } from '../src/world/room.js';
import { CRATE, gameData, grid, hold, roomFile } from './helpers.js';

const OBJECTS = { pad: { kind: 'pad', color: '#ff2bd6', launch: 2.2 }, crate: CRATE };
/** Held action → [dx, dz] along the grid axes (D23). */
const DIRS = { up: [-1, 0], down: [1, 0], left: [0, 1], right: [0, -1] };

/** The rule's cells for a grid with no bodies. */
const cellsOf = (g) => wizardCells(g, []);

test('rules: a push goes into the next free cell, never out of the room or into a taken one', () => {
  const g = grid({ cells: [[3, 0, 2]] });
  const free = () => false;
  assert.deepEqual(pushStep(g, [2, 0, 3], [1, 0], free).to, [3, 0, 3]);
  assert.equal(pushStep(g, [7, 0, 3], [1, 0], free), null, 'the room side');
  assert.equal(pushStep(g, [2, 0, 2], [1, 0], (cell) => g.isSolid(...cell)), null, 'a block');
  assert.equal(pushStep(g, [2, 0, 3], [1, 0], () => true), null, 'a body');
});

test('rules: a crate drops to what holds it, and a hole swallows it', () => {
  const below = (x, y) => (y === 0 ? (x === 4 ? 'hole' : 'floor') : y === 1 && x === 2 ? 'solid' : 'air');
  assert.deepEqual(settle([2, 3, 0], below), { cell: [2, 1, 0] });
  assert.deepEqual(settle([3, 2, 0], below), { cell: [3, 0, 0] });
  assert.deepEqual(settle([4, 2, 0], below), { hole: [4, 0] });
});

test('rules: a pad throws him onto the first column ahead he can stand on, level or higher (D274)', () => {
  const pad = [3, 0, 3];
  const flat = grid();
  assert.deepEqual(throwLanding(cellsOf(flat), pad, [1, 0], 2), [4, 0, 3], 'flat floor: the next cell');
  const ledge = (high) => grid({ cells: Array.from({ length: high }, (_, y) => [4, y, 3]) });
  assert.deepEqual(throwLanding(cellsOf(ledge(2)), pad, [1, 0], 2), [4, 2, 3], 'a 2-high ledge next to it');
  assert.equal(throwLanding(cellsOf(ledge(3)), pad, [1, 0], 2), null, 'a 3-high wall: straight up');
  const pit = (width, high) =>
    grid({
      holes: Array.from({ length: width }, (_, k) => [4 + k, 3]),
      cells: Array.from({ length: high }, (_, y) => [4 + width, y, 3]),
    });
  assert.deepEqual(throwLanding(cellsOf(pit(1, 0)), pad, [1, 0], 2), [5, 0, 3], 'over a 1-tile pit');
  assert.deepEqual(throwLanding(cellsOf(pit(1, 2)), pad, [1, 0], 2), [5, 2, 3], 'over a 1-tile pit, 2 up');
  assert.deepEqual(throwLanding(cellsOf(pit(2, 1)), pad, [1, 0], 2), [6, 1, 3], 'over 2 tiles, 1 up');
  assert.equal(throwLanding(cellsOf(pit(2, 2)), pad, [1, 0], 2), null, 'over 2 tiles never 2 up');
  assert.equal(throwLanding(cellsOf(pit(3, 0)), pad, [1, 0], 2), null, 'never over 3 tiles');
  assert.equal(throwLanding(cellsOf(flat), pad, [1, 0], 0), null, 'no launch, no throw');
});

test('rules: off a ledge with nothing at its level ahead, the farthest landing below', () => {
  // The pad on a 1-high plateau at x 0..3; the floor beyond it.
  const g = grid({ cells: Array.from({ length: 4 }, (_, x) => [x, 0, 3]) });
  assert.deepEqual(throwLanding(cellsOf(g), [3, 1, 3], [1, 0], 2), [6, 0, 3]);
});

/** A small random room round a pad at [3, 0, 3]: blocks up to 3 high and holes within 3 cells of it. */
function randomRoom(seed) {
  const random = seededRandom(seed);
  const blocks = [];
  const holes = [];
  for (let x = 0; x < 8; x++) {
    for (let z = 0; z < 8; z++) {
      if ((x === 3 && z === 3) || Math.abs(x - 3) + Math.abs(z - 3) > 3) continue;
      const roll = random();
      if (roll < 0.2) holes.push({ at: [x, z] });
      else if (roll < 0.5) blocks.push({ at: [x, 0, z], to: [x, Math.floor(random() * 3), z] });
    }
  }
  return roomFile('r', { size: [8, 5, 8], spawn: [3.5, 0, 3.5], blocks, holes, objects: [{ id: 'pad', type: 'pad', at: [3, 0, 3] }] });
}

/** Stand him on the pad holding `action` from the first tick; the cell of his first landing ([x, y, z]), or null if he fell in. */
function playThrow(file, action) {
  const game = new Game(gameData({ rooms: [file], objects: OBJECTS }));
  let launched = false;
  for (let i = 0; i < 240; i++) {
    game.update(hold(action));
    if (game.player.dead) return null;
    launched ||= !game.player.grounded;
    if (launched && game.player.grounded) return game.player.pos.map((v, axis) => (axis === 1 ? Math.round(v) : Math.floor(v)));
  }
  return 'still flying';
}

test('rules: the game lands him where the rule says, and the checker reads the same cells (random rooms)', () => {
  let thrown = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const file = randomRoom(seed);
    const content = gameData({ rooms: [file], objects: OBJECTS });
    const model = new RoomModel(buildRoom(content.rooms.get('r'), content), new Set());
    const cfg = model.config(model.crates, new Set());
    const checker = { blocked: (x, y, z) => model.blocked(x, y, z, cfg), landing: (x, y, z) => model.landing(x, y, z, cfg) };
    const game = new Game(content);
    const view = wizardCells(game.grid, game.solids);
    for (const [action, dir] of Object.entries(DIRS)) {
      const rule = throwLanding(view, [3, 0, 3], dir, 2);
      assert.deepEqual(throwLanding(checker, [3, 0, 3], dir, 2), rule, `seed ${seed} ${action}: the checker's cells`);
      assert.deepEqual(playThrow(file, action), rule ?? [3, 0, 3], `seed ${seed} ${action}: the game's landing`);
      if (rule) thrown++;
    }
  }
  assert.ok(thrown > 60, `enough throws that go somewhere (${thrown})`);
});

test('rules: walked onto a pad from its side, he turns the throw while he rises (D274)', () => {
  // A 2-high ledge at x 0..1; the pad at [3, 0, 3] beside a 1-tile pit at x 2.
  const file = roomFile('r', {
    size: [8, 5, 8],
    spawn: [3.5, 0, 6.5],
    blocks: [{ at: [0, 0, 0], to: [1, 1, 7] }],
    holes: [{ at: [2, 0], to: [2, 7] }],
    objects: [{ id: 'pad', type: 'pad', at: [3, 0, 3] }],
  });
  const game = new Game(gameData({ rooms: [file], objects: OBJECTS }));
  let launched = false;
  for (let i = 0; i < 300 && !(launched && game.player.grounded); i++) {
    game.update(hold(launched ? 'up' : 'right'));
    launched ||= game.player.pos[1] > 0.05;
  }
  assert.deepEqual(game.player.pos.map((v, axis) => (axis === 1 ? Math.round(v) : Math.floor(v))), [1, 2, 3]);
});
