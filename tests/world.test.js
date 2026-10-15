import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapWarnings, nearestFreeCell, roomDistances } from '../src/world/map.js';
import { bitBlock, pickupReport } from '../src/world/pickup-report.js';
import { PICKUPS, SPELLS, dataFiles, roomFile } from './helpers.js';
import { checkFiles, readSchemas } from '../tools/check-data.js';
import { fileURLToPath } from 'node:url';
import { loadGameData } from '../src/data/load.js';

test('nearestFreeCell takes a free neighbour first (east, south, west, north), then the next ring', () => {
  assert.deepEqual(nearestFreeCell({ a: [0, 0] }, [0, 0]), [1, 0]);
  assert.deepEqual(nearestFreeCell({ a: [0, 0], b: [1, 0] }, [0, 0]), [0, 1]);
  const ring = { a: [0, 0], b: [1, 0], c: [0, 1], d: [-1, 0], e: [0, -1] };
  const next = nearestFreeCell(ring, [0, 0]);
  assert.equal(Math.max(Math.abs(next[0]), Math.abs(next[1])), 1, 'a diagonal before two cells away');
  assert.deepEqual(nearestFreeCell({}, [3, -2]), [4, -2]);
});

test('roomDistances counts rooms from the start through connections', () => {
  const connections = [['a.e', 'b.w'], ['b.e', 'c.w'], ['c.e', 'd.w'], ['a.s', 'd.n'], ['x.e', 'y.w']];
  assert.deepEqual(Object.fromEntries(roomDistances('a', connections)), { a: 0, b: 1, d: 1, c: 2 });
});

test('mapWarnings flags only rooms the start cannot reach, however far out the others lie (D178)', () => {
  const world = { start: 'a', connections: [['a.e', 'b.w'], ['b.e', 'c.w'], ['c.e', 'd.w'], ['d.e', 'e.w']] };
  assert.deepEqual(mapWarnings(world, ['a', 'b', 'c', 'd', 'e', 'lost']), { unreachable: ['lost'] });
});

test('pickup report: every permanent item by its bit, where it lies, not placed or placed twice; refills per type', () => {
  const rooms = new Map([
    ['alpha', { pickups: [{ id: 'd', type: 'disk_zap', at: [1, 0, 1] }, { id: 'r', type: 'refill_energy', at: [2, 0, 2] }] }],
    ['beta', { pickups: [{ id: 'd2', type: 'disk_zap', at: [3, 0, 3] }, { id: 'b', type: 'buff_recharge', at: [4, 0, 4] }, { id: 'x', type: 'nope', at: [5, 0, 5] }] }],
    ['gamma', {}],
  ]);
  const { items, refills, unknown } = pickupReport(PICKUPS, SPELLS, rooms);
  assert.deepEqual(items.map((item) => item.bit), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16, 17, 20, 25, 32, 33, 48, 49, 50, 51, 112, 113], 'every defined item, in bit order');
  assert.deepEqual(bitBlock(items.at(-1).bit), { block: 'secrets', slot: 1 }, 'the second secret');
  const zap = items[0];
  assert.deepEqual(zap.types, ['disk_zap']);
  assert.deepEqual(zap.places, [{ room: 'alpha', id: 'd', at: [1, 0, 1] }, { room: 'beta', id: 'd2', at: [3, 0, 3] }], 'placed twice');
  assert.deepEqual(items[1].places, [], 'the Shield disk is not placed');
  const recharge = items.find((item) => item.bit === 25);
  assert.deepEqual([recharge.block, recharge.slot, recharge.places.length], ['buffs', 9, 1]);
  assert.deepEqual(refills.find((refill) => refill.type === 'refill_energy').places, [{ room: 'alpha', id: 'r', at: [2, 0, 2] }]);
  assert.deepEqual(unknown, [{ room: 'beta', id: 'x', type: 'nope' }]);
  assert.deepEqual(bitBlock(48), { block: 'fragments', slot: 0 });
  assert.equal(bitBlock(128), null);
});

const schemas = readSchemas(fileURLToPath(new URL('..', import.meta.url)));

/** alpha - beta - gamma in a row; beta and gamma are the dev wing. */
function files(dev = ['beta', 'gamma']) {
  return dataFiles({
    rooms: [
      roomFile('alpha', { exits: [{ id: 'east', side: '+x', at: 3 }] }),
      roomFile('beta', { exits: [{ id: 'west', side: '-x', at: 3 }, { id: 'east', side: '+x', at: 3 }] }),
      roomFile('gamma', { exits: [{ id: 'west', side: '-x', at: 3 }] }),
    ],
    connections: [['alpha.east', 'beta.west'], ['beta.east', 'gamma.west']],
    dev,
  });
}

test('the dev wing is part of the world by default (dev server, tests, tools)', () => {
  const content = loadGameData(files());
  assert.deepEqual([...content.rooms.keys()], ['alpha', 'beta', 'gamma']);
});

test('a build for players leaves out the dev wing and walls up the exits into it', () => {
  const content = loadGameData(files(), { dev: false });
  assert.deepEqual([...content.rooms.keys()], ['alpha']);
  assert.deepEqual(content.rooms.get('alpha').exits, []);
  assert.deepEqual(content.world.connections, []);
  assert.deepEqual(Object.keys(content.world.positions), ['alpha']);
  assert.equal(content.links.size, 0);
});

test('without a dev wing nothing changes', () => {
  const all = files([]);
  assert.equal(loadGameData(all, { dev: false }).rooms.size, 3);
});

test('dev wing data checks: unknown rooms and the start room are refused', () => {
  assert.deepEqual(checkFiles(files(), schemas), []);
  const unknown = checkFiles(files(['nowhere']), schemas);
  assert.equal(unknown.length, 1);
  assert.match(unknown[0], /unknown room "nowhere"/);
  const start = checkFiles(files(['alpha']), schemas);
  assert.equal(start.length, 1);
  assert.match(start[0], /start room/);
});
