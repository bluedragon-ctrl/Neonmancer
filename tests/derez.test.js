import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../src/entities/player.js';
import { PUSHABLE } from '../src/entities/pushable.js';
import { BLOCK_BODY, DEREZ, derezCount, derezPixels } from '../src/render/derez-fx.js';
import { DISK } from '../src/render/disk.js';
import { ENEMY_MODELS } from '../src/render/entity-view.js';
import { HIT_FX } from '../src/render/hit-fx.js';

/** Every body that derezzes in the game, by name. */
const BODIES = {
  wizard: HIT_FX.body,
  block: BLOCK_BODY,
  pickup: DISK.collect.body,
  ...Object.fromEntries(Object.entries(ENEMY_MODELS).map(([look, model]) => [look, model.derez])),
};

const mean = (list, f) => list.reduce((sum, p) => sum + f(p), 0) / list.length;

test('one derez for everything (D126): its pixels start inside the body, drift out and up, and shrink away', () => {
  for (const [name, body] of Object.entries(BODIES)) {
    const [w, h, d] = body.size;
    const y = body.y ?? 0;
    const start = derezPixels(0, body);
    assert.equal(start.length, derezCount(body), name);
    for (const { offset } of start) {
      assert.ok(Math.abs(offset[0]) <= w / 2 && Math.abs(offset[2]) <= d / 2, `${name}: inside, sideways`);
      assert.ok(offset[1] >= y && offset[1] <= y + h, `${name}: inside, up`);
    }
    const early = derezPixels(DEREZ.stagger, body);
    const late = derezPixels(DEREZ.ticks - 4, body);
    assert.ok(mean(late, (p) => p.offset[1]) > mean(early, (p) => p.offset[1]), `${name}: up`);
    const out = (p) => Math.hypot(p.offset[0], p.offset[2]);
    assert.ok(mean(late, out) > mean(early, out), `${name}: out`);
    assert.ok(late.every((p) => p.scale < 0.3), `${name}: nearly gone`);
    assert.deepEqual(derezPixels(-1, body), []);
    assert.deepEqual(derezPixels(DEREZ.ticks, body), []);
    assert.deepEqual(derezPixels(20.5, body), derezPixels(20.5, body), `${name}: the same every time`);
  }
});

test('the pixels start a few ticks apart; a bigger body has more of them, within the bounds', () => {
  const first = derezPixels(DEREZ.stagger / 2, BLOCK_BODY);
  assert.ok(first.some((p) => p.scale > 0) && first.some((p) => p.scale === 0));
  assert.ok(derezPixels(DEREZ.stagger, BLOCK_BODY).every((p) => p.scale > 0), 'all started after the stagger');
  const counts = Object.values(BODIES).map(derezCount);
  assert.ok(counts.every((n) => n >= DEREZ.minPixels && n <= DEREZ.maxPixels));
  assert.ok(derezCount(BLOCK_BODY) > derezCount(HIT_FX.body));
  assert.ok(derezCount(HIT_FX.body) > derezCount(DISK.collect.body));
});

test('it is over before what shows it goes: the wizard respawns, a compiled crate leaves the room', () => {
  assert.ok(DEREZ.ticks < PLAYER.deathTicks);
  assert.ok(DEREZ.ticks <= PUSHABLE.expiredTicks);
});
