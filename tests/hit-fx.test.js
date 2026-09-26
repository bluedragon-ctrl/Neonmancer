import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIT_FX, derezPixels, wizardLook } from '../src/render/hit-fx.js';
import { PLAYER } from '../src/entities/player.js';

const alive = { invulnerable: 0, dead: false, deathCause: null, deathTimer: 0 };
const derez = (tick) => ({ ...alive, dead: true, deathCause: 'damage', deathTimer: PLAYER.deathTicks - tick });

test('wizardLook: fully drawn normally, blinking while invulnerable', () => {
  assert.deepEqual(wizardLook(alive, PLAYER.deathTicks), { visible: true, scale: [1, 1, 1] });
  const blinks = [];
  for (let t = 1; t <= HIT_FX.blinkPeriod * 2; t++) blinks.push(wizardLook({ ...alive, invulnerable: t }, PLAYER.deathTicks).visible);
  assert.ok(blinks.includes(true) && blinks.includes(false));
});

test('wizardLook: a derez thins him out of sight; a hole death leaves him drawn', () => {
  const look = (tick) => wizardLook(derez(tick), PLAYER.deathTicks);
  assert.equal(look(0).visible, true);
  assert.ok(look(HIT_FX.derezTicks / 2).scale[0] < 1);
  assert.equal(look(HIT_FX.derezTicks).visible, false);
  assert.equal(look(PLAYER.deathTicks - 1).visible, false);
  assert.deepEqual(wizardLook({ ...alive, dead: true, deathCause: 'hole', deathTimer: 30 }, PLAYER.deathTicks), {
    visible: true,
    scale: [1, 1, 1],
  });
});

test('derezPixels: one per pixel, rising and shrinking, gone before he respawns', () => {
  assert.ok(HIT_FX.pixelTicks < PLAYER.deathTicks);
  assert.deepEqual(derezPixels(-1), []);
  assert.deepEqual(derezPixels(HIT_FX.pixelTicks), []);
  const early = derezPixels(12);
  const late = derezPixels(30);
  assert.equal(early.length, HIT_FX.pixels);
  assert.equal(late.length, HIT_FX.pixels);
  const mean = (list, f) => list.reduce((sum, p) => sum + f(p), 0) / list.length;
  assert.ok(mean(late, (p) => p.offset[1]) > mean(early, (p) => p.offset[1]));
  assert.ok(mean(late, (p) => p.scale) < mean(early, (p) => p.scale));
  assert.deepEqual(derezPixels(20), derezPixels(20), 'the same every time');
});
