import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cageLayout } from '../src/render/cage-view.js';

test('a cage is bars round a cell: ring, lid, four posts and four side bars, inside the cell', () => {
  const { beams, rails, posts, bars } = cageLayout();
  assert.equal(beams.length, 4);
  assert.equal(rails.length, 6);
  assert.equal(posts.length, 4);
  assert.equal(bars.length, 4);
  for (const segment of [...beams, ...rails, ...posts, ...bars]) {
    for (const point of segment) for (const v of point) assert.ok(v >= 0 && v <= 1);
  }
  // Horizontal beams at half height flow like a fence's lower beam, the rest at the top.
  assert.ok(beams.every((s) => s[0][1] === 0.5));
  assert.ok(rails.every((s) => s[0][1] === 1));
});
