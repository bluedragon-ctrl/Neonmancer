import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseEnemy } from '../src/combat.js';
import { lineOfSight } from '../src/ai/sight.js';
import { Game } from '../src/game.js';
import { pasteCell } from '../src/entities/clip.js';
import { Player } from '../src/entities/player.js';
import { Pushable } from '../src/entities/pushable.js';
import { pullTarget } from '../src/entities/pull.js';
import { OPPOSITE_SIDE, resolveBlockTypes } from '../src/data/room-data.js';
import { blockTypeText } from '../src/editor/panel.js';
import { buildRoom } from '../src/world/room.js';
import { analyzeRoom } from '../src/world/reach.js';
import { BLOCK_TYPES, BUG, CRATE, gameData, grid as makeGrid, hold, idle, input, roomFile } from './helpers.js';

/**
 * The crate stream (D198): a fence only crates and frozen enemies cross.
 * Built 2 high; for the wizard and active enemies its field reaches up to
 * the ceiling, so it has no top to stand on or climb over.
 */

/** A 2-high stream wall in the column x of the row z. */
const wall = (x, z = 2) => [[x, 0, z], [x, 1, z]];

/** A tiny world like pushable.test.js: grid, crates and the player. */
function world({ blocks = {}, cells = [], crates = [], spawn = [0.5, 0, 2.5] } = {}) {
  const grid = makeGrid({ cells, blocks });
  const pushables = crates.map((at, i) => new Pushable({ id: `c${i}`, at }));
  const player = new Player(spawn);
  const w = { grid, pushables, player, bodies: [...pushables, player] };
  w.tick = (inp = idle) => {
    player.update(inp, grid, { bodies: pushables });
    if (player.pushIntent) player.pushIntent.body.push(player.pushIntent.dir, w);
    for (const p of [...pushables].sort((a, b) => a.pos[1] - b.pos[1])) p.update(w);
  };
  w.run = (inp, ticks) => {
    for (let i = 0; i < ticks; i++) w.tick(inp);
  };
  return w;
}

/** A 12×4×8 game with `props`; no spells needed. */
function gameWith(props = {}) {
  const STILL = { ...BUG, movement: 'stationary' };
  const rooms = [roomFile('alpha', { size: [12, 4, 8], spawn: [0.5, 0, 7.5], ...props })];
  return new Game(gameData({ rooms, objects: { crate: CRATE }, enemies: { bug: BUG, still: STILL } }));
}

test('stream: each kind of body sees the grid its own way', () => {
  const g = makeGrid({ blocks: { stream: wall(4) } });
  assert.equal(g.forBody('wizard'), g.forBody('wizard'));
  assert.equal(g.isSolid(4, 0, 2), true, 'the wizard has the grid as it is');
  const crate = g.forBody('crate');
  assert.equal(crate.isSolid(4, 0, 2), false, 'open to a crate');
  assert.equal(crate.isSolid(4, 1, 2), false);
  assert.equal(crate.isSolid(-1, 0, 2), true, 'the room side is still solid');
  assert.equal(makeGrid({ cells: [[1, 0, 1]] }).forBody('crate').isSolid(1, 0, 1), true, 'a plain block too');
  assert.equal(g.forBody('crate'), crate, 'made once');
});

test('stream: its field reaches the ceiling for the wizard, so it has no top', () => {
  const g = makeGrid({ blocks: { stream: wall(4) } });
  assert.equal(g.isSolid(4, 2, 2), true);
  assert.equal(g.isSolid(4, 3, 2), true);
  assert.equal(g.forBody('crate').isSolid(4, 3, 2), false);
  assert.equal(g.isSolid(4, 3, 3), false, 'only its own column');
  assert.equal(g.blocksSight(4, 3, 2), false, 'sight still passes');
});

