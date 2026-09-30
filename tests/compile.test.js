import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../src/data/validate.js';
import { Game } from '../src/game.js';
import { cutTarget } from '../src/entities/clip.js';
import { PLAYER } from '../src/entities/player.js';
import { PUSHABLE } from '../src/entities/pushable.js';
import { COMPILE_FX, compileLook } from '../src/render/compile-fx.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { SPELLS, dataFiles, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** Fake input pressing one action this tick. */
const press = (action) => ({ down: (a) => a === action, pressed: (a) => a === action });

/** Ticks a compiled crate lasts. */
const LIFETIME = Math.round(SPELLS.compile.duration * 60);

/**
 * A game in a 12×4×8 room with `props`; the wizard knows Cut & Paste and
 * Compile (selected), stands at `pos` and aims along +x.
 */
function gameWith(props = {}, pos = [1.5, 0, 3.5]) {
  const rooms = [roomFile('alpha', { size: [12, 4, 8], spawn: [0.5, 0, 7.5], ...props })];
  const game = new Game(gameData({ rooms }), { progress: new Progress([6, 7].map((slot) => saveBit('spells', slot))) });
  game.player.spell = 'compile';
  stand(game, pos);
  return game;
}

/** Put the wizard at `pos`, aiming along +x. */
function stand(game, pos) {
  game.player.place(pos);
  game.player.facing = game.player.targetFacing = Math.PI / 2;
}

/** Cast the selected spell after the cooldown of the last one; returns this tick's events. */
function cast(game) {
  for (let i = 0; i < 20; i++) game.update(idle);
  return game.update(press('cast'));
}

/** Run `ticks` ticks without input; returns their events. */
function run(game, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(idle));
  return events;
}

test('Compile puts a crate into the free cell in front of him for 5 energy (D125)', () => {
  const game = gameWith();
  const events = cast(game);
  assert.deepEqual(eventTypes(events), ['compile', 'cast']);
  const [crate] = game.objects;
  assert.equal(events[0].object, crate);
  assert.deepEqual(events[0].cell, [2, 0, 3]);
  assert.deepEqual(crate.pos, [2, 0, 3]);
  assert.equal(crate.kind, 'pushable');
  assert.ok(crate.temporary);
  assert.equal(crate.ticksLeft, LIFETIME - 1, 'its first tick has passed');
  assert.equal(game.player.energy, PLAYER.maxEnergy - SPELLS.compile.cost);
  assert.deepEqual(game.player.compile, { cell: [2, 0, 3], tick: 0 });
  assert.ok(game.solids.includes(crate), 'he collides with it at once');
  run(game, PLAYER.compileTicks + 1);
  assert.equal(game.player.compile, null, 'the bits have flown');
});

test('a compiled crate is a crate: he pushes it, it falls off a ledge and plugs a hole', () => {
  const game = gameWith({ holes: [{ at: [3, 3] }] });
  cast(game);
  const [crate] = game.objects;
  crate.push([1, 0], game);
  const events = run(game, 40);
  assert.ok(eventTypes(events).includes('plug'));
  assert.equal(crate.state, 'plugged');
  assert.equal(game.grid.isHole(3.5, 3.5), false);
  // Up on a ledge it falls from where it appears.
  const ledge = gameWith({ blocks: [{ at: [1, 0, 3] }] }, [1.5, 1, 3.5]);
  cast(ledge);
  assert.deepEqual(ledge.objects[0].pos, [2, 1, 3]);
  run(ledge, 30);
  assert.deepEqual(ledge.objects[0].pos, [2, 0, 3]);
});

test('no free cell fizzles and costs nothing: a block, a crate, a pickup, the room side', () => {
  const cases = [
    [{ blocks: [{ at: [2, 0, 3] }] }],
    [{ objects: [{ id: 'box', type: 'crate', at: [2, 0, 3] }] }],
    [{ pickups: [{ id: 'p', type: 'refill_energy', at: [2, 0, 3] }] }],
    [{}, [11.5, 0, 3.5]],
  ];
  for (const [props, pos] of cases) {
    const game = gameWith(props, pos);
    const before = game.objects.length;
    assert.deepEqual(eventTypes(cast(game)), ['fizzle'], JSON.stringify(props));
    assert.equal(game.player.energy, PLAYER.maxEnergy);
    assert.equal(game.objects.length, before);
  }
});

