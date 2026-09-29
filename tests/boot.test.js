import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOT, BOOT_TIME, arrivalLook, bootState, gatherPixels, outsideCover, revealTiles, tileLook } from '../src/render/boot-fx.js';
import { HIT_FX } from '../src/render/hit-fx.js';

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
  assert.equal(early.length, HIT_FX.pixels);
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
