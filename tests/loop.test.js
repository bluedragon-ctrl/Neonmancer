import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedLoop, DT, MAX_STEPS_PER_FRAME } from '../src/core/loop.js';

/** Loop that records how many updates ran and the last alpha. */
function makeLoop() {
  const log = { updates: 0, alphas: [] };
  const loop = new FixedLoop({
    update: (dt) => {
      assert.equal(dt, DT);
      log.updates++;
    },
    render: (alpha) => log.alphas.push(alpha),
  });
  return { loop, log };
}

/** Simulate one second of frames at the given refresh rate. */
function runOneSecond(hz) {
  const { loop, log } = makeLoop();
  for (let i = 0; i < hz; i++) loop.advance(1 / hz);
  return log;
}

test('runs 60 updates per second at any refresh rate', () => {
  for (const hz of [30, 60, 75, 120, 144, 240]) {
    const { updates } = runOneSecond(hz);
    // Allow one step of float rounding at the very end of the second.
    assert.ok(Math.abs(updates - 60) <= 1, `${hz} Hz ran ${updates} updates`);
  }
});

test('renders once per frame with alpha in [0, 1)', () => {
  const log = runOneSecond(144);
  assert.equal(log.alphas.length, 144);
  for (const a of log.alphas) assert.ok(a >= 0 && a < 1, `alpha ${a}`);
});

test('a short frame runs no update but still renders', () => {
  const { loop, log } = makeLoop();
  assert.equal(loop.advance(DT / 2), 0);
  assert.equal(log.updates, 0);
  assert.equal(log.alphas.length, 1);
  assert.ok(Math.abs(log.alphas[0] - 0.5) < 1e-9);
});

test('a long stall is capped and its backlog dropped', () => {
  const { loop, log } = makeLoop();
  assert.equal(loop.advance(3), MAX_STEPS_PER_FRAME); // e.g. tab was hidden
  assert.ok(loop.accumulator < DT);
  loop.advance(DT);
  assert.equal(log.updates, MAX_STEPS_PER_FRAME + 1);
});

test('negative elapsed time is ignored', () => {
  const { loop, log } = makeLoop();
  loop.advance(-1);
  assert.equal(log.updates, 0);
  assert.equal(loop.accumulator, 0);
});

test('tick counts logic steps', () => {
  const { loop } = makeLoop();
  loop.advance(DT * 3);
  assert.equal(loop.tick, 3);
});
