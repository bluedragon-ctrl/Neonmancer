import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeMessages } from '../src/core/messages.js';
import { PLAYER } from '../src/entities/player.js';
import { Game } from '../src/game.js';
import { bodyBox, touchedCell } from '../src/physics/collision.js';
import { wizardLook } from '../src/render/hit-fx.js';
import { CELL, EDGE_TYPE } from '../src/world/grid.js';
import { BLOCK_TYPES, eventTypes, gameData, grid, hold, idle, roomFile } from './helpers.js';

/**
 * A game in one 8×4×8 room with the given blocks, the wizard put at `pos`
 * (the room's spawn can't be above a hazard or void block).
 */
function gameWith(blocks, pos = [1.5, 0, 1.5], types = BLOCK_TYPES) {
  const game = new Game(gameData({ rooms: [roomFile('alpha', { blocks })], blocks: types }));
  game.player.place(pos);
  return game;
}

/** Run the game for `ticks` ticks with `inp`; returns every event. */
function run(game, inp, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(inp));
  return events;
}

test('grid: each cell points to its block type and its properties (D60)', () => {
  const g = grid({ cells: [[1, 0, 1]], blocks: { hazard: [[2, 0, 2]], void: [[3, 0, 3]] } });
  assert.equal(g.typeAt(1, 0, 1).id, 'block');
  assert.equal(g.typeAt(2, 0, 2).damage, 1);
  assert.equal(g.typeAt(3, 0, 3).lethal, true);
  assert.equal(g.typeAt(4, 0, 4), null);
  assert.equal(g.typeAt(-1, 0, 0), EDGE_TYPE); // beyond a side
  assert.equal(g.cellAt(4, 0, 4), CELL.empty);
  assert.equal(g.isSolid(2, 0, 2), true);
  assert.equal(g.isSolid(3, 0, 3), true);
});

test('touchedCell: standing on or leaning against a cell counts, a corner or a gap does not', () => {
  const g = grid({ blocks: { hazard: [[3, 0, 3]] } });
  const hurts = (type) => type.damage > 0;
  const touches = (pos) => touchedCell(bodyBox(pos, [0.6, 1.5, 0.6]), g, hurts) !== null;
  assert.deepEqual(touchedCell(bodyBox([3.5, 1, 3.5], [0.6, 1.5, 0.6]), g, hurts), [3, 0, 3]);
  assert.equal(touches([3.5, 1, 3.5]), true); // on top
  assert.equal(touches([2.7, 0, 3.5]), true); // against the -x face
  assert.equal(touches([2.6, 0, 3.5]), false); // a gap of 0.1
  assert.equal(touches([2.7, 0, 2.7]), false); // diagonally at the corner
  assert.equal(touches([3.5, 0, 5]), false);
});

test('walking into a hazard block hurts once, then the wizard is invulnerable for a while', () => {
  const game = gameWith([{ type: 'hazard', at: [3, 0, 1] }]);
  const events = run(game, hold('down'), 30); // Down = +x, into the block
  assert.deepEqual(
    events.filter((e) => e.type === 'hurt'),
    [{ type: 'hurt', amount: 1, cell: [3, 0, 1] }], // the block that hurt him, for its flare
  );
  const { player } = game;
  assert.equal(player.integrity, player.maxIntegrity - 1);
  assert.ok(player.invulnerable > 0);

  // Still leaning on it once the invulnerability wears off: hurt again.
  const later = run(game, hold('down'), PLAYER.invulnerableTicks);
  assert.equal(eventTypes(later).filter((t) => t === 'hurt').length, 1);
});

test('standing on a hazard block hurts, with no knockback (D43)', () => {
  const game = gameWith([{ type: 'hazard', at: [3, 0, 3] }], [3.5, 1, 3.5]);
  const { player } = game;
  const events = run(game, idle, 3);
  assert.ok(eventTypes(events).includes('hurt'));
  assert.deepEqual(player.pos, [3.5, 1, 3.5]);
  assert.equal(player.grounded, true);
});