test('it blinks, then derezzes after its duration; what stood on it falls', () => {
  const game = gameWith({ objects: [{ id: 'box', type: 'crate', at: [3, 0, 3] }] });
  cast(game);
  const compiled = game.objects[1];
  // A crate pushed onto it from a stack beside it would do; simply put one there.
  const [box] = game.objects;
  box.pos = [2, 1, 3];
  box.prev = [2, 1, 3];
  run(game, LIFETIME - 25);
  assert.equal(compiled.state, 'rest');
  assert.deepEqual(box.pos, [2, 1, 3], 'held up while it lasts');
  const events = run(game, 50);
  assert.ok(eventTypes(events).includes('expire'));
  assert.equal(compiled.state, 'broken');
  assert.ok(!game.solids.includes(compiled));
  assert.deepEqual(box.pos, [2, 0, 3], 'the crate on it fell');
  // Its pixels fly a while, then it leaves the room's objects.
  run(game, PUSHABLE.expiredTicks - 25);
  assert.ok(!game.objects.includes(compiled));
  assert.ok(!game.updateOrder.includes(compiled));
});

test('a hole it plugged opens again when it derezzes, under whoever stands there', () => {
  const game = gameWith({ holes: [{ at: [2, 3] }] });
  cast(game);
  run(game, 30);
  assert.equal(game.objects[0].state, 'plugged');
  assert.equal(game.grid.isHole(2.5, 3.5), false);
  game.player.place([2.5, 0, 3.5]);
  run(game, LIFETIME);
  assert.equal(game.grid.isHole(2.5, 3.5), true);
  assert.ok(game.player.dead);
  assert.equal(game.player.deathCause, 'hole');
});

test('any number stand at once; energy and the cooldown are the only limits', () => {
  const game = gameWith();
  cast(game);
  stand(game, [4.5, 0, 3.5]);
  cast(game);
  stand(game, [6.5, 0, 3.5]);
  cast(game);
  assert.deepEqual(
    game.objects.map((object) => object.pos),
    [
      [2, 0, 3],
      [5, 0, 3],
      [7, 0, 3],
    ],
  );
  assert.deepEqual(new Set(game.objects.map((object) => object.id)).size, 3, 'each its own id');
});

test('Cut & Paste leaves a compiled crate alone: it only lasts a while', () => {
  const game = gameWith();
  cast(game);
  assert.equal(cutTarget(game), null);
  game.player.spell = 'cut_paste';
  assert.deepEqual(eventTypes(cast(game)), ['fizzle']);
});

test('the room resets without the compiled crates', () => {
  const game = gameWith();
  cast(game);
  game.enterRoom('alpha');
  assert.equal(game.objects.length, 0);
});

test("data: Compile's object must be a pushable type", () => {
  const files = dataFiles({ rooms: [roomFile('a')] });
  files['defs.json'].spells.compile.object = 'nothing';
  const errors = validateData(files).join('\n');
  assert.match(errors, /spells\.compile\.object.*no pushable object type/);
});

test('the look: the crate grows in and blinks at the end (the bits: stream.test.js)', () => {
  const growing = compileLook(0, LIFETIME);
  assert.ok(growing.scale < 1);
  assert.deepEqual(compileLook(COMPILE_FX.growTicks, LIFETIME - COMPILE_FX.growTicks), { visible: true, scale: 1 });
  const blinks = (from, to) => {
    let changes = 0;
    for (let left = from; left > to; left--) if (compileLook(LIFETIME, left).visible !== compileLook(LIFETIME, left - 1).visible) changes++;
    return changes;
  };
  assert.equal(blinks(LIFETIME - COMPILE_FX.growTicks, COMPILE_FX.blinkTicks), 0, 'steady until the blinking');
  assert.ok(blinks(COMPILE_FX.fastTicks, 0) > blinks(COMPILE_FX.blinkTicks, COMPILE_FX.fastTicks) / 2, 'faster at the end');
});
