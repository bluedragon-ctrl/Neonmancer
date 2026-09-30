import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIT_FX, hitFlash, wizardLook } from '../src/render/hit-fx.js';
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

test('hitFlash: white-hot right after a hit, then fading magenta, then nothing; the wizard shows throughout', () => {
  const after = (tick) => ({ ...alive, invulnerable: PLAYER.invulnerableTicks - tick });
  assert.deepEqual(hitFlash(after(0)), { amount: 1, color: 'white' });
  assert.equal(hitFlash(after(HIT_FX.flashHotTicks - 1)).color, 'white');
  const fading = [HIT_FX.flashHotTicks, HIT_FX.flashTicks - 1].map((tick) => hitFlash(after(tick)));
  assert.ok(fading.every((flash) => flash.color === 'magenta'));
  assert.ok(fading[0].amount > fading[1].amount && fading[1].amount > 0);
  assert.equal(hitFlash(after(HIT_FX.flashTicks)).amount, 0);
  assert.equal(hitFlash(alive).amount, 0);
  assert.equal(hitFlash(derez(0)).amount, 0);

  for (let tick = 0; tick < HIT_FX.flashTicks; tick++) assert.equal(wizardLook(after(tick), PLAYER.deathTicks).visible, true);
});
