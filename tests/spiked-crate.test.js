import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseEnemy } from '../src/combat.js';
import { OPPOSITE_SIDE } from '../src/data/room-data.js';
import { Decoy } from '../src/entities/decoy.js';
import { Pushable } from '../src/entities/pushable.js';
import { Game } from '../src/game.js';
import { analyzeRoom } from '../src/world/reach.js';
import { buildRoom } from '../src/world/room.js';
import { BUG, eventTypes, gameData, hold, idle, roomFile } from './helpers.js';

/** The spiked crate (D199) as defs.json has it, without the look: a crate whose top hurts 2. */
const SPIKED = { extends: 'crate', topDamage: 2, vents: 'aurora' };
const OBJECTS = { crate_spiked: SPIKED };
const STILL = { ...BUG, movement: 'stationary' };

const spiked = (id, at) => ({ id, type: 'crate_spiked', at });
const plain = (id, at) => ({ id, type: 'crate', at });

/** A game in one 10×4×8 room with the given objects; the wizard stands at `pos` (level, facing +x). */
function gameWith(objects, pos = [1.5, 0, 3.5], props = {}) {
  const rooms = [roomFile('alpha', { size: [10, 4, 8], objects, ...props })];
  const game = new Game(gameData({ rooms, objects: OBJECTS, enemies: { bug: BUG, still: STILL } }));
  game.player.place(pos);
  return game;
}

const run = (game, inp, ticks) => {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(inp));
  return events;
};
const hurts = (events) => events.filter((e) => e.type === 'hurt');

// ---- the object itself: push, fall, stack, plug

test('a spiked crate has a topDamage and a bare top that hurts; a crate on it covers the spikes', () => {
  const low = new Pushable({ id: 'a', at: [3, 0, 3], topDamage: 2 });
  const top = new Pushable({ id: 'b', at: [3, 1, 3] });
  assert.equal(low.topDamage, 2);
  assert.equal(low.topHurts([low]), true);
  assert.equal(low.topHurts([low, top]), false);
  assert.equal(top.topHurts([low, top]), false, 'a plain crate has no spikes');
  const above = new Pushable({ id: 'c', at: [3, 1, 3], topDamage: 2 });
  assert.equal(above.topHurts([low, above]), true, 'a spiked crate on a plain one keeps its spikes');
});

test('a spiked crate is pushed, falls and stacks like a crate', () => {
  const game = gameWith([spiked('s', [3, 0, 3]), plain('p', [3, 3, 3])], [1.5, 0, 3.5]);
  run(game, idle, 60);
  const [s, p] = game.objects;
  assert.deepEqual(p.pos, [3, 1, 3], 'the plain crate fell onto it');
  // Pushed from the side it slides one cell, safe for him (only its top hurts).
  const game2 = gameWith([spiked('s', [3, 0, 3])], [2.5, 0, 3.5]);
  const events = run(game2, hold('down'), 60);
  assert.ok(game2.objects[0].pos[0] >= 4, 'it moved a cell or more along +x');
  assert.ok(eventTypes(events).includes('push'));
  assert.equal(hurts(events).length, 0, 'pushing from the side is safe');
  assert.equal(s.topDamage, 2);
});

test('a spiked crate pushed into a hole plugs it into plain floor', () => {
  const game = gameWith([spiked('s', [3, 0, 3])], [2.5, 0, 3.5], { holes: [{ at: [4, 3] }] });
  const crate = game.objects[0];
  run(game, hold('down'), 90);
  assert.equal(crate.state, 'plugged');
  assert.equal(crate.topHurts(game.objectBodies), false, 'no spikes on the floor any more');
  // He walks over the plugged hole unhurt.
  game.player.place([4.5, 0, 3.5]);
  const events = run(game, idle, 30);
  assert.equal(hurts(events).length, 0);
  assert.equal(game.player.dead, false);
});

// ---- the wizard: hurt and knock-off

