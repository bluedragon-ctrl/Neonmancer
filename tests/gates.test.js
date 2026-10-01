import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data/load.js';
import { validateData } from '../src/data/validate.js';
import { Game } from '../src/game.js';
import { gateBars, gateLightSpots } from '../src/render/gate-view.js';
import { SWITCH_FX, switchLight } from '../src/render/switch-view.js';
import { exitOpen, powered, switchesOn } from '../src/switches.js';
import { buildRoom } from '../src/world/room.js';
import { analyzeRoom } from '../src/world/reach.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { BLOCK_TYPES, CRATE, LIFT, dataFiles, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** Switch, gate and platform types as in defs.json (D140). */
const TYPES = {
  crate: CRATE,
  platform: LIFT,
  target: { kind: 'target', color: '#eef3ff' },
  plate: { kind: 'plate', color: '#eef3ff', edges: 'dashed' },
  target_timed: { kind: 'target', color: '#eef3ff', timer: 1 },
  plate_timed: { kind: 'plate', color: '#eef3ff', edges: 'dashed', timer: 0.5 },
};

/** Fake input pressing cast this tick. */
const cast = { down: (a) => a === 'cast', pressed: (a) => a === 'cast' };

/**
 * Room alpha (8×4×8) with `objects`, `blocks` (gates are block types,
 * BLOCK_TYPES, D141) and `exits`, joined to beta through its east exit if
 * it has one.
 */
function files({ objects = [], blocks = [], exits = [] } = {}) {
  const east = exits.some((exit) => exit.id === 'east');
  return dataFiles({
    rooms: [roomFile('alpha', { exits, objects, blocks }), roomFile('beta', { spawn: [1, 0, 4], exits: east ? [{ id: 'west', side: '-x', at: 3 }] : [] })],
    objects: TYPES,
    connections: east ? [['alpha.east', 'beta.west']] : [],
  });
}

/** A game in alpha with the Zap disk found. */
function gameWith(options) {
  return new Game(loadGameData(files(options)), { start: 'alpha', progress: new Progress([saveBit('spells', 0)]) });
}

function run(game, inp, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(inp));
  return events;
}

const byId = (game, id) => game.objects.find((object) => object.id === id);
/** The gate block in the cell [x, y, z] (its id is its type and cell, D60). */
const gateAt = (game, type, cell) => byId(game, `${type}@${cell.join(',')}`);

/** Zap the target at x = 3 from x = 0.5 along +x, and let the bolt arrive. */
function zap(game) {
  game.player.place([0.5, 0, 3.5]);
  game.player.targetFacing = Math.PI / 2;
  game.update(cast);
  run(game, idle, 20);
}

test('a locked exit with its own switches opens on those, whatever the others do', () => {
  const game = gameWith({
    objects: [{ id: 'p', type: 'plate', at: [2, 0, 2] }, { id: 'q', type: 'plate', at: [5, 0, 5] }],
    exits: [{ id: 'east', side: '+x', at: 3, locked: true, switches: ['p'] }],
  });
  game.update(idle);
  assert.equal(exitOpen(game, game.room.exits[0]), false);
  game.player.place([2.5, 0, 2.5]);
  assert.ok(eventTypes(game.update(idle)).includes('unlock'));
  assert.equal(switchesOn(game, ['p']), 1);
  assert.equal(switchesOn(game), 1, 'q is still off');
  assert.equal(powered(game), false, 'not every switch is on');
});

