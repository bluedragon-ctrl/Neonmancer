import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapWarnings, nearestFreeCell, roomDistances } from '../src/world/map.js';

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
