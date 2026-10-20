import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL, EDGE_TYPE } from '../src/world/grid.js';
import { grid } from './helpers.js';

test('grid: each cell points to its block type and its properties (D60)', () => {
  const g = grid({ cells: [[1, 0, 1]], blocks: { fence: [[2, 0, 2]], fake: [[3, 0, 3]] } });
  assert.equal(g.typeAt(1, 0, 1).id, 'block');
  assert.equal(g.typeAt(2, 0, 2).seeThrough, true);
  assert.equal(g.typeAt(3, 0, 3).fake, true);
  assert.equal(g.typeAt(4, 0, 4), null);
  assert.equal(g.typeAt(-1, 0, 0), EDGE_TYPE); // beyond a side
  assert.equal(g.cellAt(4, 0, 4), CELL.empty);
  assert.equal(g.isSolid(2, 0, 2), true);
  assert.equal(g.isSolid(3, 0, 3), true);
});