test('a gate is solid until its switches are on, then open; it never closes on the wizard', () => {
  const game = gameWith({ objects: [{ id: 'p', type: 'plate', at: [2, 0, 2] }, { id: 'c', type: 'crate', at: [6, 0, 6] }], blocks: [{ type: 'gate', at: [4, 0, 4] }] });
  const gate = gateAt(game, 'gate', [4, 0, 4]);
  game.update(idle);
  assert.equal(gate.solid, true);
  assert.ok(game.solids.includes(gate));
  game.player.place([2.5, 0, 2.5]);
  const opened = game.update(idle);
  assert.ok(opened.some((e) => e.type === 'gate' && e.object === gate && e.open));
  assert.equal(gate.solid, false);
  assert.ok(!game.solids.includes(gate), 'no body while open');
  // He steps off the plate into the gate's cell: it waits for him.
  game.player.place([4.5, 0, 4.5]);
  assert.ok(!eventTypes(game.update(idle)).includes('gate'));
  assert.equal(gate.solid, false);
  game.player.place([1.5, 0, 6.5]);
  const closed = game.update(idle);
  assert.ok(closed.some((e) => e.type === 'gate' && !e.open));
  assert.equal(gate.solid, true);
});

test('a bridge is there only while its switches are on', () => {
  const game = gameWith({ objects: [{ id: 't', type: 'target', at: [3, 0, 3] }], blocks: [{ type: 'bridge', at: [5, 0, 5], to: [5, 0, 6], switches: ['t'] }] });
  const bridge = gateAt(game, 'bridge', [5, 0, 5]);
  assert.deepEqual(gateAt(game, 'bridge', [5, 0, 6]).switches, ['t'], 'every cell of the box takes its switches');
  game.update(idle);
  assert.equal(bridge.solid, false);
  zap(game);
  assert.equal(byId(game, 't').on, true);
  assert.equal(bridge.solid, true);
  zap(game);
  assert.equal(bridge.solid, false);
});

test('a platform with switches runs only while they are on and stops where it is', () => {
  const lift = { id: 'l', type: 'platform', at: [5, 0, 1], path: { points: [[5, 0, 6]], speed: 2 }, switches: ['p'] };
  const game = gameWith({ objects: [{ id: 'p', type: 'plate', at: [2, 0, 2] }, lift] });
  const platform = byId(game, 'l');
  run(game, idle, 30);
  assert.deepEqual(platform.pos, [5, 0, 1], 'unpowered, it waits');
  game.player.place([2.5, 0, 2.5]);
  run(game, idle, 30);
  const moved = platform.pos[2];
  assert.ok(moved > 1.5, 'powered, it runs');
  game.player.place([1.5, 0, 6.5]);
  run(game, idle, 30);
  assert.ok(Math.abs(platform.pos[2] - moved) < 0.1, 'stopped where it was');
});

test('a timed target stays on for its time; another bolt starts the time again', () => {
  const game = gameWith({ objects: [{ id: 't', type: 'target_timed', at: [3, 0, 3] }] });
  const target = byId(game, 't');
  zap(game);
  assert.equal(target.on, true);
  assert.ok(target.countdown > 0 && target.countdown < 1);
  zap(game);
  assert.equal(target.on, true, 'a second bolt keeps it on');
  const events = run(game, idle, 60);
  assert.equal(target.on, false, 'off once its second is up');
  assert.ok(eventTypes(events).includes('switch'));
  assert.ok(eventTypes(events).includes('tick'), 'it ticks while counting down');
  assert.equal(target.countdown, null);
});

test('a timed plate stays on for its time after nothing stands on it', () => {
  const game = gameWith({ objects: [{ id: 'p', type: 'plate_timed', at: [2, 0, 2] }] });
  const plate = byId(game, 'p');
  game.player.place([2.5, 0, 2.5]);
  run(game, idle, 60);
  assert.equal(plate.on, true);
  assert.equal(plate.countdown, null, 'no countdown while pressed');
  game.player.place([5.5, 0, 5.5]);
  run(game, idle, 20);
  assert.equal(plate.on, true, 'still on after he left');
  assert.ok(plate.countdown > 0);
  run(game, idle, 15);
  assert.equal(plate.on, false, 'off after half a second');
});

