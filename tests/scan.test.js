import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../src/data/validate.js';
import { Game } from '../src/game.js';
import { PLAYER } from '../src/entities/player.js';
import { SCAN, cellReach, exitReach, scanReach } from '../src/entities/scan.js';
import { SCAN_FX, exitSlab, scanSquare, waveBrightness } from '../src/render/scan-fx.js';
import { exitOpen } from '../src/switches.js';
import { exitCells, withExitDefaults } from '../src/data/room-data.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { SPELLS, dataFiles, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** Fake input pressing one action this tick. */
const press = (action) => ({ down: (a) => a === action, pressed: (a) => a === action });

/** A hidden exit in the back wall at z 0. */
const HIDDEN = { id: 'north', side: '-z', at: 8, hidden: true };

/**
 * A game in a 12×4×12 room with `props`, entered through `entry`; the
 * wizard knows Scan (selected) and stands at `pos`.
 */
function gameWith(props = {}, pos = [1.5, 0, 6.5], entry = null) {
  const rooms = [roomFile('alpha', { size: [12, 4, 12], spawn: [1.5, 0, 6.5], ...props }), roomFile('beta')];
  const exits = (props.exits ?? []).map((exit) => [`alpha.${exit.id}`, 'beta.south']);
  const betaExits = exits.length > 0 ? [{ id: 'south', side: '+z', at: 3 }] : [];
  rooms[1].exits = betaExits;
  const game = new Game(gameData({ rooms, connections: exits, fragments: { required: 64, access: [16, 32, 48] } }), { progress: new Progress([saveBit('spells', 9)]) });
  if (entry) game.enterRoom('alpha', pos, entry);
  game.player.spell = 'scan';
  game.player.place(pos);
  return game;
}

/** Cast the selected spell after the cooldown of the last one; returns this tick's events. */
function cast(game) {
  for (let i = 0; i < 20; i++) game.update(idle);
  return game.update(press('cast'));
}

/** Run `ticks` ticks without input; returns their events. */
function run(game, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(idle));
  return events;
}

test('the wave spreads square over the grid, out to the range, in SCAN.spreadTicks (D128)', () => {
  assert.equal(scanReach(0, 6), 0);
  assert.equal(scanReach(SCAN.spreadTicks / 2, 6), 3);
  assert.equal(scanReach(SCAN.spreadTicks * 2, 6), 6);
  // Square: to the nearest point of a cell's footprint, at any height.
  assert.equal(cellReach([1.5, 0, 1.5], [1, 3, 1]), 0);
  assert.equal(cellReach([1.5, 0, 1.5], [4, 0, 1]), 2.5);
  assert.equal(cellReach([1.5, 0, 1.5], [4, 0, 4]), 2.5, 'diagonals are no farther');
  // An exit: to its stretch of the side.
  const size = [12, 4, 12];
  assert.equal(exitReach([9, 0, 3], withExitDefaults(HIDDEN), size), 3);
  assert.equal(exitReach([2, 0, 3], withExitDefaults(HIDDEN), size), 6);
  assert.equal(exitReach([11.5, 0, 5], withExitDefaults({ id: 'e', side: '+x', at: 4 }), size), 0.5);
});

test('Scan costs its energy and never fizzles, even with nothing to find', () => {
  const game = gameWith();
  const events = cast(game);
  assert.deepEqual(eventTypes(events), ['scan', 'cast']);
  assert.equal(game.player.energy, PLAYER.maxEnergy - SPELLS.scan.cost);
  assert.deepEqual(game.player.scan, { origin: [1.5, 0, 6.5], range: SPELLS.scan.range, tick: 0, found: false });
  run(game, PLAYER.scanTicks + 1);
  assert.equal(game.player.scan, null, 'the wave is gone');
});

test('a fake block is a solid block until the wave reaches it; then it is gone for the visit', () => {
  const game = gameWith({ blocks: [{ type: 'fake', at: [4, 0, 6] }, { type: 'fake', at: [4, 1, 6] }, { type: 'fake', at: [9, 0, 6] }, { at: [4, 0, 8] }] });
  assert.equal(game.grid.isSolid(4, 0, 6), true);
  assert.equal(game.grid.typeAt(4, 0, 6).fake, true);
  assert.equal(game.hidden.cells.length, 3);
  const events = [...cast(game)];
  assert.equal(game.grid.isSolid(4, 0, 6), true, 'the wave starts at his feet');
  // 2.5 away: reached after half the spread of a 6 range... within these ticks.
  events.push(...run(game, SCAN.spreadTicks));
  const reveals = events.filter((event) => event.type === 'reveal');
  assert.deepEqual(reveals.map((event) => event.cell), [[4, 0, 6], [4, 1, 6]], 'both at once, the far one out of range');
  assert.equal(game.grid.isSolid(4, 0, 6), false);
  assert.equal(game.grid.isSolid(4, 1, 6), false);
  assert.equal(game.grid.isSolid(9, 0, 6), true, '7 away: beyond the range');
  assert.equal(game.grid.isSolid(4, 0, 8), true, 'a plain block stays');
  assert.deepEqual(game.room.blocks.fake, [[9, 0, 6]]);
  assert.equal(game.reveals, 2);
  // A respawn resets the room: the fake blocks are back.
  game.enterRoom('alpha', [1.5, 0, 6.5]);
  assert.equal(game.grid.isSolid(4, 0, 6), true);
  assert.equal(game.reveals, 0);
});

