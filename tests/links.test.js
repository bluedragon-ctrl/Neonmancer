import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveConnections, partnerOf } from '../src/world/links.js';

const exit = (id, side, at, more = {}) => ({ id, side, at, ...more });

test('an exit leads to the room in the next map cell in its direction (D259)', () => {
  const rooms = new Map([
    ['a', { exits: [exit('east', '+x', 3), exit('south', '+z', 3)] }],
    ['b', { exits: [exit('west', '-x', 1)] }],
    ['c', { exits: [exit('north', '-z', 5)] }],
  ]);
  const { pairs, problems } = deriveConnections({ a: [0, 0], b: [1, 0], c: [0, 1] }, rooms);
  assert.deepEqual(pairs, [['a.east', 'b.west'], ['a.south', 'c.north']]);
  assert.deepEqual(problems, []);
  assert.equal(partnerOf(pairs, 'b.west'), 'a.east');
  assert.equal(partnerOf(pairs, 'a.west'), null);
});

test('several exits in one side pair up in order along it, then by floor level', () => {
  const rooms = new Map([
    ['a', { exits: [exit('high', '+x', 2, { y: 2 }), exit('far', '+x', 6), exit('low', '+x', 2)] }],
    ['b', { exits: [exit('w3', '-x', 7), exit('w1', '-x', 0), exit('w2', '-x', 0, { y: 1 })] }],
  ]);
  const { pairs } = deriveConnections({ a: [0, 0], b: [1, 0] }, rooms);
  assert.deepEqual(pairs, [['a.low', 'b.w1'], ['a.high', 'b.w2'], ['a.far', 'b.w3']]);
});

test('what can not be paired is a problem of its exit', () => {
  const rooms = new Map([
    ['a', { exits: [exit('east', '+x', 3), exit('east_2', '+x', 6), exit('north', '-z', 2)] }],
    ['b', { exits: [exit('west', '-x', 3, { width: 3 })] }],
    ['lost', { exits: [exit('west', '-x', 0)] }],
  ]);
  const { pairs, problems } = deriveConnections({ a: [0, 0], b: [1, 0] }, rooms);
  assert.deepEqual(pairs, [['a.east', 'b.west']]);
  assert.deepEqual(
    problems.map(({ room, index, message }) => `${room}[${index}] ${message}`),
    [
      'a[0] exit "east" must be as wide as "b.west" (2 and 3)',
      'a[1] exit "east_2" has no exit to lead to in "b"\'s -x side (2 here, 1 there)',
      'a[2] exit "north" leads nowhere: no room in the next map cell [0,-1]',
      'b[0] exit "west" must be as wide as "a.east" (3 and 2)',
      'lost[0] exit "west" leads nowhere: the room has no map cell',
    ],
  );
});

test('a pair can be one-way at one end (D259), not at both', () => {
  const rooms = (aWay, bWay) =>
    new Map([
      ['a', { exits: [exit('east', '+x', 3, { oneWay: aWay })] }],
      ['b', { exits: [exit('west', '-x', 3, { oneWay: bWay })] }],
    ]);
  assert.deepEqual(deriveConnections({ a: [0, 0], b: [1, 0] }, rooms(false, true)).problems, []);
  assert.equal(deriveConnections({ a: [0, 0], b: [1, 0] }, rooms(true, true)).problems.length, 2);
});