test('standing on a spiked top hurts him for its topDamage and shoves him off the crate', () => {
  const game = gameWith([spiked('s', [4, 0, 3])], [4.5, 1, 3.5]);
  const before = game.player.integrity;
  const events = run(game, idle, 3);
  assert.deepEqual(hurts(events).map((e) => e.amount), [2]);
  assert.equal(game.player.integrity, before - 2);
  const [x, , z] = game.player.pos;
  const box = game.objects[0].box();
  assert.ok(x - 0.3 >= box[0][1] - 1e-6 || x + 0.3 <= box[0][0] + 1e-6 || z - 0.3 >= box[2][1] - 1e-6 || z + 0.3 <= box[2][0] + 1e-6, 'his box left the crate footprint');
  run(game, idle, 60);
  assert.equal(game.player.pos[1], 0, 'he fell to the floor beside it');
});

test('landing on it from a jump hurts him too', () => {
  const game = gameWith([spiked('s', [4, 0, 3])], [4.5, 2.5, 3.5]);
  const events = run(game, idle, 90);
  assert.equal(hurts(events).length, 1);
  assert.equal(game.player.pos[1], 0);
});

test('the shove works while he blinks: he can never rest on the spikes', () => {
  const game = gameWith([spiked('s', [4, 0, 3])], [4.5, 1, 3.5]);
  run(game, idle, 2); // hurt once, shoved off
  assert.ok(game.player.invulnerable > 0);
  game.player.place([4.5, 1, 3.5]); // put him back on it while he blinks
  const events = run(game, idle, 2);
  assert.equal(hurts(events).length, 0, 'invulnerable: no second hit');
  assert.ok(game.player.pos[0] > 5 || game.player.pos[0] < 4 || game.player.pos[2] > 4 || game.player.pos[2] < 3, 'but he was shoved off again');
});

test('walled in on a spiked top there is nowhere to go: he stays and is hurt again later', () => {
  const blocks = [
    { at: [3, 1, 3] },
    { at: [5, 1, 3] },
    { at: [4, 1, 2] },
    { at: [4, 1, 4] },
  ];
  const game = gameWith([spiked('s', [4, 0, 3])], [4.5, 1, 3.5], { blocks });
  run(game, idle, 3);
  assert.equal(game.player.integrity, game.player.maxIntegrity - 2);
  assert.deepEqual(game.player.pos.slice(0, 1), [4.5]);
});

test('a plain crate on a spiked one is a safe step: its top does not hurt', () => {
  const game = gameWith([spiked('s', [4, 0, 3]), plain('p', [4, 1, 3])], [4.5, 2, 3.5]);
  const events = run(game, idle, 30);
  assert.equal(hurts(events).length, 0);
  assert.equal(game.player.pos[1], 2);
  // A spiked crate on a plain one keeps its spikes on top.
  const game2 = gameWith([plain('p', [4, 0, 3]), spiked('s', [4, 1, 3])], [4.5, 2, 3.5]);
  assert.equal(hurts(run(game2, idle, 3)).length, 1);
});

test('a jump in line over a 1-high spiked crate always touches it: no hop over (D199)', () => {
  for (let d = 0; d <= 3; d += 0.25) {
    const game = gameWith([spiked('s', [5, 0, 3])], [5 - 0.3 - d, 0, 3.5]);
    let touched = false;
    for (let t = 0; t < 120; t++) {
      const events = game.update({ down: () => true, pressed: (a) => t === 0 && a === 'jump' });
      if (hurts(events).length > 0) touched = true;
    }
    const [x] = game.player.pos;
    // Either it hurt him (he landed on the top) or he never got past it.
    assert.ok(touched || x < 6, `take-off ${d} units before: crossed unhurt`);
  }
});

// ---- decoy, enemies