test('what stands on a fake block falls when it is revealed; a pickup hidden inside it can be taken', () => {
  const game = gameWith({
    blocks: [{ type: 'fake', at: [3, 0, 6] }, { type: 'fake', at: [5, 0, 6] }],
    objects: [{ id: 'box', type: 'crate', at: [3, 1, 6] }],
    pickups: [{ id: 'refill', type: 'refill_energy', at: [5, 0, 6] }],
  });
  const [crate] = game.objects;
  run(game, 5);
  assert.equal(crate.pos[1], 1, 'it rests on the fake block');
  cast(game);
  run(game, 40);
  assert.equal(crate.pos[1], 0, 'it fell');
  // He spent energy on the scan; walking into the cell takes the refill.
  game.player.place([5.5, 0, 6.5]);
  const events = run(game, 2);
  assert.ok(eventTypes(events).includes('pickup'));
});

test('a hidden exit is wall until the wave reaches it; then it opens, without an unlock', () => {
  const game = gameWith({ exits: [HIDDEN] }, [9, 0, 5]);
  const exit = game.room.exits[0];
  const opening = exitCells(exit, game.room.size).outside;
  assert.ok(opening.every((cell) => game.grid.isSolid(...cell)), 'solid wall');
  assert.equal(exitOpen(game, exit), false);
  const events = [...cast(game), ...run(game, SCAN.spreadTicks)];
  assert.ok(opening.every((cell) => !game.grid.isSolid(...cell)), 'open');
  assert.equal(exitOpen(game, exit), true);
  assert.deepEqual(events.filter((event) => event.type === 'reveal').map((event) => event.exit), [exit]);
  assert.ok(!eventTypes(events).includes('unlock'));
  assert.deepEqual(game.hidden.exits, []);
});

test('a hidden exit out of reach stays wall; the one he came in through is open and shown', () => {
  const far = gameWith({ exits: [HIDDEN] }, [1.5, 0, 11]);
  cast(far);
  run(far, SCAN.spreadTicks);
  assert.equal(exitOpen(far, far.room.exits[0]), false);
  const came = gameWith({ exits: [HIDDEN] }, [9, 0, 0.5], 'north');
  assert.equal(exitOpen(came, came.room.exits[0]), true);
  assert.deepEqual(came.hidden.exits, []);
});

test('a hidden exit that is locked too is a lock once revealed', () => {
  const game = gameWith({ exits: [{ ...HIDDEN, requires: [{ access: 1 }] }] }, [9, 0, 5]);
  cast(game);
  run(game, SCAN.spreadTicks);
  assert.deepEqual(game.hidden.exits, []);
  assert.equal(exitOpen(game, game.room.exits[0]), false, 'his access level is 0');
  game.progress.accessLevel = 1;
  const events = run(game, 1);
  assert.equal(exitOpen(game, game.room.exits[0]), true);
  assert.ok(eventTypes(events).includes('unlock'));
});

test('data: a pickup may lie inside a fake block, not inside a plain one; "fake" is for static blocks', () => {
  const room = (type) => roomFile('alpha', { blocks: [{ type, at: [3, 0, 3] }], pickups: [{ id: 'p', type: 'refill_energy', at: [3, 0, 3] }] });
  assert.deepEqual(validateData(dataFiles({ rooms: [room('fake')] })), []);
  assert.match(validateData(dataFiles({ rooms: [room('block')] })).join('\n'), /pickups\[0\].*filled by blocks\[0\]/);
  const blocks = { block: { look: 'plain' }, sinking: { kind: 'gate', trigger: 'step', fake: true } };
  assert.match(validateData(dataFiles({ rooms: [roomFile('alpha')], blocks })).join('\n'), /fake: only for static blocks/);
});

test('scan look: the square clips to the floor, fades after spreading; a hidden exit derezzes from a slab', () => {
  const size = [12, 4, 12];
  const [north, east, south, west] = scanSquare([2, 1, 6], 3, size);
  const y = 1 + SCAN_FX.lift;
  assert.deepEqual(north, [[0, y, 3], [5, y, 3]], 'clipped at x 0');
  assert.deepEqual(east, [[5, y, 3], [5, y, 9]]);
  assert.deepEqual(south, [[0, y, 9], [5, y, 9]]);
  assert.equal(west, null, 'off the floor');
  assert.deepEqual(scanSquare([2, 0, 6], 20, size), [null, null, null, null], 'beyond the room');
  assert.equal(waveBrightness(0), 1);
  assert.equal(waveBrightness(SCAN.spreadTicks), 1);
  assert.ok(waveBrightness(PLAYER.scanTicks - 1) < 0.2);
  assert.equal(waveBrightness(PLAYER.scanTicks), 0);
  const back = exitSlab(withExitDefaults(HIDDEN), size);
  assert.deepEqual(back, { body: { size: [2, 2, SCAN_FX.slab] }, at: [9, 0, 0] });
  const front = exitSlab(withExitDefaults({ id: 'e', side: '+x', at: 4 }), size);
  assert.deepEqual(front, { body: { size: [SCAN_FX.slab, SCAN_FX.frontSlab, 2] }, at: [12, 0, 5] });
});
