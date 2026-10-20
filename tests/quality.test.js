import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_QUALITY, AutoQuality, QUALITY_LEVELS, QUALITY_PRESETS, qualityFromSettings, qualityLevels, trimmedMean } from '../src/render/quality.js';

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
/** Time from a change until the next step down, with a little to spare. */
const STEP = AUTO_QUALITY.settle + AUTO_QUALITY.slowWindows * AUTO_QUALITY.window + 0.1;
/** Time from the start until the first step down (D277: the start settles longer). */
const START = AUTO_QUALITY.startSettle + AUTO_QUALITY.slowWindows * AUTO_QUALITY.window + 0.1;
/** Time from a change until a step back up (D277). */
const UP = AUTO_QUALITY.settle + AUTO_QUALITY.fastWindows * AUTO_QUALITY.window + 0.1;

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
  assert.deepEqual(run(auto, SLOW, START - 0.2), []);
  assert.deepEqual(run(auto, SLOW, 0.2), [QUALITY_LEVELS[1]]);
  assert.equal(auto.level, 1);
});

test('a single slow window (the browser throttling a moment) changes nothing', () => {
  const auto = new AutoQuality();
  run(auto, FAST, AUTO_QUALITY.startSettle);
  for (let i = 0; i < 5; i++) {
    run(auto, SLOW, AUTO_QUALITY.window);
    run(auto, FAST, AUTO_QUALITY.window);
  }
  assert.equal(auto.level, 0);
});

test('once frames have been fast for a while, quality steps back up (D277)', () => {
  const auto = new AutoQuality();
  run(auto, 0.025, START);
  assert.equal(auto.level, 1);
  assert.deepEqual(run(auto, FAST, UP - 0.2), [], 'not at once');
  assert.deepEqual(run(auto, FAST, 0.2), [QUALITY_LEVELS[0]]);
  assert.deepEqual(run(auto, FAST, 30), [], 'nothing above full quality');
});

test('a slow start that catches up changes nothing (D277)', () => {
  const auto = new AutoQuality();
  assert.deepEqual(run(auto, 1 / 15, AUTO_QUALITY.startSettle - 0.5), []);
  assert.deepEqual(run(auto, FAST, 30), []);
  assert.equal(auto.level, 0);
});

test('frames warming up from 15 to 60 fps end at full quality again (D277)', () => {
  const auto = new AutoQuality();
  // 25 s of frames getting steadily faster, as a browser or GPU wakes.
  for (let t = 0; t < 25; ) {
    const interval = 1 / (15 + (45 * t) / 25);
    auto.frame(interval);
    t += interval;
  }
  assert.ok(auto.level > 0, 'the slow stretch did step down');
  run(auto, FAST, 4 * QUALITY_LEVELS.length * UP);
  assert.equal(auto.level, 0);
});

test('a level it steps up to and finds slow is the best it tries again: no flicker (D277)', () => {
  const auto = new AutoQuality();
  // The GPU holds level 1, not level 0.
  const frames = (seconds) => {
    const changes = [];
    for (let t = 0; t < seconds; ) {
      const interval = auto.level === 0 ? SLOW : FAST;
      const change = auto.frame(interval);
      if (change) changes.push(change);
      t += interval;
    }
    return changes;
  };
  assert.deepEqual(frames(START), [QUALITY_LEVELS[1]]);
  assert.deepEqual(frames(UP), [QUALITY_LEVELS[0]], 'tries full quality again');
  assert.deepEqual(frames(STEP), [QUALITY_LEVELS[1]], 'too slow: back down');
  assert.equal(auto.top, 1);
  assert.deepEqual(frames(60), [], 'and stays');
});

test('at the lowest level it can still step back up (D277)', () => {
  const auto = new AutoQuality();
  // Each level makes frames 20% faster, but never fast enough.
  let interval = 0.08;
  for (let i = 0; i < 20 && !auto.done; i++) {
    const before = auto.level;
    run(auto, interval, i === 0 ? START : STEP);
    if (auto.level > before) interval *= 0.8;
  }
  assert.equal(auto.level, QUALITY_LEVELS.length - 1);
  assert.equal(auto.done, true);
  assert.deepEqual(run(auto, FAST, UP), [QUALITY_LEVELS.at(-2)]);
  assert.equal(auto.done, false, 'and down again if that level is slow');
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
  const changes = run(auto, SLOW, START + 3 * STEP);
  assert.deepEqual(changes, [QUALITY_LEVELS[1], QUALITY_LEVELS[2], QUALITY_LEVELS[0]]);
  assert.equal(auto.level, 0);
  assert.equal(auto.done, true);
  assert.deepEqual(run(auto, SLOW, 20), []);
});

test('one step that helps nothing and a next that does keeps the second (vsync steps)', () => {
  const auto = new AutoQuality();
  run(auto, SLOW, START);
  run(auto, SLOW, STEP);
  assert.equal(auto.level, 2);
  assert.deepEqual(run(auto, FAST, AUTO_QUALITY.window * 2), []);
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
  assert.deepEqual(run(auto, SLOW, START), [{ multisampling: 0, renderScale: 0.75 }]);
});

test('the Render scale setting caps the auto levels', () => {
  assert.deepEqual(qualityLevels(1, 0.8), [
    { multisampling: 4, renderScale: 0.8 },
    { multisampling: 2, renderScale: 0.8 },
    { multisampling: 0, renderScale: 0.8 },
    { multisampling: 0, renderScale: 0.75 },
    { multisampling: 0, renderScale: 0.5 },
  ]);
  assert.deepEqual(qualityLevels(1, 0.5).at(-1), { multisampling: 0, renderScale: 0.5 });
  assert.equal(new Set(qualityLevels(1, 0.5).map((level) => `${level.multisampling} ${level.renderScale}`)).size, qualityLevels(1, 0.5).length);
});

test('the Options presets: Auto gives levels, Low, Medium and High a fixed quality (D277)', () => {
  assert.deepEqual(qualityFromSettings({ quality: 'auto', renderScale: 10 }, 1), { levels: QUALITY_LEVELS });
  assert.deepEqual(qualityFromSettings({ quality: 'high', renderScale: 10 }, 1), { fixed: QUALITY_PRESETS.high });
  assert.deepEqual(qualityFromSettings({ quality: 'medium', renderScale: 10 }, 1), { fixed: { multisampling: 2, renderScale: 1 } });
  assert.deepEqual(qualityFromSettings({ quality: 'low', renderScale: 10 }, 1), { fixed: { multisampling: 0, renderScale: 0.75 } });
  // Render scale lowers a preset, never raises it.
  assert.deepEqual(qualityFromSettings({ quality: 'high', renderScale: 6 }, 1), { fixed: { multisampling: 4, renderScale: 0.6 } });
  assert.deepEqual(qualityFromSettings({ quality: 'low', renderScale: 9 }, 1), { fixed: { multisampling: 0, renderScale: 0.75 } });
});
