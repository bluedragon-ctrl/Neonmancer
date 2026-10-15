import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIT_FX, hitFlash, wizardLook } from '../src/render/hit-fx.js';
import { PLAYER } from '../src/entities/player.js';
import { PUSHABLE } from '../src/entities/pushable.js';
import { BLOCK_BODY, DEREZ, derezCount, derezPixels } from '../src/render/derez-fx.js';
import { DISK } from '../src/render/disk.js';
import { ENEMY_MODELS } from '../src/render/entity-view.js';
import { STREAM, streamCount, streamPixels } from '../src/render/stream-fx.js';
import { BOOT, BOOT_TIME, arrivalLook, bootState, gatherPixels, outsideCover, revealTiles, tileLook } from '../src/render/boot-fx.js';

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

test('boot sequence: the logo goes, the room compiles, then he pops in and lands', () => {
  const start = bootState(0);
  assert.deepEqual(start, { logo: 0, wipe: 0, pop: 0, land: 0, done: false });
  assert.equal(bootState(BOOT.logo).logo, 1);
  assert.ok(Math.abs(bootState(BOOT.wipeStart + BOOT.wipe / 2).wipe - 0.5) < 1e-9);
  assert.equal(bootState(BOOT.wipeStart + BOOT.wipe).wipe, 1);
  assert.ok(Math.abs(bootState(BOOT.popStart + BOOT.pop / 2).pop - 0.5) < 1e-9);
  assert.equal(bootState(BOOT_TIME - 1e-9).done, false);
  assert.deepEqual(bootState(BOOT_TIME), { logo: 1, wipe: 1, pop: 1, land: 1, done: true });
});

test('his pixels gather: none before or after, all of them in between, falling in and growing', () => {
  assert.deepEqual(gatherPixels(0), []);
  assert.deepEqual(gatherPixels(1), []);
  const early = gatherPixels(0.1);
  const late = gatherPixels(0.8);
  assert.equal(early.length, derezCount(HIT_FX.body));
  const height = (pixels) => pixels.reduce((sum, pixel) => sum + pixel.offset[1] * (pixel.scale > 0), 0) / pixels.filter((pixel) => pixel.scale > 0).length;
  assert.ok(height(early) > height(late)); // they come down
  assert.ok(late.some((pixel) => pixel.scale > 0.5));
});

test('he is hidden until his pixels meet, then flashes white and springs back from a squash', () => {
  assert.equal(arrivalLook({ pop: 0.99, land: 0 }).visible, false);
  const landing = arrivalLook({ pop: 1, land: 0 });
  assert.equal(landing.visible, true);
  assert.equal(landing.flash, 1);
  assert.ok(landing.scale[1] < 1 && landing.scale[0] > 1); // squashed
  assert.deepEqual(arrivalLook({ pop: 1, land: 1 }), { visible: true, flash: 0, scale: [1, 1, 1] });
});

test('reveal tiles cover the room and a little past it, and clear from the back corner forward', () => {
  const tiles = revealTiles([12, 4, 8]);
  assert.equal(tiles.length, 6 * 4);
  assert.equal(Math.min(...tiles.map((tile) => tile.x0)), -0.5);
  assert.equal(Math.max(...tiles.map((tile) => tile.z1)), 8.5);
  for (const tile of tiles) assert.ok(tile.turn >= 0 && tile.turn <= 1);
  const corner = tiles.find((tile) => tile.x0 < 0 && tile.z0 < 0);
  const front = tiles.find((tile) => tile.x1 > 12 && tile.z1 > 8);
  assert.ok(corner.turn < 0.2 && front.turn > 0.8);
  // Same order every time.
  assert.deepEqual(revealTiles([12, 4, 8]), tiles);
  // An odd size still ends at the room's edge.
  assert.equal(Math.max(...revealTiles([7, 4, 7]).map((tile) => tile.x1)), 7.5);
});

test('a tile stays covered until its turn, then its outline flashes and fades; the world round it last', () => {
  assert.deepEqual(tileLook(0.5, 0.2), { covered: true, flash: 0 });
  const at = 0.5 * BOOT.tilesDone;
  assert.deepEqual(tileLook(0.5, at), { covered: false, flash: 1 });
  assert.deepEqual(tileLook(0.5, at + BOOT.flash), { covered: false, flash: 0 });
  assert.equal(tileLook(1, BOOT.tilesDone).covered, false); // every tile clears in time
  assert.equal(outsideCover(BOOT.tilesDone), 1);
  assert.equal(outsideCover(1), 0);
});