test('the Fork decoy cannot stand on a spiked top: it derezzes', () => {
  const game = gameWith([spiked('s', [4, 0, 3])], [1.5, 0, 6.5]);
  game.decoy = new Decoy([4, 1, 3], 0, game.player.size, 10);
  run(game, idle, 3);
  assert.equal(game.decoy.active, false);
  // On the floor it stands.
  game.decoy = new Decoy([6, 0, 3], 0, game.player.size, 10);
  run(game, idle, 3);
  assert.equal(game.decoy.active, true);
});

test('a frozen enemy on a spiked top is impaled; an active one crosses it unhurt', () => {
  const enemies = [{ id: 'b', template: 'still', at: [4, 1, 3] }];
  const game = gameWith([spiked('s', [4, 0, 3])], [1.5, 0, 6.5], { enemies });
  const [bug] = game.enemies;
  run(game, idle, 30);
  assert.equal(bug.alive, true, 'an active enemy stands on it unhurt');
  pauseEnemy(game, bug, 600);
  const events = run(game, idle, 3);
  assert.equal(bug.alive, false);
  assert.ok(eventTypes(events).includes('pop'));
  // A plain crate under a frozen enemy is fine.
  const safe = gameWith([plain('p', [4, 0, 3])], [1.5, 0, 6.5], { enemies });
  pauseEnemy(safe, safe.enemies[0], 600);
  run(safe, idle, 10);
  assert.equal(safe.enemies[0].alive, true);
});

// ---- the reachability checker

const WEST = { id: 'west', side: '-x', at: 3 };

/** Reach of a 12×4×8 room "r" (spawn cell [1, 0, 1]) with a wall across at x = 4, `height` high, and a pickup behind it. */
function reachBehindWall(height, objects) {
  const dummy = roomFile('o', { exits: [{ id: 'west_o', side: OPPOSITE_SIDE[WEST.side], at: 3 }] });
  const r = roomFile('r', {
    size: [12, 5, 8],
    exits: [WEST],
    blocks: [{ at: [4, 0, 0], to: [4, height - 1, 7] }],
    objects,
    pickups: [{ id: 'far', type: 'refill_energy', at: [11, 0, 2] }],
  });
  const content = gameData({ rooms: [r, dummy], connections: [['r.west', 'o.west_o']], objects: OBJECTS });
  return analyzeRoom(buildRoom(content.rooms.get('r'), content), { abilities: [], starts: [[1, 0, 1]], tuning: { scanRange: 6, blinkRange: 3 } }).pickups.has('far');
}

test('checker: a plain crate is a step up a 2-high wall, a spiked one is not (his feet can not rest on it)', () => {
  assert.equal(reachBehindWall(2, [plain('c', [3, 0, 3])]), true);
  assert.equal(reachBehindWall(2, [spiked('c', [3, 0, 3])]), false);
});

test('checker: a plain crate on a spiked one is a step again', () => {
  const step = plain('step', [2, 0, 3]);
  // The 3-high wall needs the stack's top (y = 2): the step crate gets him to it only if the top is safe.
  assert.equal(reachBehindWall(3, [step, spiked('s', [3, 0, 3]), plain('p', [3, 1, 3])]), true);
  assert.equal(reachBehindWall(3, [step, spiked('s', [3, 0, 3])]), false);
  assert.equal(reachBehindWall(3, [step, plain('s', [3, 0, 3])]), false, 'one plain crate is too low');
});

/** Reach of the pickup behind a pit `width` tiles wide (x = 4 on, all along z) with the given crates. */
function reachBehindPit(width, objects) {
  const dummy = roomFile('o', { exits: [{ id: 'west_o', side: OPPOSITE_SIDE[WEST.side], at: 3 }] });
  const r = roomFile('r', {
    size: [12, 4, 8],
    exits: [WEST],
    holes: [{ at: [4, 0], to: [3 + width, 7] }],
    objects,
    pickups: [{ id: 'far', type: 'refill_energy', at: [11, 0, 2] }],
  });
  const content = gameData({ rooms: [r, dummy], connections: [['r.west', 'o.west_o']], objects: OBJECTS });
  return analyzeRoom(buildRoom(content.rooms.get('r'), content), { abilities: [], starts: [[1, 0, 1]], tuning: { scanRange: 6, blinkRange: 3 } }).pickups.has('far');
}

