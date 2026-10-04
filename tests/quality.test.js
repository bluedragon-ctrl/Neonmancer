import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_QUALITY, AutoQuality, QUALITY_LEVELS, qualityLevels, trimmedMean } from '../src/render/quality.js';

/** Feed `seconds` of frames of `interval` each; returns every change made. */
function run(auto, interval, seconds) {
  const changes = [];
  for (let t = 0; t < seconds; t += interval) {
    const change = auto.frame(interval);
    if (change) changes.push(change);
  }
  return changes;
}

const FAST = 1 / 60;
const SLOW = 1 / 30;
/** Time from a change (or the start) until the next step, with a little to spare. */
const STEP = AUTO_QUALITY.settle + AUTO_QUALITY.slowWindows * AUTO_QUALITY.window + 0.1;

test('quality levels start at full quality, drop multisampling first, then render scale', () => {
  assert.deepEqual(QUALITY_LEVELS[0], { multisampling: 4, renderScale: 1 });
  const msaa = QUALITY_LEVELS.map((level) => level.multisampling);
  const scale = QUALITY_LEVELS.map((level) => level.renderScale);
  for (let i = 1; i < QUALITY_LEVELS.length; i++) {
    assert.ok(msaa[i] <= msaa[i - 1] && scale[i] <= scale[i - 1], 'never better than the level before');
    if (scale[i] < scale[i - 1]) assert.equal(msaa[i - 1], 0, 'scale drops only once multisampling is off');
  }
});

test('the trimmed mean leaves out the longest frames', () => {
  const times = [...Array(9).fill(0.016), 0.09];
  assert.ok(Math.abs(trimmedMean(times) - 0.016) < 1e-9);
});

test('fast frames keep full quality', () => {
  const auto = new AutoQuality();
  assert.deepEqual(run(auto, FAST, 30), []);
  assert.equal(auto.level, 0);
});

test('slow frames step quality down one level after two slow windows, after the settle time', () => {
  const auto = new AutoQuality();
  assert.deepEqual(run(auto, SLOW, STEP - 0.2), []);
  assert.deepEqual(run(auto, SLOW, 0.2), [QUALITY_LEVELS[1]]);
  assert.equal(auto.level, 1);
});

test('a single slow window (the browser throttling a moment) changes nothing', () => {
  const auto = new AutoQuality();
  run(auto, FAST, AUTO_QUALITY.settle);
  for (let i = 0; i < 5; i++) {
    run(auto, SLOW, AUTO_QUALITY.window);
    run(auto, FAST, AUTO_QUALITY.window);
  }
  assert.equal(auto.level, 0);
});

test('once frames are fast again, quality stays where it is', () => {
  const auto = new AutoQuality();
  run(auto, 0.025, STEP);
  assert.equal(auto.level, 1);
  assert.deepEqual(run(auto, FAST, 30), []);
  assert.equal(auto.level, 1);
  assert.equal(auto.done, false, 'still watching: a heavier room may need another step');
});

test('frames that stay slow but get faster step all the way down, then stop', () => {
  const auto = new AutoQuality();
  // Each level makes frames 20% faster, but never fast enough.
  let interval = 0.08;
  for (let i = 0; i < 20 && !auto.done; i++) {
    const before = auto.level;
    run(auto, interval, STEP);
    if (auto.level > before) interval *= 0.8;
  }
  assert.equal(auto.level, QUALITY_LEVELS.length - 1);
  assert.equal(auto.done, true);
});

test('two steps that help nothing (a 30 Hz display, a slow CPU) go back and stop', () => {
  const auto = new AutoQuality();
  const changes = run(auto, SLOW, 4 * STEP);
  assert.deepEqual(changes, [QUALITY_LEVELS[1], QUALITY_LEVELS[2], QUALITY_LEVELS[0]]);
  assert.equal(auto.level, 0);
  assert.equal(auto.done, true);
  assert.deepEqual(run(auto, SLOW, 20), []);
});

test('one step that helps nothing and a next that does keeps the second (vsync steps)', () => {
  const auto = new AutoQuality();
  run(auto, SLOW, STEP);
  run(auto, SLOW, STEP);
  assert.equal(auto.level, 2);
  assert.deepEqual(run(auto, FAST, 20), []);
  assert.equal(auto.level, 2);
});

test('hitches and hidden-tab gaps are left out', () => {
  const auto = new AutoQuality();
  for (let i = 0; i < 100; i++) assert.equal(auto.frame(0.5), null);
  run(auto, FAST, 1);
  for (let i = 0; i < 20; i++) auto.frame(0.2);
  assert.deepEqual(run(auto, FAST, 10), []);
  assert.equal(auto.level, 0);
});

test('on a 1x screen the quality levels are as listed (D169)', () => {
  assert.deepEqual(qualityLevels(1), QUALITY_LEVELS);
});

test('on a high-DPI screen there is no MSAA to drop: the render scale steps down first (D169)', () => {
  assert.deepEqual(qualityLevels(2), [
    { multisampling: 0, renderScale: 1 },
    { multisampling: 0, renderScale: 0.75 },
    { multisampling: 0, renderScale: 0.5 },
  ]);
});

test('slow frames on a high-DPI screen lower the render scale at the first step (D169)', () => {
  const auto = new AutoQuality(qualityLevels(2));
  assert.deepEqual(run(auto, SLOW, STEP), [{ multisampling: 0, renderScale: 0.75 }]);
});
