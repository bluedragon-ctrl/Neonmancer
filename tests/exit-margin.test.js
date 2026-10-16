import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exitDistance, piecesNearExits } from '../src/world/exit-margin.js';

// A 10×10 room with a west door at z 4–5 and a south (+z) door at x 2–3.
const room = (objects) => ({
  size: [10, 4, 10],
  exits: [{ id: 'west', side: '-x', at: 4, width: 2 }, { id: 'south', side: '+z', at: 2, width: 2 }],
  objects,
});

test('distance to a doorway counts across the side and past its ends', () => {
  const { exits } = room([]);
  assert.equal(exitDistance(room([]), exits[0], [0, 0, 4]), 0);
  assert.equal(exitDistance(room([]), exits[0], [1, 0, 5]), 1);
  assert.equal(exitDistance(room([]), exits[0], [2, 0, 5]), 2);
  assert.equal(exitDistance(room([]), exits[0], [0, 0, 3]), 1); // beside its north end
  assert.equal(exitDistance(room([]), exits[0], [1, 0, 7]), 2);
  assert.equal(exitDistance(room([]), exits[1], [3, 0, 8]), 1); // +z side: counted from z 9
});

test('crates, plates, sockets and pads within 2 cells of a door are flagged, other things not', () => {
  const near = piecesNearExits(room([
    { id: 'crate', kind: 'pushable', at: [1, 0, 4] },
    { id: 'plate', kind: 'plate', at: [3, 0, 9] },
    { id: 'pad', kind: 'pad', at: [0, 0, 6] },
    { id: 'far_crate', kind: 'pushable', at: [2, 0, 4] },
    { id: 'socket', kind: 'socket', at: [5, 0, 5] },
    { id: 'screen', kind: 'deco', at: [0, 0, 4] },
    { id: 'target', kind: 'target', at: [0, 1, 5] },
  ]));
  assert.deepEqual(near, [
    { piece: 'crate', exit: 'west', distance: 1 },
    { piece: 'plate', exit: 'south', distance: 0 },
    { piece: 'pad', exit: 'west', distance: 1 },
  ]);
});