test('checker: spiked crates plug a pit into plain floor he can walk over', () => {
  const crates = [spiked('a', [2, 0, 3]), spiked('b', [3, 0, 3])];
  assert.equal(reachBehindPit(3, []), false, 'a 3-wide pit is too wide to jump');
  assert.equal(reachBehindPit(3, crates), true, 'two crates plug two tiles, he jumps the last');
  assert.equal(reachBehindPit(4, crates), false, 'two tiles stay open');
});

test('checker: a pushed spiked crate keeps its spikes (it is still no step)', () => {
  // A 2-high wall with a spiked crate that can be pushed anywhere: never a way up.
  assert.equal(reachBehindWall(2, [spiked('c', [2, 0, 3]), spiked('d', [2, 0, 5])]), false);
});

// ---- tools and look

test('xsb: ! is a spiked crate, --spiked makes every crate one', async () => {
  const { parseXsb, xsbToRoom } = await import('../.claude/skills/sokoban-design/scripts/xsb.mjs');
  const [level] = parseXsb('#####\n#@$!#\n# . #\n#####\n');
  const types = (room) => room.objects.filter((o) => o.type.startsWith('crate')).map((o) => o.type);
  assert.deepEqual(types(xsbToRoom(level)), ['crate', 'crate_spiked']);
  assert.deepEqual(types(xsbToRoom(level, { spiked: true })), ['crate_spiked', 'crate_spiked']);
});

test('the Object tool says a spiked crate hurts', async () => {
  const { objectTypeText } = await import('../src/editor/panel.js');
  assert.match(objectTypeText({ kind: 'pushable', mark: 'bits', topDamage: 2 }), /spiked top, hurts 2/);
});

test('vents: square holes on the top face, a shaft from each down to the core', async () => {
  const { VENT_CELLS, holeSegments, holeSquare, jetQuads, shaftQuads } = await import('../src/render/vent-fx.js');
  const at = [3, 1, 2];
  for (const cell of VENT_CELLS) {
    const corners = holeSquare(at, cell);
    assert.equal(corners.length, 4);
    for (const [x, y, z] of corners) {
      assert.ok(x > 3 && x < 4 && z > 2 && z < 3, 'inside the top face');
      assert.ok(y > 2 && y < 2.01, 'on it');
    }
    const core = holeSquare(at, cell, 0.5);
    assert.ok(core.every(([x, y, z]) => x > 3.25 && x < 3.75 && z > 2.25 && z < 2.75 && y < 2 && y > 1.5), 'a smaller square on top of the core inside');
  }
  assert.equal(holeSegments(at).length, VENT_CELLS.length * 4);
  assert.equal(holeSegments(at, 0.5).length, VENT_CELLS.length * 8);
  assert.equal(shaftQuads(at, 0.5).length, VENT_CELLS.length * 4);
  assert.equal(jetQuads(at).length, VENT_CELLS.length * 2);
  assert.ok(jetQuads(at).every((quad) => quad.every((v) => v.every(Number.isFinite))));
});

test('the vents hide while a crate lies on the spiked one, and show again when it is gone', async () => {
  const { PushableView } = await import('../src/render/entity-view.js');
  const game = gameWith([spiked('s', [4, 0, 3]), plain('p', [4, 1, 3])]);
  const [low] = game.objects;
  const view = new PushableView(game, low);
  assert.ok(view.vents, 'a spiked crate has vents');
  view.sync(1);
  assert.equal(view.vents.visible, false, 'covered');
  const alone = gameWith([spiked('s', [4, 0, 3])]);
  const bare = new PushableView(alone, alone.objects[0]);
  bare.sync(1);
  assert.equal(bare.vents.visible, true, 'bare');
  assert.equal(new PushableView(game, game.objects[1]).vents, null, 'a plain crate has none');
});