test('switch data: links name switches of the room, and only exits, switch gates and platforms take them', () => {
  const errorsOf = (options) => validateData(files(options));
  const plate = { id: 'p', type: 'plate', at: [2, 0, 2] };
  assert.deepEqual(errorsOf({ objects: [plate], blocks: [{ type: 'gate', at: [4, 0, 4], to: [4, 1, 4], switches: ['p'] }] }), []);
  assert.match(errorsOf({ objects: [plate], blocks: [{ type: 'gate', at: [4, 0, 4], switches: ['x'] }] })[0], /blocks\[0\]\.switches: "x" is no switch/);
  assert.match(errorsOf({ blocks: [{ type: 'gate', at: [4, 0, 4] }] })[0], /a gate needs a switch/);
  assert.deepEqual(errorsOf({ blocks: [{ type: 'collapsing', at: [4, 0, 4] }] }), [], 'a step gate needs none');
  assert.match(errorsOf({ objects: [plate], blocks: [{ type: 'collapsing', at: [4, 0, 4], switches: ['p'] }] })[0], /only switch gates are powered/);
  assert.match(errorsOf({ objects: [plate, { id: 'c', type: 'crate', at: [4, 0, 4], switches: ['p'] }] })[0], /only platforms \(and gate blocks\)/);
  assert.match(errorsOf({ objects: [plate], exits: [{ id: 'east', side: '+x', at: 3, switches: ['p'] }] })[0], /only a locked exit takes switches/);
  assert.deepEqual(errorsOf({ objects: [{ ...plate, type: 'plate_timed', overrides: { timer: 8 } }] }), []);
  assert.match(errorsOf({ objects: [{ ...plate, overrides: { timer: 8 } }] })[0], /"timer" is not a property/);
  const data = files({});
  data['defs.json'].objects.crate_timed = { ...CRATE, timer: 2 };
  const errors = validateData(data);
  assert.ok(errors.some((e) => /crate_timed\.timer: only switches/.test(e)));
});

/** Can he reach a pickup at [10, 0, 4] in room r (12×4×8) with these objects, blocks and holes? */
function reachFar({ objects, blocks, holes = [] }, abilities = []) {
  const content = gameData({ rooms: [roomFile('r', { size: [12, 4, 8], objects, blocks, holes, pickups: [{ id: 'far', type: 'refill_energy', at: [10, 0, 4] }] })], objects: TYPES });
  const room = buildRoom(content.rooms.get('r'), content);
  return analyzeRoom(room, { abilities, starts: [[1, 0, 1]], tuning: { scanRange: 6, blinkRange: 3 } }).pickups.has('far');
}

/** A wall of gates across the room at x = 5, 4 high (one box, D141). */
const gateWall = (switches) => ({ type: 'gate', at: [5, 0, 0], to: [5, 3, 7], ...(switches && { switches }) });

test('reach: a gate wall opens to a target with Zap, to a plate with a crate on it, and to a timed plate', () => {
  const target = { id: 't', type: 'target', at: [2, 0, 5] };
  assert.equal(reachFar({ objects: [target], blocks: [gateWall()] }), false);
  assert.equal(reachFar({ objects: [target], blocks: [gateWall()] }, ['zap']), true);
  const plate = { id: 'p', type: 'plate', at: [2, 0, 4] };
  assert.equal(reachFar({ objects: [plate], blocks: [gateWall()] }), false, 'he can\'t stand on the plate and pass at once');
  assert.equal(reachFar({ objects: [plate, { id: 'c', type: 'crate', at: [3, 0, 4] }], blocks: [gateWall()] }), true, 'a crate pushed onto it');
  assert.equal(reachFar({ objects: [{ ...plate, type: 'plate_timed' }], blocks: [gateWall()] }), true, 'he runs while it counts down');
  // A gate linked to another switch than the one he can work stays shut.
  assert.equal(reachFar({ objects: [target, { id: 'q', type: 'plate', at: [2, 0, 2] }], blocks: [gateWall(['q'])] }, ['zap']), false);
});

