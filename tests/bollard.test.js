import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseEnemy } from '../src/combat.js';
import { lineOfSight } from '../src/ai/sight.js';
import { Game } from '../src/game.js';
import { Player } from '../src/entities/player.js';
import { Pushable } from '../src/entities/pushable.js';
import { resolveBlockTypes } from '../src/data/room-data.js';
import { blockTypeText } from '../src/editor/panel.js';
import { BOLLARD_FX, bollardLamp, bollardPresence } from '../src/render/bollard.js';
import { buildRoom } from '../src/world/room.js';
import { analyzeRoom } from '../src/world/reach.js';
import { BLOCK_TYPES, BUG, CRATE, gameData, grid as makeGrid, hold, idle, roomFile, withNeighbours } from './helpers.js';

/**
 * The bollard (D276): a thin post that crates, frozen enemies and active
 * enemies stop at, and the wizard walks through. Nothing stands on it:
 * for those it stops, it reaches up to the ceiling.
 */

/** A tiny world like crate-stream.test.js: grid, crates and the player. */
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

/** A 12×4×8 game with `props`. */
function gameWith(props = {}) {
  const STILL = { ...BUG, movement: 'stationary' };
  const rooms = [roomFile('alpha', { size: [12, 4, 8], spawn: [0.5, 0, 7.5], ...props })];
  return new Game(gameData({ rooms, objects: { crate: CRATE }, enemies: { bug: BUG, still: STILL } }));
}

test('bollard: open to the wizard, solid to crates and enemies, up to the ceiling', () => {
  const g = makeGrid({ blocks: { bollard: [[4, 0, 2]] } });
  assert.equal(g.forBody('wizard').isSolid(4, 0, 2), false, 'he walks through');
  assert.equal(g.forBody('crate').isSolid(4, 0, 2), true, 'a crate stops');
  assert.equal(g.forBody('enemy').isSolid(4, 0, 2), true, 'an enemy stops');
  assert.equal(g.forBody('crate').isSolid(4, 3, 2), true, 'no top to rest on');
  assert.equal(g.forBody('wizard').isSolid(4, 3, 2), false);
  assert.equal(g.blocksSight(4, 0, 2), false, 'bolts and sight pass');
  assert.equal(lineOfSight([1.5, 0.5, 2.5], [6.5, 0.5, 2.5], g), true);
});

test('bollard: the wizard walks through a row of them', () => {
  const w = world({ blocks: { bollard: [[4, 0, 2]] } });
  w.run(hold('down'), 120);
  assert.ok(w.player.pos[0] > 5, `he got past: ${w.player.pos}`);
});

test('bollard: a crate pushed at it stops in the cell before it', () => {
  const w = world({ blocks: { bollard: [[4, 0, 2]] }, crates: [[2, 0, 2]], spawn: [1.5, 0, 2.5] });
  w.run(hold('down'), 120);
  assert.deepEqual(w.pushables[0].pos, [3, 0, 2]);
});

test('bollard: a crate falling onto its column stops above it, never rests on it', () => {
  const ledge = (blocks) => world({ blocks, cells: [[2, 0, 2], [3, 0, 2]], crates: [[3, 1, 2]], spawn: [2.5, 1, 2.5] });
  const open = ledge({});
  open.run(hold('down'), 120);
  assert.equal(open.pushables[0].pos[1], 0, 'without it the crate drops off the ledge');
  const w = ledge({ bollard: [[4, 0, 2]] });
  w.run(hold('down'), 120);
  assert.deepEqual(w.pushables[0].pos, [3, 1, 2], 'the push off the ledge is refused');
});

test('bollard: an active enemy and a frozen one are stopped', () => {
  const game = gameWith({ blocks: [{ at: [4, 0, 3], type: 'bollard' }], enemies: [{ id: 'b', template: 'still', at: [3, 0, 3] }] });
  const [bug] = game.enemies;
  assert.equal(bug.blockedAt([4, 0, 3], game), true, 'awake');
  pauseEnemy(game, bug, 300);
  assert.equal(bug.blockedAt([4, 0, 3], game), true, 'frozen');
  bug.push([1, 0], game);
  for (let i = 0; i < 60; i++) game.update(idle);
  assert.deepEqual(bug.pos, [3, 0, 3]);
});

/** Reach of a room "r" (12×4×8, spawn cell [1, 0, 1]). */
function reach(props, abilities = []) {
  const exits = props.exits ?? [{ id: 'west', side: '-x', at: 3 }];
  const content = gameData({
    ...withNeighbours(roomFile('r', { size: [12, 4, 8], ...props, exits })),
    objects: { crate: CRATE, plate: { kind: 'plate', color: '#eef3ff' } },
  });
  const room = buildRoom(content.rooms.get('r'), content);
  return analyzeRoom(room, { abilities, starts: [[1, 0, 1]], tuning: { scanRange: 6, blinkRange: 3 } });
}

test('bollard: the checker walks him through a row, never a crate', () => {
  const row = { type: 'bollard', at: [6, 0, 0], to: [6, 0, 7] };
  assert.equal(reach({ blocks: [row], pickups: [{ id: 'far', type: 'refill_energy', at: [10, 0, 2] }] }).pickups.has('far'), true);
  const locked = (plate) =>
    reach({
      blocks: [row],
      exits: [{ id: 'west', side: '-x', at: 3, requires: [{ switch: '*' }] }],
      objects: [{ id: 'p', type: 'plate', at: [plate, 0, 2] }, { id: 'c', type: 'crate', at: [3, 0, 2] }],
    }).exits.west;
  assert.equal(locked(5), true, 'a plate before the row');
  assert.equal(locked(7), false, 'a plate past it: the crate never gets there');
});

test('bollard: the lamp blinks, a row out of step, and the editor says what it does', () => {
  const lit = [0, 0.3, 0.6, 0.9].map((t) => bollardLamp(t));
  assert.ok(Math.max(...lit) - Math.min(...lit) > 0.5, 'it blinks');
  assert.ok(lit.every((v) => v > 0 && v <= 1));
  assert.notEqual(bollardLamp(0, [0, 0, 0]), bollardLamp(0, [1, 0, 0]), 'neighbours out of step');
  assert.equal(blockTypeText(resolveBlockTypes(BLOCK_TYPES).bollard), 'stops crates and enemies, the wizard walks through');
});

test('bollard: it fades while he passes through its cell, only on its level', () => {
  const cell = [4, 0, 2];
  assert.equal(bollardPresence(cell, []), 1, 'nobody near');
  assert.equal(bollardPresence(cell, [[2.5, 0, 2.5]]), 1, 'a cell and more away');
  assert.equal(bollardPresence(cell, [[4.5, 0, 2.5]]), BOLLARD_FX.faint, 'in its cell');
  const halfway = bollardPresence(cell, [[5.15, 0, 2.5]]);
  assert.ok(halfway > BOLLARD_FX.faint && halfway < 1, `stepping in: ${halfway}`);
  assert.equal(bollardPresence(cell, [[4.5, 3, 2.5]]), 1, 'far above it');
  assert.equal(bollardPresence(cell, [[9, 0, 9], [4.5, 0, 2.5]]), BOLLARD_FX.faint, 'the nearest body counts (his decoy too)');
});