test('stream: a crate pushed into it and on through it', () => {
  const w = world({ blocks: { stream: wall(4) }, crates: [[3, 0, 2]], spawn: [2.7, 0, 2.5] });
  w.run(hold('down'), 120);
  const [crate] = w.pushables;
  assert.ok(crate.pos[0] >= 5, `crate at ${crate.pos}`);
  assert.ok(w.player.pos[0] < 4 - 0.3 + 1e-6, `he stays out of it: ${w.player.pos}`);
});

test('stream: a crate rests inside it and is pushed on from either side', () => {
  const w = world({ blocks: { stream: wall(4) }, crates: [[4, 0, 2]], spawn: [2.7, 0, 2.5] });
  w.run(hold('down'), 60);
  assert.ok(w.pushables[0].pos[0] >= 5, 'pushed on from the west');
  const back = world({ blocks: { stream: wall(4) }, crates: [[4, 0, 2]], spawn: [5.3, 0, 2.5] });
  back.run(hold('up'), 60);
  assert.ok(back.pushables[0].pos[0] <= 3, 'and from the east');
});

test('stream: the wizard is stopped, with a jump or a block under him', () => {
  const a = world({ blocks: { stream: wall(4) } });
  a.run(hold('down'), 90);
  assert.ok(a.player.pos[0] < 3.7 + 1e-6, 'walking');
  const b = world({ blocks: { stream: wall(4) } });
  for (let i = 0; i < 90; i++) b.tick(i % 30 === 0 ? input(['down'], ['jump']) : input(['down']));
  assert.ok(b.player.pos[0] < 3.7 + 1e-6 && b.player.pos[1] < 2, `jumping: ${b.player.pos}`);
  // From a 1-high block a jump reaches 2, the top of a 2-high stream: no way on.
  const c = world({ cells: [[3, 0, 2]], blocks: { stream: wall(4) }, spawn: [3.5, 1, 2.5] });
  for (let i = 0; i < 90; i++) c.tick(i % 20 === 0 ? input(['down'], ['jump']) : input(['down']));
  assert.ok(c.player.pos[0] < 3.7 + 1e-6, `from a block: ${c.player.pos}`);
});

test('stream: a crate inside it is no step for him', () => {
  const w = world({ cells: [[3, 0, 2]], blocks: { stream: wall(4) }, crates: [[4, 0, 2]], spawn: [3.5, 1, 2.5] });
  for (let i = 0; i < 90; i++) w.tick(i % 20 === 0 ? input(['down'], ['jump']) : input(['down']));
  assert.ok(w.player.pos[0] < 3.7 + 1e-6, `he is still on the block: ${w.player.pos}`);
  assert.deepEqual(w.pushables[0].pos, [4, 0, 2], 'the crate stays');
});

test('stream: a crate over a gap falls through its cell like through air', () => {
  const w = world({ blocks: { stream: wall(4) }, crates: [[4, 2, 2]] });
  w.run(idle, 60);
  assert.deepEqual(w.pushables[0].pos, [4, 0, 2]);
  assert.equal(w.pushables[0].state, 'rest');
});

test('stream: bolts and sight pass, as through any fence', () => {
  const g = makeGrid({ blocks: { stream: wall(4) } });
  assert.equal(g.blocksSight(4, 0, 2), false);
  assert.equal(lineOfSight([1.5, 0.5, 2.5], [6.5, 0.5, 2.5], g), true);
});

test('stream: an active enemy is stopped, a frozen one is a block that goes through', () => {
  const game = gameWith({ blocks: [{ at: [4, 0, 3], type: 'stream' }, { at: [4, 1, 3], type: 'stream' }], enemies: [{ id: 'b', template: 'still', at: [3, 0, 3] }] });
  const [bug] = game.enemies;
  assert.equal(bug.blockedAt([4, 0, 3], game), true, 'awake');
  pauseEnemy(game, bug, 300);
  assert.equal(bug.blockedAt([4, 0, 3], game), false, 'frozen');
  assert.equal(bug.push([1, 0], game), true);
  for (let i = 0; i < 60; i++) game.update(idle);
  assert.deepEqual(bug.pos, [4, 0, 3], 'in the stream');
  assert.equal(bug.push([1, 0], game), true);
  for (let i = 0; i < 60; i++) game.update(idle);
  assert.deepEqual(bug.pos, [5, 0, 3], 'through it');
  assert.ok(bug.frozen);
});

