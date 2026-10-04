import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstancedMesh } from 'three';
import { lineOfSight } from '../src/ai/sight.js';
import { Player } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { moveAxis, overlapsSolid } from '../src/physics/collision.js';
import { resolveBlockTypes } from '../src/data/room-data.js';
import { fenceLayout } from '../src/render/fence.js';
import { nodePoints } from '../src/render/fence-view.js';
import { createRoomView } from '../src/render/room-view.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { BLOCK_TYPES, gameData, grid, idle, input, roomFile } from './helpers.js';

const HITBOX = [0.6, 1.5, 0.6];

/** Segments as sorted strings, for comparing sets of lines. */
const lines = (segments) => segments.map(([a, b]) => `${a}>${b}`).sort();

// ---- layout (D167)

test('fence: a straight run is one stream per level, posts only at its free ends', () => {
  const { beams, rails, posts } = fenceLayout([[1, 0, 2], [2, 0, 2], [3, 0, 2]]);
  assert.deepEqual(lines(beams), lines([[[1, 0.5, 2.5], [4, 0.5, 2.5]]]));
  assert.deepEqual(lines(rails), lines([[[1, 1, 2.5], [4, 1, 2.5]]]), 'the top beam is the rail');
  assert.deepEqual(lines(posts), lines([[[1, 0, 2.5], [1, 1, 2.5]], [[4, 0, 2.5], [4, 1, 2.5]]]));
});

test('fence: a stack has a beam every half unit, the rail on top and posts its full height', () => {
  const { beams, rails, posts } = fenceLayout([[0, 0, 1], [0, 1, 1], [0, 0, 2], [0, 1, 2]]);
  // Along z (the run), through the middle of x.
  assert.deepEqual(lines(beams), lines([0.5, 1, 1.5].map((y) => [[0.5, y, 1], [0.5, y, 3]])));
  assert.deepEqual(lines(rails), lines([[[0.5, 2, 1], [0.5, 2, 3]]]));
  assert.deepEqual(lines(posts), lines([[[0.5, 0, 1], [0.5, 2, 1]], [[0.5, 0, 3], [0.5, 2, 3]]]));
});

test('fence: a corner joins at a post in the middle of its cell', () => {
  const { beams, posts } = fenceLayout([[0, 0, 0], [1, 0, 0], [1, 0, 1]]);
  // Bottom beams: along x from the free end to the corner's middle, then along z.
  assert.deepEqual(lines(beams), lines([[[0, 0.5, 0.5], [1.5, 0.5, 0.5]], [[1.5, 0.5, 0.5], [1.5, 0.5, 2]]]));
  assert.ok(posts.some(([a, b]) => `${a}` === '1.5,0,0.5' && `${b}` === '1.5,1,0.5'), 'corner post');
  assert.equal(posts.length, 3, 'two free ends and the corner');
});

test('fence: a run ending at a block or wall needs no post there', () => {
  const solid = (x, y, z) => x < 0;
  const { posts } = fenceLayout([[0, 0, 3], [1, 0, 3]], solid);
  assert.deepEqual(lines(posts), lines([[[2, 0, 3.5], [2, 1, 3.5]]]));
});

test('fence: a lone cell runs along x, or along z when only a z side meets a wall', () => {
  assert.deepEqual(lines(fenceLayout([[2, 0, 2]]).beams), lines([[[2, 0.5, 2.5], [3, 0.5, 2.5]]]));
  const walled = fenceLayout([[2, 0, 0]], (x, y, z) => z < 0);
  assert.deepEqual(lines(walled.beams), lines([[[2.5, 0.5, 0], [2.5, 0.5, 1]]]));
  assert.equal(walled.posts.length, 1, 'only at the free end');
});

test('fence: a node where each beam meets a post', () => {
  // A 2-high post: beams at 0.5, 1, 1.5 and the rail at 2.
  assert.deepEqual(nodePoints([[[1, 0, 2.5], [1, 2, 2.5]]]), [0.5, 1, 1.5, 2].map((y) => [1, y, 2.5]));
});

// ---- rules

test('fence: solid to bodies, but bolts and sight pass through', () => {
  const g = grid({ blocks: { fence: [[3, 0, 1], [3, 1, 1]] } });
  assert.equal(g.isSolid(3, 0, 1), true);
  assert.equal(g.blocksSight(3, 0, 1), false);
  assert.equal(g.blocksSight(-1, 0, 1), true, 'the room side');
  const box = [[2.9, 3.2], [0.3, 0.6], [1.3, 1.6]];
  assert.equal(overlapsSolid(box, g), true);
  assert.equal(overlapsSolid(box, g, { sight: true }), false);
  assert.equal(lineOfSight([1.5, 0.5, 1.5], [6.5, 0.5, 1.5], g), true);

  const pos = [2, 0, 1.5];
  assert.equal(moveAxis(pos, HITBOX, 0, 0.9, g), true, 'he walks into it');
  assert.ok(Math.abs(pos[0] - 2.7) < 1e-9);
});

test('fence: a 2-high fence stops a jump, and he can stand on a 1-high one', () => {
  const high = grid({ blocks: { fence: [[3, 0, 2], [3, 1, 2]] } });
  const a = new Player([2, 0, 2.5]);
  a.update(input(), high);
  for (let i = 0; i < 60; i++) a.update(i === 0 ? input(['down'], ['jump']) : input(['down']), high);
  assert.equal(a.pos[1], 0);
  assert.ok(a.pos[0] < 3);

  const low = grid({ blocks: { fence: [3, 4, 5].flatMap((x) => [[x, 0, 1], [x, 0, 2], [x, 0, 3]]) } });
  const b = new Player([4.5, 1, 2.5]);
  for (let i = 0; i < 10; i++) b.update(input(), low);
  assert.equal(b.pos[1], 1, 'on top');
  assert.equal(b.grounded, true);
});

test('fence: his Zap flies through a fence and hits the bug behind it', () => {
  const room = roomFile('alpha', {
    blocks: [{ at: [2, 0, 3], type: 'fence' }],
    enemies: [{ id: 'b', template: 'bug', at: [5, 0, 3], variant: { movement: 'stationary' } }],
  });
  const game = new Game(gameData({ rooms: [room] }), { progress: new Progress([saveBit('spells', 0)]) });
  game.player.place([0.5, 0, 3.5]);
  game.player.targetFacing = Math.PI / 2;
  const cast = { down: (a) => a === 'cast', pressed: (a) => a === 'cast' };
  game.update(cast);
  const events = [];
  for (let i = 0; i < 40; i++) events.push(...game.update(idle));
  const [bug] = game.enemies;
  assert.ok(events.some((e) => e.type === 'hit'), 'hit the bug');
  assert.equal(bug.integrity, 1);
});

// ---- look

test('fence: drawn with no faces, and a block beside it keeps its whole outline', () => {
  const blockTypes = resolveBlockTypes(BLOCK_TYPES);
  const view = createRoomView({ size: [4, 3, 4], blocks: { block: [[0, 0, 1]], fence: [[1, 0, 1], [2, 0, 1]] }, blockTypes });
  let instanced = 0;
  view.traverse((node) => {
    if (node instanceof InstancedMesh) instanced += node.count;
  });
  assert.equal(instanced, 1, 'only the plain block has faces');
});
