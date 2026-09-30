import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_BODY, DEREZ, derezCount } from '../src/render/derez-fx.js';
import { HIT_FX } from '../src/render/hit-fx.js';
import { STREAM, streamCount, streamPixels } from '../src/render/stream-fx.js';

const TICKS = 22;
const crate = { at: [2.5, 0, 3.5], body: BLOCK_BODY };
const hands = { at: [1.8, 0.48, 3.5] };

/** Is `pos` inside the body of `end`? */
const inside = (pos, { at, body }) => {
  const [w, h, d] = body.size;
  const y = at[1] + (body.y ?? 0);
  return Math.abs(pos[0] - at[0]) <= w / 2 && Math.abs(pos[2] - at[2]) <= d / 2 && pos[1] >= y && pos[1] <= y + h;
};

test('one stream (D127): out of a body into a point, each pixel waiting, flying, then gone', () => {
  assert.equal(streamCount(crate, hands), derezCount(BLOCK_BODY));
  assert.deepEqual(streamPixels(-1, TICKS, crate, hands), []);
  assert.deepEqual(streamPixels(TICKS, TICKS, crate, hands), []);
  const start = streamPixels(0, TICKS, crate, hands);
  assert.equal(start.length, streamCount(crate, hands));
  assert.ok(start.every(({ offset, scale }) => scale === 1 && inside(offset, crate)), 'the object as pixels');
  const mid = streamPixels(TICKS / 2, TICKS, crate, hands);
  assert.ok(mid.some(({ offset, scale }) => scale > 0 && !inside(offset, crate)), 'some on the way');
  const end = streamPixels(TICKS - 0.01, TICKS, crate, hands);
  assert.ok(end.every(({ scale }) => scale < 0.4), 'arrived and gone, or small at his hands');
  assert.deepEqual(streamPixels(7.5, TICKS, crate, hands), streamPixels(7.5, TICKS, crate, hands), 'the same every time');
});

test('into a body the other way round: nothing at the point, then the pixels fill the body', () => {
  const start = streamPixels(0, TICKS, hands, crate);
  assert.ok(start.every(({ scale }) => scale === 0 || scale === STREAM.pointScale));
  const end = streamPixels(TICKS - 0.01, TICKS, hands, crate);
  assert.ok(end.every(({ offset, scale }) => scale === 1 && inside(offset, crate)), 'all arrived, waiting in the body');
});

test('body to body (Warp): each pixel keeps its spot in the body; the last leaves after the stagger', () => {
  const from = { at: [0, 0, 0], body: HIT_FX.body };
  const to = { at: [5, 0, 0], body: HIT_FX.body };
  const start = streamPixels(0, TICKS, from, to);
  const end = streamPixels(TICKS - 0.01, TICKS, from, to);
  start.forEach(({ offset }, i) => {
    assert.ok(Math.abs(end[i].offset[0] - offset[0] - 5) < 1e-9 && Math.abs(end[i].offset[1] - offset[1]) < 1e-9);
  });
  const late = streamPixels(STREAM.stagger * TICKS + 0.01, TICKS, from, to);
  assert.ok(late.every(({ offset }, i) => offset[0] > start[i].offset[0]), 'all have left');
});

test('between two points it carries the fewest pixels a derez has', () => {
  assert.equal(streamCount(hands, { at: [0, 0, 0] }), DEREZ.minPixels);
});
