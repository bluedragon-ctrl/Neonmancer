import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapWarnings, nearestFreeCell, roomDistances } from '../src/world/map.js';
import { bitBlock, pickupReport } from '../src/world/pickup-report.js';
import { PICKUPS, SPELLS } from './helpers.js';

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

test('mapWarnings flags rooms the start cannot reach and test rooms more than two rooms away (D49)', () => {
  const world = { start: 'a', connections: [['a.e', 'b.w'], ['b.e', 'c.w'], ['c.e', 'd.w']] };
  assert.deepEqual(mapWarnings(world, ['a', 'b', 'c', 'd', 'lost']), { unreachable: ['lost'], far: [{ id: 'd', distance: 3 }] });
});

test('mapWarnings leaves authored rooms far from the start alone (D90)', () => {
  const world = { start: 'a', connections: [['a.e', 'b.w'], ['b.e', 'c.w'], ['c.e', 'd.w']] };
  assert.deepEqual(mapWarnings(world, ['a', 'b', 'c', 'd', 'lost'], new Set(['d', 'lost'])), { unreachable: ['lost'], far: [] });
});

test('pickup report: every permanent item by its bit, where it lies, not placed or placed twice; refills per type', () => {
  const rooms = new Map([
    ['alpha', { pickups: [{ id: 'd', type: 'disk_zap', at: [1, 0, 1] }, { id: 'r', type: 'refill_energy', at: [2, 0, 2] }] }],
    ['beta', { pickups: [{ id: 'd2', type: 'disk_zap', at: [3, 0, 3] }, { id: 'b', type: 'buff_recharge', at: [4, 0, 4] }, { id: 'x', type: 'nope', at: [5, 0, 5] }] }],
    ['gamma', {}],
  ]);
  const { items, refills, unknown } = pickupReport(PICKUPS, SPELLS, rooms);
  assert.deepEqual(items.map((item) => item.bit), [0, 1, 2, 3, 4, 5, 6, 16, 17, 20, 25], 'every defined item, in bit order');
  const zap = items[0];
  assert.deepEqual(zap.types, ['disk_zap']);
  assert.deepEqual(zap.places, [{ room: 'alpha', id: 'd', at: [1, 0, 1] }, { room: 'beta', id: 'd2', at: [3, 0, 3] }], 'placed twice');
  assert.deepEqual(items[1].places, [], 'the Shield disk is not placed');
  const recharge = items.find((item) => item.bit === 25);
  assert.deepEqual([recharge.block, recharge.slot, recharge.places.length], ['buffs', 9, 1]);
  assert.deepEqual(refills.find((refill) => refill.type === 'refill_energy').places, [{ room: 'alpha', id: 'r', at: [2, 0, 2] }]);
  assert.deepEqual(unknown, [{ room: 'beta', id: 'x', type: 'nope' }]);
  assert.deepEqual(bitBlock(48), { block: 'fragments', slot: 0 });
  assert.equal(bitBlock(112), null);
});
