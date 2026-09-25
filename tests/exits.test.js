import { test } from 'node:test';
import assert from 'node:assert/strict';
import STRINGS from '../data/strings.json' with { type: 'json' };
import { loadGameData } from '../src/data/load.js';
import { exitCells, withExitDefaults } from '../src/data/room-data.js';
import { Pushable } from '../src/entities/pushable.js';
import { Game, TRANSITION } from '../src/game.js';
import { mergeUnitSegments } from '../src/render/edges.js';
import { TUNNEL_DEPTH, doorwayTunnels, frontChevrons, wallLayout } from '../src/render/walls.js';
import { EXIT_FX, exitStreamLayout, glideState } from '../src/render/exit-view.js';
import { arrival, exitAt } from '../src/world/exits.js';
import { Grid } from '../src/world/grid.js';

/** Two rooms joined east ↔ west; beta's exit is raised onto a ledge. */
function content() {
  return loadGameData({
    'defs.json': { schemaVersion: 1, objects: { crate: { kind: 'pushable', color: '#b6ff3c' } } },
    'biomes.json': { schemaVersion: 1, biomes: { home: { name: 'Home', color: '#ffb020' } } },
    'world.json': { schemaVersion: 1, start: 'alpha', connections: [['alpha.east', 'beta.west']] },
    'strings.json': structuredClone(STRINGS),
    'rooms/alpha.json': {
      schemaVersion: 1,
      id: 'alpha',
      name: 'Alpha',
      biome: 'home',
      size: [8, 4, 8],
      spawn: [1.5, 0, 1.5],
      exits: [{ id: 'east', side: '+x', at: 3 }],
    },
    'rooms/beta.json': {
      schemaVersion: 1,
      id: 'beta',
      name: 'Beta',
      biome: 'home',
      size: [12, 4, 6],
      spawn: [6, 0, 2],
      exits: [{ id: 'west', side: '-x', at: 1, y: 1 }],
      blocks: [{ at: [0, 0, 1], to: [1, 0, 2] }],
    },
  });
}

const idle = { down: () => false, pressed: () => false };
const hold = (action) => ({ down: (a) => a === action, pressed: () => false });

/** Run the game for `ticks` ticks, or until the room changes; returns all events. */
function run(game, input, ticks) {
  const events = [];
  for (let i = 0; i < ticks && !events.includes('room'); i++) events.push(...game.update(input));
  return events;
}

test('exit cells: the row beyond the side and the first row inside', () => {
  const exit = withExitDefaults({ id: 'e', side: '+x', at: 3, width: 1, height: 2 });
  assert.deepEqual(exitCells(exit, [8, 4, 6]), {
    outside: [[8, 0, 3], [8, 1, 3]],
    inside: [[7, 0, 3], [7, 1, 3]],
  });
  const north = withExitDefaults({ id: 'n', side: '-z', at: 2, width: 1, y: 1 });
  assert.deepEqual(exitCells(north, [8, 4, 6]).outside, [[2, 1, -1], [2, 2, -1]]);
});

test('grid: exit openings are open, the rest of the boundary stays solid', () => {
  const g = new Grid({ size: [8, 4, 8], cells: [], holes: [], exits: [withExitDefaults({ id: 'e', side: '+x', at: 3 })] });
  assert.equal(g.isSolid(8, 0, 3), false);
  assert.equal(g.isSolid(8, 1, 4), false);
  assert.equal(g.isSolid(8, 2, 3), true); // above the opening
  assert.equal(g.isSolid(8, 0, 5), true); // beside it
  assert.equal(g.isSolid(8, -1, 3), true); // below the floor
  assert.equal(g.isInside(8, 3), false);
  assert.equal(g.isInside(7, 3), true);
});

test('exitAt: only once the feet center is past the side, within the opening', () => {
  const room = { size: [8, 4, 8], exits: [withExitDefaults({ id: 'e', side: '+x', at: 3 })] };
  assert.equal(exitAt(room, [7.9, 0, 4]), null);
  assert.equal(exitAt(room, [8.01, 0, 4]).id, 'e');
  assert.equal(exitAt(room, [8.01, 0, 6]), null);
});

test('arrival keeps the offset along the edge and the height above the exit floor', () => {
  const from = withExitDefaults({ id: 'e', side: '+x', at: 3 });
  const to = withExitDefaults({ id: 'w', side: '-x', at: 1, y: 1 });
  const { pos, spawn } = arrival(from, [8.1, 0.4, 4.2], to, [12, 4, 6]);
  assert.deepEqual(pos.map((v) => +v.toFixed(6)), [0.5, 1.4, 2.2]);
  assert.deepEqual(spawn.map((v) => +v.toFixed(6)), [0.5, 1, 2.2]);
  // Near the edge of the opening the whole body stays inside it.
  assert.equal(arrival(from, [8.1, 0, 3.05], to, [12, 4, 6]).pos[2], 1.3);
  // Leaving through a -z side arrives at the +z side of the next room.
  const north = withExitDefaults({ id: 'n', side: '-z', at: 2 });
  const south = withExitDefaults({ id: 's', side: '+z', at: 5 });
  assert.deepEqual(arrival(north, [3, 0, -0.1], south, [10, 4, 7]).pos, [6, 0, 6.5]);
});