test('stream: a paste and Pull treat it as open for a crate, a decoy does not', () => {
  const game = gameWith({
    blocks: [{ at: [4, 0, 3], type: 'stream' }, { at: [4, 1, 3], type: 'stream' }],
    objects: [{ id: 'box', type: 'crate', at: [6, 0, 3] }],
  });
  game.player.place([3.5, 0, 3.5]);
  game.player.facing = game.player.targetFacing = Math.PI / 2;
  assert.deepEqual(pasteCell(game), [4, 0, 3], 'a crate can be put in it');
  assert.equal(pasteCell(game, 'wizard'), null, 'a decoy cannot');
  assert.equal(pullTarget(game, 6)?.object, game.objects[0], 'Pull reaches through it');
});

// ---- the reachability checker splits the two views

const WEST = { id: 'west', side: '-x', at: 3 };

/** Reach of one 12×4×8 room "r" (start cell [1, 0, 1]) with an exit west and some abilities. */
function reach(props, abilities = []) {
  const exits = props.exits ?? [WEST];
  const dummy = roomFile('o', { exits: exits.map((exit) => ({ id: `${exit.id}_o`, side: OPPOSITE_SIDE[exit.side], at: 3 })) });
  const content = gameData({
    rooms: [roomFile('r', { size: [12, 4, 8], ...props, exits }), dummy],
    connections: exits.map((exit) => [`r.${exit.id}`, `o.${exit.id}_o`]),
    objects: { crate: CRATE, plate: { kind: 'plate', color: '#eef3ff' } },
  });
  const room = buildRoom(content.rooms.get('r'), content);
  return analyzeRoom(room, { abilities, starts: [[1, 0, 1]], tuning: { scanRange: 6, blinkRange: 3 } });
}

/** A wall across the room at x, `height` blocks high. */
const across = (x, height, type) => ({ type, at: [x, 0, 0], to: [x, height - 1, 7] });
const far = { id: 'far', type: 'refill_energy', at: [10, 0, 2] };

test('stream: the checker never lets him over it, with the double jump or from a crate', () => {
  const room = (type, abilities, objects = []) => reach({ blocks: [across(6, 2, type)], pickups: [far], objects }, abilities).pickups.has('far');
  const crate = [{ id: 'c', type: 'crate', at: [5, 0, 2] }];
  assert.equal(room('block', ['double_jump']), true, 'the double jump clears a plain 2-high wall');
  assert.equal(room('block', [], crate), true, 'a crate is a step up it');
  assert.equal(room('stream', ['double_jump']), false);
  assert.equal(room('stream', ['double_jump'], crate), false);
  assert.equal(room('stream', ['double_jump', 'compile', 'warp', 'blink'], crate), false, 'nor with spells');
  const one = reach({ blocks: [{ ...across(6, 1, 'stream') }], pickups: [far] }).pickups.has('far');
  assert.equal(one, false, 'a 1-high one too: its field reaches the ceiling');
});

test('stream: a crate pushed through it stops one cell beyond, where a plate he cannot reach lies', () => {
  const locked = (type, plate) =>
    reach({
      blocks: [across(6, 2, type)],
      exits: [{ ...WEST, requires: [{ switch: '*' }] }],
      objects: [{ id: 'p', type: 'plate', at: [plate, 0, 2] }, { id: 'c', type: 'crate', at: [5, 0, 2] }],
    }).exits.west;
  assert.equal(locked('block', 7), false, 'a plain wall stops it');
  assert.equal(locked('stream', 7), true, 'a stream does not');
  assert.equal(locked('stream', 8), false, 'pushing it further needs him inside the stream');
});

test('stream: the editor lists it with what passes', () => {
  assert.equal(blockTypeText(resolveBlockTypes(BLOCK_TYPES).stream), 'crate pass');
});
