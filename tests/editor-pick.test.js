import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomEdit } from '../src/editor/room-edit.js';
import { firstHit, hitBoxes, pickCell, rayBox } from '../src/editor/pick.js';
import { roomFile } from './helpers.js';

/** The editor camera looks from +x +y +z (isometric), so a ray runs towards -x -y -z. */
const DIR = [-1, -Math.SQRT2, -1];

/** A ray through point `p`, starting well above it. */
const through = (p) => [p[0] + 10, p[1] + 10 * Math.SQRT2, p[2] + 10];

const TYPES = {
  crate: { kind: 'pushable', color: '#b6ff3c' },
  plate: { kind: 'plate', color: '#eef3ff' },
  pillar: { kind: 'deco', look: 'data_pillar', color: '#ffb020' },
};

function room() {
  return new RoomEdit(
    roomFile('alpha', {
      blocks: [{ type: 'block', at: [3, 0, 3] }, { type: 'block', at: [6, 2, 6] }],
      objects: [
        { id: 'c', type: 'crate', at: [5, 0, 2] },
        { id: 'p', type: 'plate', at: [2, 0, 6] },
        { id: 'd', type: 'pillar', at: [1, 0, 1] },
      ],
    }),
  );
}

test('editor pick: a ray enters a box, or misses it', () => {
  assert.equal(rayBox([0, 5, 0], [0, -1, 0], [-1, 0, -1], [1, 1, 1]), 4);
  assert.equal(rayBox([3, 5, 0], [0, -1, 0], [-1, 0, -1], [1, 1, 1]), null);
  assert.equal(rayBox([0, -5, 0], [0, -1, 0], [-1, 0, -1], [1, 1, 1]), null, 'behind the ray');
  assert.equal(firstHit([0, 5, 0], [0, -1, 0], [{ cell: [0, 0, 0], lo: [-1, 0, -1], hi: [1, 1, 1] }, { cell: [0, 1, 0], lo: [-1, 1, -1], hi: [1, 2, 1] }]).cell.join(), '0,1,0');
});

test('editor pick: the top of a block on the layer is the block, not the floor behind it', () => {
  const edit = room();
  const boxes = hitBoxes(edit, TYPES, { cutAbove: 0 });
  // The middle of the block's top: the layer plane there lies behind the block, in cell 2,0,2.
  const top = [3.5, 1, 3.5];
  assert.deepEqual(pickCell(through(top), DIR, boxes, 0).cell, [3, 0, 3]);
  // Open floor: the layer's cell (null: the caller makes it).
  const floor = pickCell(through([4.5, 0, 6.5]), DIR, boxes, 0);
  assert.equal(floor.cell, null);
  assert.deepEqual(floor.point.map((v) => Math.round(v * 100) / 100), [4.5, 0, 6.5]);
  // On layer 1 the same spot is the free cell on top of the block.
  assert.equal(pickCell(through(top), DIR, hitBoxes(edit, TYPES, { cutAbove: 1 }), 1).cell, null);
});

test('editor pick: items by their own cell, cut away above the layer, plates thin', () => {
  const edit = room();
  const boxes = hitBoxes(edit, TYPES, { cutAbove: 0 });
  assert.deepEqual(pickCell(through([5.5, 1, 2.5]), DIR, boxes, 0).cell, [5, 0, 2], 'the crate');
  // The tall pillar's side, high above its own cell: still the pillar at 1,0,1.
  assert.deepEqual(pickCell(through([2, 2.5, 1.5]), DIR, boxes, 0).cell, [1, 0, 1]);
  // A ray just past a plate's top edge reaches the floor behind it.
  assert.equal(pickCell(through([1.9, 0.5, 6.5]), DIR, boxes, 0).cell, null);
  // The block at layer 2 is cut away on layer 0, seen (and hit) with nothing cut.
  const high = through([6.5, 3, 6.5]);
  assert.equal(pickCell(high, DIR, boxes, 0).cell, null);
  assert.deepEqual(pickCell(high, DIR, hitBoxes(edit, TYPES), 0).cell, [6, 2, 6]);
  // Items only (the Path tool): blocks don't count.
  assert.equal(pickCell(through([3.5, 1, 3.5]), DIR, hitBoxes(edit, TYPES, { cutAbove: 0, blocks: false }), 0).cell, null);
});
