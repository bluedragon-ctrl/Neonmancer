import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data/load.js';
import { validateData } from '../src/data/validate.js';
import { OPPOSITE_SIDE } from '../src/data/room-data.js';
import { Game } from '../src/game.js';
import { buildRoom } from '../src/world/room.js';
import { analyzeRoom } from '../src/world/reach.js';
import { CRATE, dataFiles, gameData, hold, idle, roomFile } from './helpers.js';

/** Object types as in defs.json. */
const TYPES = {
  crate: CRATE,
  plate: { kind: 'plate', color: '#eef3ff' },
  socket: { kind: 'socket', color: '#eef3ff' },
};
const SOCKET = { id: 's', type: 'socket', at: [4, 0, 3] };
const LOCKED_EAST = { id: 'east', side: '+x', at: 3, requires: [{ switch: '*' }] };

/** Two rooms: alpha (8×4×8, its east exit locked, with `objects`) and beta. */
function files(objects) {
  return dataFiles({
    rooms: [
      roomFile('alpha', { exits: [LOCKED_EAST], objects }),
      roomFile('beta', { spawn: [1, 0, 4], exits: [{ id: 'west', side: '-x', at: 3 }] }),
    ],
    objects: TYPES,
    connections: [['alpha.east', 'beta.west']],
  });
}

function run(game, inp, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(inp));
  return events;
}

test('a socket is a hole that switches on once a crate fills it (D194)', () => {
  const game = new Game(loadGameData(files([SOCKET, { id: 'c', type: 'crate', at: [2, 0, 3] }])), { start: 'alpha' });
  const [socket] = game.switches;
  assert.equal(game.grid.isHole(4.5, 3.5), true, 'its tile is a hole');
  game.update(idle);
  assert.equal(socket.on, false);
  assert.equal(game.locks[0].open, false);

  // Push the crate along +x into it.
  game.player.place([1.5, 0, 3.5]);
  const events = run(game, hold('down'), 90);
  assert.equal(game.grid.isHole(4.5, 3.5), false, 'the crate plugged it');
  assert.equal(socket.on, true);
  assert.ok(events.some((e) => e.type === 'switch' && e.object === socket));
  assert.equal(game.locks[0].open, true);

  // A plug that goes (a compiled crate's time is up) opens the hole: off again.
  game.objects.find((object) => object.id === 'c').expire(game.grid);
  game.player.place([1.5, 0, 6.5]);
  run(game, idle, 2);
  assert.equal(socket.on, false);
});

test('socket data: on the floor, its tile a hole that nothing else claims; never timed', () => {
  const errorsOf = (objects, change = () => {}) => {
    const data = files(objects);
    change(data);
    return validateData(data);
  };
  assert.deepEqual(errorsOf([SOCKET]), []);
  assert.match(errorsOf([{ ...SOCKET, at: [4, 1, 3] }])[0], /a socket lies on the floor/);
  assert.match(errorsOf([SOCKET], (data) => (data['rooms/alpha.json'].holes = [{ at: [4, 3] }]))[0], /tile \[4,3\] is already a hole in objects\[0\]/);
  assert.match(errorsOf([SOCKET, { id: 'p', type: 'plate', at: [4, 0, 3] }])[0], /has objects\[0\] already/);
  const enemy = errorsOf([SOCKET], (data) => (data['rooms/alpha.json'].enemies = [{ id: 'b', template: 'bug', at: [4, 0, 3] }]));
  assert.match(enemy.join('\n'), /starts over objects\[0\]/);
  assert.match(errorsOf([SOCKET], (data) => (data['defs.json'].objects.socket.timer = 3)).join('\n'), /only switches \(targets and plates\) are timed, not a socket/);
});

test('reach: a socket needs a crate in its hole; a decoy or a frozen enemy is no help, Compile is', () => {
  const reach = (objects, abilities = [], enemies = []) => {
    const west = { id: 'west', side: '-x', at: 3 };
    const exits = [west, LOCKED_EAST];
    const dummy = roomFile('o', { exits: exits.map((exit) => ({ id: `${exit.id}_o`, side: OPPOSITE_SIDE[exit.side], at: 3 })) });
    const content = gameData({ rooms: [roomFile('r', { size: [12, 4, 8], exits, objects, enemies }), dummy], connections: exits.map((exit) => [`r.${exit.id}`, `o.${exit.id}_o`]), objects: TYPES });
    return analyzeRoom(buildRoom(content.rooms.get('r'), content), { abilities, starts: [[1, 0, 1]], tuning: { scanRange: 6, blinkRange: 3 } }).exits.east;
  };
  const crate = { id: 'c', type: 'crate', at: [2, 0, 3] };
  assert.equal(reach([SOCKET, crate]), true);
  assert.equal(reach([SOCKET]), false);
  // A bug walking past it, frozen and pushed in, pops instead of plugging it.
  const bug = { id: 'b', template: 'bug', at: [3, 0, 1], path: { points: [[3, 0, 5]] } };
  assert.equal(reach([SOCKET], ['fork', 'pause', 'zap'], [bug]), false);
  assert.equal(reach([SOCKET], ['compile']), true);
  // A crate in a corner never gets there.
  assert.equal(reach([SOCKET, { ...crate, at: [0, 0, 0] }]), false);
});