test('reach: a bridge over a pit appears with its switch; a collapsing bridge counts as floor', () => {
  const holes = [{ at: [4, 0], to: [6, 7] }];
  const target = { id: 't', type: 'target', at: [2, 0, 6] };
  const bridge = { type: 'bridge', at: [4, 0, 4], to: [6, 0, 4] };
  assert.equal(reachFar({ objects: [target], blocks: [bridge], holes }), false);
  assert.equal(reachFar({ objects: [target], blocks: [bridge], holes }, ['zap']), true);
  assert.equal(reachFar({ blocks: [{ ...bridge, type: 'collapsing' }], holes }), true, 'no timing: it holds');
});

test('gate and timed switch looks: bars on the seen faces, lights in a row, a blink that speeds up', () => {
  for (const [a, b] of gateBars()) assert.ok((a[0] === 1 && b[0] === 1) || (a[2] === 1 && b[2] === 1), 'on +x or +z');
  assert.deepEqual(gateLightSpots(1), [[0.5, 0.5]]);
  assert.equal(gateLightSpots(3).length, 3);
  assert.equal(switchLight(false, null, 0), 0);
  assert.equal(switchLight(true, null, 0), 1);
  // Counting down it dips part of each blink, and the blinks get shorter.
  const dips = (countdown) => {
    let n = 0;
    for (let t = 0; t < 1; t += 0.01) if (switchLight(true, countdown, t) < 1) n++;
    return n;
  };
  assert.ok(dips(0.5) > 0);
  assert.equal(switchLight(true, 1, SWITCH_FX.blinkSlow * SWITCH_FX.blinkLit + 0.01), SWITCH_FX.blinkDip);
  let changes = (countdown) => {
    let last = null;
    let n = 0;
    for (let t = 0; t < 2; t += 0.005) {
      const v = switchLight(true, countdown, t);
      if (v !== last) n++;
      last = v;
    }
    return n;
  };
  assert.ok(changes(0.05) > changes(1), 'faster near the end');
});

test('room editor: switch links on gate blocks, a platform and a locked exit, typed as ids', async () => {
  const { RoomEdit, exitFields } = await import('../src/editor/room-edit.js');
  const { switchIds } = await import('../src/editor/panel.js');
  assert.deepEqual(switchIds(' p, q  p,'), ['p', 'q']);
  const lift = { id: 'l', type: 'platform', at: [6, 0, 6], path: { points: [[6, 0, 2]] } };
  const edit = new RoomEdit(roomFile('alpha', { objects: [{ id: 'p', type: 'plate', at: [2, 0, 2] }, lift], blocks: [{ type: 'gate', at: [4, 0, 1], switches: ['p'] }] }));
  assert.deepEqual(edit.at([4, 0, 1]), { kind: 'block', type: 'gate', switches: ['p'] });
  // Gate cells with the same switches merge into one box; other switches make their own.
  edit.placeBlock([4, 0, 2], 'gate', ['p']);
  edit.placeBlock([4, 0, 3], 'gate');
  edit.placeBlock([4, 0, 4], 'block');
  assert.deepEqual(edit.toData().blocks, [
    { type: 'gate', at: [4, 0, 1], switches: ['p'] },
    { type: 'gate', at: [4, 0, 2], switches: ['p'] },
    { type: 'gate', at: [4, 0, 3] },
    { at: [4, 0, 4] },
  ]);
  assert.equal(edit.placeBlock([4, 0, 2], 'gate', ['p']), false, 'already that');
  assert.equal(edit.setSwitches('l', ['p']), true);
  assert.deepEqual(edit.item('l').switches, ['p']);
  edit.setSwitches('l', []);
  assert.equal('switches' in edit.item('l'), false, 'none: it always runs');
  assert.deepEqual(exitFields({ id: 'e', side: '+x', at: 3, width: 2, y: 0, height: 2, locked: true, switches: ['p'] }).switches, ['p']);
  assert.equal(exitFields({ id: 'e', side: '+x', at: 3, width: 2, y: 0, height: 2, switches: ['p'] }).switches, undefined, 'only a locked exit');
});