test('loadGameData links connected exits both ways', () => {
  const { links } = content();
  assert.deepEqual(links.get('alpha.east'), { room: 'beta', exit: 'west' });
  assert.deepEqual(links.get('beta.west'), { room: 'alpha', exit: 'east' });
});

test('walking out through an exit enters the connected room at the matching exit', () => {
  const game = new Game(content());
  game.player.pos = [7, 0, 4.25];
  game.player.prev = [...game.player.pos];
  const events = run(game, hold('down'), 60); // Down = +x
  assert.ok(events.includes('exit'));
  assert.ok(events.includes('room'));
  assert.equal(game.room.id, 'beta');
  assert.deepEqual(game.player.spawn, [0.5, 1, 2.25]); // respawn point: the arrival on the exit floor
  run(game, idle, 10);
  assert.equal(game.player.grounded, true);
  assert.ok(Math.abs(game.player.pos[1] - 1) < 1e-9); // on the ledge

  // And back again.
  run(game, hold('up'), 60); // Up = −x
  assert.equal(game.room.id, 'alpha');
  assert.ok(Math.abs(game.player.pos[0] - 7.5) < 1e-9);
  assert.ok(Math.abs(game.player.pos[2] - 4.25) < 1e-9);
});

test('the room side beside an exit still blocks the wizard', () => {
  const game = new Game(content());
  game.player.pos = [7, 0, 1.5];
  run(game, hold('down'), 60);
  assert.equal(game.room.id, 'alpha');
  assert.ok(game.player.pos[0] <= 7.7 + 1e-9);
});

test('a respawn after travelling happens at the arrival point, in a fresh room', () => {
  const game = new Game(content());
  game.travel(game.room.exits[0]);
  game.player.pos = [5, 0, 4];
  const events = [];
  game.player.dead = true;
  game.player.deathTimer = 1;
  events.push(...game.update(idle));
  assert.deepEqual(events, ['respawn', 'room']);
  assert.equal(game.room.id, 'beta');
  assert.deepEqual(game.player.pos, game.player.spawn);
  assert.equal(game.player.spawn[0], 0.5);
});

test('objects are never pushed out through an exit', () => {
  const exits = [withExitDefaults({ id: 'e', side: '+x', at: 3 })];
  const grid = new Grid({ size: [8, 4, 8], cells: [], holes: [], exits });
  const crate = new Pushable({ id: 'c', at: [7, 0, 3] });
  assert.equal(crate.push([1, 0], { grid, bodies: [crate] }), false);
  assert.equal(crate.push([-1, 0], { grid, bodies: [crate] }), true);
});

test('walls: doorways are cut out of the wall faces and framed', () => {
  const plain = wallLayout([4, 3, 4], []);
  assert.equal(plain.faces.length, 2 * 4 * 3);
  const exits = [withExitDefaults({ id: 'n', side: '-z', at: 1, width: 2, height: 2 })];
  const { faces, outline } = wallLayout([4, 3, 4], exits);
  assert.equal(faces.length, 2 * 4 * 3 - 4);
  const has = (a, b) => outline.some(([p, q]) => `${p}|${q}` === `${a}|${b}` || `${q}|${p}` === `${a}|${b}`);
  assert.ok(has([1, 0, 0], [1, 2, 0])); // left jamb
  assert.ok(has([3, 0, 0], [3, 2, 0])); // right jamb
  assert.ok(has([1, 2, 0], [3, 2, 0])); // lintel
  assert.ok(has([1, 0, 0], [3, 0, 0])); // threshold
});

test('walls: floor-level exits leave a gap in the front edge', () => {
  const exits = [withExitDefaults({ id: 's', side: '+z', at: 1 })];
  const { outline } = wallLayout([4, 3, 4], exits);
  const front = outline.filter(([p, q]) => p[1] === 0 && q[1] === 0 && p[2] === 4 && q[2] === 4);
  assert.deepEqual(front, [
    [[0, 0, 4], [1, 0, 4]],
    [[3, 0, 4], [4, 0, 4]],
  ]);
});