test('a hazard block never hurts an invincible wizard (debug mode)', () => {
  const game = gameWith([{ type: 'hazard', at: [3, 0, 3] }], [3.5, 1, 3.5]);
  game.invincible = true;
  assert.ok(!eventTypes(run(game, idle, 60)).includes('hurt'));
  assert.equal(game.player.integrity, game.player.maxIntegrity);
});

test('hazards whittle the wizard down to a derez; the room resets and he respawns whole', () => {
  const game = gameWith([{ type: 'hazard', at: [3, 0, 3] }], [3.5, 1, 3.5]);
  const { player } = game;
  takeMessages();
  const events = run(game, idle, (PLAYER.invulnerableTicks + 1) * player.maxIntegrity);
  assert.deepEqual(
    events.find((e) => e.type === 'die'),
    { type: 'die', cause: 'damage' },
  );
  assert.ok(takeMessages().some((m) => m.key === 'msg.derez'));
  run(game, idle, PLAYER.deathTicks);
  assert.equal(player.dead, false);
  assert.equal(player.integrity, player.maxIntegrity);
});

test('landing on a void block kills at once, whatever the integrity', () => {
  const game = gameWith([{ type: 'void', at: [3, 0, 3] }], [3.5, 2, 3.5]);
  takeMessages();
  const events = run(game, idle, 30);
  assert.deepEqual(
    events.find((e) => e.type === 'die'),
    { type: 'die', cause: 'void' },
  );
  assert.equal(game.player.dead, true);
  assert.equal(game.player.integrity, 0);
  assert.ok(takeMessages().some((m) => m.key === 'msg.void'));
  // He derezzes where he stands, no drop into a pit.
  const y = game.player.pos[1];
  run(game, idle, 10);
  assert.equal(game.player.pos[1], y);
});

test('the side of a void block is harmless, and so is its edge under a foot', () => {
  const side = gameWith([{ type: 'void', at: [3, 0, 1] }]);
  assert.ok(!eventTypes(run(side, hold('down'), 40)).includes('die'));

  // Center over a plain block, one edge over the void block next to it.
  const edge = gameWith([{ at: [2, 0, 3] }, { type: 'void', at: [3, 0, 3] }], [2.8, 1, 3.5]);
  assert.ok(!eventTypes(run(edge, idle, 30)).includes('die'));
});

test('a void block never kills an invincible wizard (debug mode)', () => {
  const game = gameWith([{ type: 'void', at: [3, 0, 3] }], [3.5, 2, 3.5]);
  game.invincible = true;
  assert.ok(!eventTypes(run(game, idle, 30)).includes('die'));
});

test('wizardLook: a void death derezzes like a damage death, not a drop into a pit', () => {
  const dead = { invulnerable: 0, dead: true, deathTimer: PLAYER.deathTicks - 20 };
  assert.deepEqual(
    wizardLook({ ...dead, deathCause: 'void' }, PLAYER.deathTicks),
    wizardLook({ ...dead, deathCause: 'damage' }, PLAYER.deathTicks),
  );
  assert.notDeepEqual(
    wizardLook({ ...dead, deathCause: 'void' }, PLAYER.deathTicks),
    wizardLook({ ...dead, deathCause: 'hole' }, PLAYER.deathTicks),
  );
});

test('rules follow block properties, not type names: a variant hurts more, a new type can be lethal (D60)', () => {
  const types = {
    ...BLOCK_TYPES,
    hazard_hot: { extends: 'hazard', damage: 2 },
    abyss: { look: 'void', color: '#000000', lethal: true },
  };
  const hot = gameWith([{ type: 'hazard_hot', at: [3, 0, 1] }], [1.5, 0, 1.5], types);
  const hurt = run(hot, hold('down'), 30).filter((e) => e.type === 'hurt');
  assert.deepEqual(hurt, [{ type: 'hurt', amount: 2, cell: [3, 0, 1] }]);

  const abyss = gameWith([{ type: 'abyss', at: [3, 0, 3] }], [3.5, 2, 3.5], types);
  assert.ok(run(abyss, idle, 30).some((e) => e.type === 'die' && e.cause === 'void'));
});

