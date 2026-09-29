import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data/load.js';
import { Game } from '../src/game.js';
import { MAP_ASPECT, fitView, projectCell } from '../src/ui/map-screen.js';
import { MenuFlow } from '../src/ui/menus.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { ROOM_SIZE, RunMap, exitPoint, mapModel, roomsAround } from '../src/world/run-map.js';
import { input, testWorld } from './helpers.js';

/**
 * testWorld() with a fragment in boot_sector and stack_yard, and a backup
 * shrine in fault_line (map cells in tests/helpers.js).
 */
function world() {
  const files = testWorld();
  files['rooms/boot_sector.json'].pickups = [{ id: 'f0', type: 'fragment_0', at: [2, 0, 2] }];
  files['rooms/stack_yard.json'].pickups = [{ id: 'f1', type: 'fragment_1', at: [2, 0, 2] }];
  files['rooms/fault_line.json'].shrine = [3, 3];
  return loadGameData(files);
}

const ids = (model) => model.rooms.map((room) => room.id).sort();

test('the run map starts with the start room only; entering rooms adds them', () => {
  const game = new Game(world());
  assert.deepEqual([...game.map.visited], ['boot_sector']);
  assert.equal(game.map.revealed.size, 0);
  game.enterRoom('stack_yard');
  assert.deepEqual([...game.map.visited].sort(), ['boot_sector', 'stack_yard']);
});

test('a new game or a loaded save starts the map empty (it is never saved)', () => {
  const game = new Game(world());
  game.enterRoom('stack_yard');
  game.reset({ start: 'fault_line', progress: new Progress() });
  assert.deepEqual([...game.map.visited], ['fault_line']);
});

test('a backup shrine reveals the rooms within 2 map cells, which stay once he leaves', () => {
  const game = new Game(world());
  game.enterRoom('fault_line');
  game.useShrine();
  // fault_line [2,0]: stack_yard [1,0], relay_station [1,-1], volatile_memory [1,1], boot_sector [0,0].
  assert.deepEqual([...game.map.revealed].sort(), ['boot_sector', 'fault_line', 'relay_station', 'stack_yard', 'volatile_memory']);
  game.enterRoom('stack_yard');
  assert.ok(game.map.shows('relay_station'));
  assert.deepEqual(roomsAround({ a: [0, 0], b: [1, 1], c: [2, 1], d: [0, -2] }, 'a'), ['a', 'b', 'd']);
});

test('the map model: visited rooms, dim revealed ones, connections between shown rooms, stubs for the rest', () => {
  const content = world();
  const map = new RunMap();
  map.visit('boot_sector');
  map.visit('stack_yard');
  map.reveal(['relay_station']);
  const model = mapModel(content, map, { current: 'stack_yard', progress: new Progress() });
  assert.deepEqual(ids(model), ['boot_sector', 'relay_station', 'stack_yard']);
  const relay = model.rooms.find((room) => room.id === 'relay_station');
  assert.equal(relay.visited, false);
  assert.equal(model.rooms.find((room) => room.id === 'stack_yard').current, true);
  // boot–stack (both visited) and relay–stack (one revealed, dim).
  assert.equal(model.links.length, 2);
  assert.deepEqual(model.links.map((link) => link.visited).sort(), [false, true]);
  assert.ok(model.links.every((link) => link.adjacent));
  // boot_sector's north, south and west lead off the map; stack_yard's east too.
  // The revealed relay_station shows no exits of its own.
  assert.equal(model.stubs.length, 4);
});

test('a visited room is marked while a fragment he has not found lies in it', () => {
  const content = world();
  const map = new RunMap();
  map.visit('boot_sector');
  map.reveal(['stack_yard']);
  const progress = new Progress();
  const marked = (p) => mapModel(content, map, { current: 'boot_sector', progress: p }).rooms.filter((room) => room.fragment).map((room) => room.id);
  // stack_yard's fragment isn't shown: he hasn't been there.
  assert.deepEqual(marked(progress), ['boot_sector']);
  progress.collect(saveBit('fragments', 0));
  assert.deepEqual(marked(progress), []);
});

test('a shrine shows on the map in a visited room', () => {
  const content = world();
  const map = new RunMap();
  map.visit('fault_line');
  const model = mapModel(content, map, { current: 'fault_line', progress: new Progress() });
  assert.equal(model.rooms[0].shrine, true);
});

test('an exit sits in the middle of its opening on its side of the room square', () => {
  const size = [12, 4, 12];
  // East (+x) at 5, width 2: middle 6 of 12, so halfway along z.
  assert.deepEqual(exitPoint([0, 0], { side: '+x', at: 5, width: 2 }, size), { at: [ROOM_SIZE / 2, 0], out: [1, 0] });
  const north = exitPoint([1, 2], { side: '-z', at: 0, width: 3 }, size);
  assert.deepEqual(north.out, [0, -1]);
  assert.ok(Math.abs(north.at[0] - (1 + (1.5 / 12 - 0.5) * ROOM_SIZE)) < 1e-9);
  assert.equal(north.at[1], 2 - ROOM_SIZE / 2);
});

test('the map is seen like the rooms: east is down-right, south down-left', () => {
  const [ex, ey] = projectCell([1, 0]);
  const [sx, sy] = projectCell([0, 1]);
  assert.ok(ex > 0 && ey > 0);
  assert.ok(sx < 0 && sy > 0);
  // A lone room isn't blown up to fill the screen; a wide map fits.
  const [, , w, h] = fitView([[0, 0]]);
  assert.ok(w >= 8);
  assert.ok(Math.abs(w / h - MAP_ASPECT) < 1e-9, "the view has the map area's shape");
  const wide = fitView([
    [0, 0],
    [12, -12],
  ]);
  assert.ok(wide[2] > 20);
  assert.ok(Math.abs(wide[2] / wide[3] - MAP_ASPECT) < 1e-9);
});

test('M opens the map over the game; M, Esc or Enter close it; the pause menu has Map too', () => {
  const press = (...actions) => input([], actions);
  const flow = new MenuFlow('playing');
  flow.update(press('map'));
  assert.equal(flow.top.id, 'map');
  assert.equal(flow.playing, false);
  flow.update(press('down'));
  flow.update(press('map'));
  assert.equal(flow.playing, true);
  flow.update(press('map'));
  flow.update(press('pause'));
  assert.equal(flow.playing, true, 'Esc closes the map, not opening the pause menu');
  flow.update(press('pause'));
  flow.select(flow.items('pause').indexOf('map'));
  flow.update(press('confirm'));
  assert.equal(flow.top.id, 'map');
  flow.update(press('confirm'));
  assert.equal(flow.top.id, 'pause', 'closing it goes back to the pause menu');
});