test('front exits get one small arrow per tile, pointing out, back exits none', () => {
  const exits = [
    withExitDefaults({ id: 'e', side: '+x', at: 2, y: 1 }),
    withExitDefaults({ id: 'n', side: '-z', at: 1 }),
  ];
  const segments = frontChevrons([6, 4, 6], exits);
  assert.equal(segments.length, 4); // an arrow of two strokes per tile of width
  for (const [p, q] of segments) {
    assert.ok(Math.abs(p[1] - 1) < 0.02 && Math.abs(q[1] - 1) < 0.02); // on the exit floor
    // Within the first row of tiles, even after gliding in by arrowTravel.
    for (const point of [p, q]) assert.ok(point[0] < 6 && point[0] - EXIT_FX.arrowTravel > 5 && point[2] >= 2 && point[2] <= 4);
  }
  // The arrows' tips are centered on the tiles 2 and 3.
  assert.deepEqual([segments[0][1][2], segments[2][1][2]], [2.5, 3.5]);
  // The tip (shared point) is nearer the side than the arms.
  const [arm, tip] = segments[0];
  assert.ok(tip[0] > arm[0]);
});

test('mergeUnitSegments joins runs and drops duplicates', () => {
  const merged = mergeUnitSegments([
    [[1, 0, 0], [2, 0, 0]],
    [[0, 0, 0], [1, 0, 0]],
    [[1, 0, 0], [0, 0, 0]],
    [[3, 0, 0], [4, 0, 0]],
  ]);
  assert.deepEqual(merged, [
    [[0, 0, 0], [2, 0, 0]],
    [[3, 0, 0], [4, 0, 0]],
  ]);
});

test('a room transition fades out with the world frozen, then fades in while running', () => {
  const game = new Game(content());
  game.player.pos = [7.95, 0, 4.25];
  assert.deepEqual(game.update(hold('down')), ['exit']);
  assert.equal(game.room.id, 'alpha');
  assert.ok(game.fadeLevel(0) < 0.1);

  // Fading out: nothing but the wizard walking on out moves; input is ignored.
  let events = [];
  for (let i = 1; i < TRANSITION.outTicks; i++) events.push(...game.update(hold('up')));
  assert.deepEqual(events, []);
  assert.ok(game.player.pos[0] > 8.5);
  assert.ok(game.fadeLevel(1) > 0.99);

  assert.deepEqual(game.update(idle), ['room']);
  assert.equal(game.room.id, 'beta');
  assert.equal(game.fadeLevel(0), 1);

  // Fading in: the game runs (the wizard can walk) and the veil lifts.
  game.update(hold('down'));
  assert.ok(game.player.pos[0] > 0.5);
  for (let i = 1; i < TRANSITION.inTicks; i++) game.update(idle);
  assert.equal(game.transition, null);
  assert.equal(game.fadeLevel(0.5), 0);
});

test('front-exit arrows glide out of the room, fading in and out', () => {
  assert.deepEqual(glideState(0, 0.6), { out: 0, brightness: 0 });
  assert.equal(glideState(0.5, 0.6).brightness, 1);
  assert.ok(glideState(0.75, 0.6).out > glideState(0.25, 0.6).out);
  assert.ok(glideState(0.999, 0.6).brightness < 0.01 && Math.abs(glideState(0.999, 0.6).out - 0.6) < 0.01);
});

test('an exit effect has the color of the room it leads to', () => {
  const data = content();
  data.biomes.lava = { name: 'Lava', color: '#ff2020' };
  data.rooms.get('beta').biome = 'lava';
  const game = new Game(data);
  assert.equal(game.destinationColor(game.room.exits[0]), '#ff2020');
});

test('doorways lead into dark tunnels; front exits get none', () => {
  const exits = [
    withExitDefaults({ id: 'n', side: '-z', at: 1, y: 1 }),
    withExitDefaults({ id: 'e', side: '+x', at: 1 }),
  ];
  const { quads, lines } = doorwayTunnels([6, 4, 6], exits);
  assert.equal(quads.length, 5); // floor, ceiling, two sides, far end
  assert.equal(lines.length, 4); // one from each doorway corner
  for (const { points, shade } of quads) {
    points.forEach(([x, y, z], i) => {
      assert.ok(z <= 0 && z >= -TUNNEL_DEPTH); // behind the z = 0 wall
      assert.ok(x >= 1 && x <= 3 && y >= 1 && y <= 3); // within the doorway
      assert.ok(Math.abs(shade[i] - -z / TUNNEL_DEPTH) < 1e-9); // darker the deeper
    });
  }
  const [from, to] = lines[0];
  assert.deepEqual(from, [1, 1, 0]);
  assert.ok(to[2] < 0);
});

test('doorway stream: tunnel edges and floor lanes, flowing in; front exits have none', () => {
  const segments = exitStreamLayout(withExitDefaults({ id: 'n', side: '-z', at: 1 }));
  assert.equal(segments.length, 6); // four corner edges, two floor lanes
  for (const [from, to] of segments) {
    assert.equal(from[2], 0); // starts at a doorway corner
    assert.ok(to[2] < 0 && from[0] === to[0] && from[1] === to[1]); // runs straight into the tunnel
  }
  assert.deepEqual(exitStreamLayout(withExitDefaults({ id: 'e', side: '+x', at: 1 })), []);
});
