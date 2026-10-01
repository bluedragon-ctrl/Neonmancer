import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GATE } from '../src/entities/gate.js';
import { Game } from '../src/game.js';
import { GATE_FX, gateShake } from '../src/render/gate-view.js';
import { BLOCK_TYPES, CRATE, eventTypes, gameData, hold, idle, roomFile } from './helpers.js';

/** Block types: the usual ones and a collapsing block that grows back after 1 s. */
const TYPES = { ...BLOCK_TYPES, crumble_fast: { extends: 'collapsing', regrow: 1 } };

/**
 * A game in one 8×4×8 room with the given blocks, objects and holes, the
 * wizard put at `pos`.
 */
function gameWith({ blocks, objects = [], holes = [], pos = [0.5, 0, 7.5] }) {
  const game = new Game(
    gameData({ rooms: [roomFile('alpha', { blocks, objects, holes, spawn: [0.5, 0, 7.5] })], objects: { crate: CRATE }, blocks: TYPES }),
  );
  game.player.place(pos);
  return game;
}

/** The game's collapsing blocks: step gates (D141), room objects built from the block boxes (D60). */
const crumbles = (game) => game.objects.filter((object) => object.kind === 'gate' && object.trigger === 'step');

/** Run the game for `ticks` ticks with `inp`; returns every event. */
function run(game, inp, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(inp));
  return events;
}

/** A collapsing block at [3, 0, 3] (growing back after 1 s with `regrow`). */
const block = (regrow = false) => ({ type: regrow ? 'crumble_fast' : 'collapsing', at: [3, 0, 3] });

/** The wizard standing on top of block(). */
const ON_TOP = [3.5, 1, 3.5];

test('standing on a collapsing block makes it shake, then vanish, and the wizard falls', () => {
  const game = gameWith({ blocks: [block()], pos: ON_TOP });
  const [crumble] = crumbles(game);
  assert.deepEqual(eventTypes(run(game, idle, 1)), ['land', 'shake']);
  assert.equal(crumble.state, 'shake');

  const shaking = run(game, idle, GATE.shakeTicks - 1);
  assert.ok(!eventTypes(shaking).includes('collapse'));
  assert.equal(game.player.pos[1], 1); // still standing on it
  assert.deepEqual(eventTypes(run(game, idle, 1)), ['collapse']);
  assert.equal(crumble.solid, false);
  assert.ok(!game.solids.includes(crumble) && !game.bodies.includes(crumble));

  run(game, idle, 30);
  assert.equal(game.player.pos[1], 0);
  assert.equal(game.player.grounded, true);
});

test('once shaking, it vanishes even when the wizard steps off', () => {
  const game = gameWith({ blocks: [block()], pos: ON_TOP });
  run(game, idle, 1);
  game.player.place([0.5, 0, 7.5]);
  assert.ok(eventTypes(run(game, idle, GATE.shakeTicks)).includes('collapse'));
});

test('walking into its side or jumping over it does not trigger it', () => {
  const game = gameWith({ blocks: [block()], pos: [2.5, 0, 3.5] });
  run(game, hold('down'), 60); // Down = +x, into its -x face
  assert.equal(game.player.pos[0], 2.7);
  assert.equal(crumbles(game)[0].state, 'solid');

  const over = gameWith({ blocks: [block()], pos: [3.5, 2.2, 3.5] });
  over.player.vy = 5; // rising: nowhere near its top yet
  over.update(idle);
  assert.equal(crumbles(over)[0].state, 'solid');
});

test('crates do not trigger it; a crate on it falls when it goes', () => {
  const game = gameWith({ blocks: [block()], objects: [{ id: 'box', type: 'crate', at: [3, 1, 3] }] });
  const [crumble] = crumbles(game);
  const crate = game.objects.find((object) => object.id === 'box');
  run(game, idle, 120);
  assert.equal(crumble.state, 'solid');

  crumble.enter('shake');
  const events = run(game, idle, GATE.shakeTicks + 30);
  assert.ok(eventTypes(events).includes('collapse'));
  assert.deepEqual(crate.pos, [3, 0, 3]);
  assert.equal(crate.state, 'rest');
});

test('a collapsing bridge over a hole drops the wizard into the pit', () => {
  const game = gameWith({ blocks: [block()], holes: [{ at: [3, 3] }], pos: ON_TOP });
  const events = run(game, idle, GATE.shakeTicks + 30);
  assert.deepEqual(
    events.filter((e) => e.type === 'die'),
    [{ type: 'die', cause: 'hole' }],
  );
});

test('a dead wizard does not trigger it', () => {
  const game = gameWith({ blocks: [block()], pos: ON_TOP });
  game.player.die('damage');
  run(game, idle, 10);
  assert.equal(crumbles(game)[0].state, 'solid');
});

test('a regrowing block comes back after its time, once its cell is clear', () => {
  const game = gameWith({ blocks: [block(true)], pos: ON_TOP });
  const [crumble] = crumbles(game);
  run(game, idle, 1 + GATE.shakeTicks);
  assert.equal(crumble.state, 'gone');

  // The wizard dropped into its cell: it waits for him.
  run(game, idle, 120);
  assert.equal(crumble.state, 'gone');
  // Up = −x: it grows back as soon as he is out of the cell (0.8 units, 11 ticks).
  const events = run(game, hold('up'), 12);
  assert.deepEqual(events.map((e) => [e.type, e.object?.id]), [['regrow', 'crumble_fast@3,0,3']]);
  assert.ok(game.player.pos[0] <= 2.7);
  assert.equal(crumble.solid, true);
  assert.ok(game.solids.includes(crumble));
});

test('without a regrow time it stays gone until the room resets', () => {
  const game = gameWith({ blocks: [block()], pos: ON_TOP });
  run(game, idle, 1 + GATE.shakeTicks);
  game.player.place([0.5, 0, 7.5]);
  run(game, idle, 600);
  assert.equal(crumbles(game)[0].state, 'gone');

  game.enterRoom('alpha');
  assert.equal(crumbles(game)[0].state, 'solid');
  assert.ok(game.solids.includes(crumbles(game)[0]));
});

test('look: the shake grows but stays small; still otherwise; only a regrowing one leaves an outline', () => {
  assert.deepEqual(gateShake({ state: 'solid', timer: 5 }, 0), [0, 0, 0]);
  const amount = (timer) => Math.max(...Array.from({ length: 6 }, (_, i) => Math.hypot(...gateShake({ state: 'shake', timer: timer + i }, 0))));
  assert.ok(amount(0) < amount(GATE.shakeTicks - 6));
  assert.ok(amount(GATE.shakeTicks - 6) <= GATE_FX.shakeTo * Math.SQRT2);
  assert.deepEqual(gateShake({ state: 'gone', timer: 3 }, 0), [0, 0, 0]);
  const [once] = crumbles(gameWith({ blocks: [block()] }));
  const [again] = crumbles(gameWith({ blocks: [block(true)] }));
  assert.equal(once.returns, false);
  assert.equal(again.returns, true);
});
