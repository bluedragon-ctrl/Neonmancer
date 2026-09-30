import { test } from 'node:test';
import assert from 'node:assert/strict';
import DEFS from '../data/defs.json' with { type: 'json' };
import { takeAnnouncements, takeMessages } from '../src/core/messages.js';
import { loadGameData } from '../src/data/load.js';
import { validateData } from '../src/data/validate.js';
import { exitFields } from '../src/editor/room-edit.js';
import { Game } from '../src/game.js';
import { coreFlash, levelMarks } from '../src/render/core-view.js';
import { FRAGMENT, moduleSquare } from '../src/render/fragment.js';
import { romanBars, romanNumeral } from '../src/render/switch-view.js';
import { BOOT_KEY, keyModule } from '../src/world/boot-key.js';
import { hatBands } from '../src/render/wizard.js';
import { exitOpen } from '../src/switches.js';
import { pickupReport } from '../src/world/pickup-report.js';
import { Progress, SAVE_BLOCKS, pickupBit, saveBit } from '../src/world/progress.js';
import { CORE, CRATE, PICKUPS, SPELLS, dataFiles, eventTypes, idle, roomFile } from './helpers.js';

/** Access levels at 2 and 3 fragments, the Grid reboots at 4 (a small world). */
const FRAGMENTS = { required: 4, access: [2, 3] };

/**
 * Two rooms: alpha (8×4×8) with the core at [4, 0, 4], `pickups`, and its
 * east exit asking for access level 1; beta behind it.
 */
function files({ pickups = [], exit = { id: 'east', side: '+x', at: 3, access: 1 }, fragments = FRAGMENTS, objects = [{ id: 'core', type: 'core', at: [4, 0, 4] }] } = {}) {
  return dataFiles({
    rooms: [
      roomFile('alpha', { exits: [exit], objects, pickups }),
      roomFile('beta', { spawn: [1, 0, 4], exits: [{ id: 'west', side: '-x', at: 3 }] }),
    ],
    objects: { crate: CRATE, core: CORE, target: { kind: 'target', color: '#eef3ff' } },
    connections: [['alpha.east', 'beta.west']],
    fragments,
  });
}

/** A game in `start` with these fragments found. */
function gameWith(options = {}, { found = [], accessLevel = 0, start = 'alpha' } = {}) {
  const bits = found.map((slot) => saveBit('fragments', slot));
  return new Game(loadGameData(files(options)), { start, progress: new Progress(bits, accessLevel) });
}

/** Walk the wizard up against the core's west side (it stands at x 4–5) and run a tick. */
function touchCore(game) {
  game.player.place([3.69, 0, 4.5]);
  return game.update(idle);
}

/** Step away from the core and run a tick. */
function stepAway(game) {
  game.player.place([1.5, 0, 1.5]);
  return game.update(idle);
}

test('a fragment is a permanent pickup in the fragments block, its bit from its slot (D101)', () => {
  assert.equal(pickupBit(PICKUPS.fragment_0, SPELLS), SAVE_BLOCKS.fragments.start);
  assert.equal(pickupBit(PICKUPS.fragment_3, SPELLS), 51);
  assert.equal(pickupBit({ kind: 'fragment', slot: 63 }, SPELLS), 111, 'the last fragment bit, before the secrets');
});

test('defs.json defines all 64 fragments, one per slot, so the room editor offers each (D101)', () => {
  const slots = Object.values(DEFS.pickups).filter((type) => type.kind === 'fragment').map((type) => type.slot);
  assert.deepEqual(slots.sort((a, b) => a - b), Array.from({ length: SAVE_BLOCKS.fragments.size }, (_, i) => i));
  assert.equal(DEFS.objects.core.kind, 'core');
});

test('the access level his fragments earn: one per threshold reached', () => {
  const thresholds = [16, 32, 48];
  const found = (n) => new Progress(Array.from({ length: n }, (_, i) => saveBit('fragments', i)));
  assert.equal(found(0).earnedAccess(thresholds), 0);
  assert.equal(found(15).earnedAccess(thresholds), 0);
  assert.equal(found(16).earnedAccess(thresholds), 1);
  assert.equal(found(47).earnedAccess(thresholds), 2);
  assert.equal(found(64).earnedAccess(thresholds), 3, 'the last level');
  assert.equal(new Progress([], 2).accessLevel, 2, 'a loaded save keeps its stored level');
});

test('taking a fragment: saved, announced as FRAGMENT n/N GET!, 50 points; a found one is a ghost', () => {
  takeMessages();
  takeAnnouncements();
  const game = gameWith({ pickups: [{ id: 'f', type: 'fragment_2', at: [2, 0, 5] }] });
  game.player.place([2.5, 0, 5.5]);
  assert.ok(eventTypes(game.update(idle)).includes('pickup'));
  assert.ok(game.progress.has(saveBit('fragments', 2)));
  assert.deepEqual(takeMessages().map(({ key, values }) => [key, values]), [['msg.fragmentFound', { found: 1, total: 4 }]]);
  assert.equal(takeAnnouncements().at(-1).key, 'banner.fragment');
  assert.equal(game.score, 50);
  assert.equal(game.player.install?.item, 'fragment_2', 'it installs like every permanent pickup');
  game.enterRoom('alpha');
  assert.equal(game.pickups[0].state, 'ghost');
});

test('the core raises his access level to what his fragments earn, once per touch; each level is 500 points', () => {
  takeMessages();
  const game = gameWith({}, { found: [0, 1] });
  assert.equal(game.core?.kind, 'core');
  assert.equal(game.progress.accessLevel, 0, 'fragments alone raise nothing: the core does');
  const events = touchCore(game);
  assert.deepEqual(events.filter((e) => e.type === 'access'), [{ type: 'access', level: 1 }]);
  assert.equal(game.progress.accessLevel, 1);
  assert.equal(game.score, 2 * 50 + 500);
  assert.deepEqual(takeMessages().map(({ key }) => key), ['msg.access', 'msg.unlocked'], 'the access lock in this room opens at once');
  assert.ok(!eventTypes(game.update(idle)).includes('access'), 'staying against it counts nothing more');
  stepAway(game);
  touchCore(game);
  assert.deepEqual(takeMessages().map(({ key, values }) => [key, values]), [['msg.coreAccess', { found: 2, needed: 3, level: 2 }]], 'it tells him how many more');
});

test('an access pass (for testing) raises his level at once and opens access locks; it has no save bit and comes back with the room', () => {
  takeMessages();
  takeAnnouncements();
  const game = gameWith({ pickups: [{ id: 'pass', type: 'access_pass_3', at: [2, 0, 5] }] });
  assert.equal(pickupBit(PICKUPS.access_pass_3, SPELLS), null, 'temporary: no save bit');
  const exit = game.room.exits.find((e) => e.id === 'east');
  assert.equal(exitOpen(game, exit), false);
  game.player.place([2.5, 0, 5.5]);
  const events = game.update(idle);
  assert.ok(eventTypes(events).includes('pickup'));
  assert.deepEqual(events.filter((e) => e.type === 'access'), [{ type: 'access', level: 3 }]);
  assert.equal(game.progress.accessLevel, 3);
  assert.equal(game.player.install, null, 'no install animation: it is not a permanent pickup');
  assert.deepEqual(takeMessages().map(({ key, values }) => [key, values]), [['msg.accessPass', { level: 3 }], ['msg.unlocked', undefined]]);
  assert.equal(takeAnnouncements().at(-1).key, 'banner.access');
  assert.equal(exitOpen(game, exit), true);

  // It comes back with the room, but lies there while his level is 3 already.
  game.enterRoom('alpha');
  assert.equal(game.pickups[0].state, 'idle');
  game.player.place([2.5, 0, 5.5]);
  assert.ok(!eventTypes(game.update(idle)).includes('pickup'));
  // The core never lowers it.
  touchCore(game);
  assert.equal(game.progress.accessLevel, 3);
});

test('the core blocks him like a 2-high block: he cannot walk through or jump onto it', () => {
  const game = gameWith();
  assert.deepEqual(game.core.box(), [[4, 5], [0, 2], [4, 5]]);
  assert.ok(game.solids.includes(game.core));
});

test('an access lock is solid until his level is high enough; the one he came in through stays open', () => {
  const low = gameWith();
  const [lock] = low.locks;
  assert.equal(exitOpen(low, lock.exit), false);
  assert.equal(gameWith({}, { accessLevel: 1 }).locks[0].open, true, 'a level he has: open from the start');
  const back = gameWith({ exit: { id: 'east', side: '+x', at: 3, access: 1 } });
  back.enterRoom('alpha', undefined, 'east');
  assert.equal(back.locks[0].open, true, 'he came in through it (D75)');
  // With a switch lock too, both must be met.
  const both = gameWith({ exit: { id: 'east', side: '+x', at: 3, access: 1, locked: true }, objects: [{ id: 't', type: 'target', at: [6, 0, 6] }] }, { accessLevel: 1 });
  assert.equal(both.locks[0].open, false, 'his level is enough, the switch is off');
  both.switches[0].on = true;
  both.update(idle);
  assert.equal(both.locks[0].open, true);
  const switchedOnly = gameWith({ exit: { id: 'east', side: '+x', at: 3, access: 1, locked: true }, objects: [{ id: 't', type: 'target', at: [6, 0, 6] }] });
  switchedOnly.switches[0].on = true;
  switchedOnly.update(idle);
  assert.equal(switchedOnly.locks[0].open, false, 'the switch is on, his level too low');
});

test('with every fragment the core needs, the Grid reboots: a win, once; he plays on', () => {
  takeMessages();
  const game = gameWith({}, { found: [0, 1, 2, 3], accessLevel: 2 });
  const events = touchCore(game);
  assert.deepEqual(eventTypes(events).filter((type) => type === 'access' || type === 'win'), ['win']);
  assert.equal(game.won, true);
  assert.deepEqual(takeMessages().map(({ key }) => key), ['msg.reboot']);
  stepAway(game);
  assert.ok(!eventTypes(touchCore(game)).includes('win'), 'the end comes once');
  // Bringing the last levels and the end at once: both.
  const late = gameWith({}, { found: [0, 1, 2, 3] });
  assert.deepEqual(eventTypes(touchCore(late)).filter((type) => type === 'access' || type === 'win'), ['access', 'win']);
  assert.equal(late.progress.accessLevel, 2);
});

test('debug mode grants the next fragments not found yet', () => {
  const game = gameWith({}, { found: [1] });
  game.debugGrantFragments(3);
  assert.equal(game.progress.count('fragments'), 4);
  assert.ok([0, 1, 2, 3].every((slot) => game.progress.has(saveBit('fragments', slot))));
});

test('a world without fragment rules: 64 to reboot, no access levels', () => {
  const game = gameWith({ exit: { id: 'east', side: '+x', at: 3 }, fragments: null });
  assert.deepEqual(game.fragmentRules, { required: 64, access: [] });
});

test('validation: fragment slots, rising access thresholds, reachable exit levels, one core, 2 free cells for it', () => {
  const errors = (options, change = () => {}) => {
    const data = files(options);
    change(data);
    return validateData(data);
  };
  assert.deepEqual(errors(), []);
  assert.ok(errors({}, (data) => (data['defs.json'].pickups.fragment_9 = { kind: 'fragment', slot: 1 })).some((e) => e.includes('fragment slot 1 is taken')));
  assert.ok(errors({ fragments: { required: 4, access: [3, 2] } }).some((e) => e.includes('must be more than')));
  assert.ok(errors({ fragments: { required: 4, access: [2, 5] } }).some((e) => e.includes('more than the 4 fragments')));
  assert.ok(errors({ exit: { id: 'east', side: '+x', at: 3, access: 3 } }).some((e) => e.includes("level 3 can't be reached")));
  const twoCores = (data) => (data['rooms/beta.json'].objects = [{ id: 'core', type: 'core', at: [4, 0, 4] }]);
  assert.ok(errors({}, twoCores).some((e) => e.includes('2 cores')));
  const onTop = [{ id: 'core', type: 'core', at: [4, 0, 4] }, { id: 'c', type: 'crate', at: [4, 1, 4] }];
  assert.ok(errors({ objects: onTop }).some((e) => e.includes('already filled')), 'the cell above the core is its own');
});

test('the pickup report lists fragments by their save bit', () => {
  const report = pickupReport(PICKUPS, SPELLS, [['alpha', { pickups: [{ id: 'f', type: 'fragment_1', at: [1, 0, 1] }] }]]);
  const item = report.items.find((i) => i.bit === saveBit('fragments', 1));
  assert.deepEqual([item.block, item.slot, item.places.length], ['fragments', 1, 1]);
});

test('the room editor keeps an exit\'s access level', () => {
  assert.deepEqual(exitFields({ id: 'e', side: '+x', at: 3, width: 2, y: 0, height: 2, access: 2 }), { id: 'e', side: '+x', at: 3, access: 2 });
  assert.deepEqual(exitFields({ id: 'e', side: '+x', at: 3, width: 2, y: 0, height: 2, access: 0 }), { id: 'e', side: '+x', at: 3 });
});

test('the boot key: 64 fragments are the modules of an 8×8 code with three finder squares', () => {
  assert.equal(BOOT_KEY.length * BOOT_KEY[0].length, SAVE_BLOCKS.fragments.size);
  assert.ok(BOOT_KEY.every((row) => /^[#.]{8}$/.test(row)));
  assert.deepEqual(keyModule(0), { col: 0, row: 0, dark: true });
  assert.deepEqual(keyModule(9), { col: 1, row: 1, dark: false }, 'the middle of the top left finder');
  assert.deepEqual(keyModule(63), { col: 7, row: 7, dark: true });
  const finder = (col, row) => [0, 1, 2].map((r) => BOOT_KEY[row + r].slice(col, col + 3));
  for (const [col, row] of [[0, 0], [5, 0], [0, 5]]) assert.deepEqual(finder(col, row), ['###', '#.#', '###']);
  // On the tile, module squares run left to right and top to bottom, inside it.
  const [a, b] = [moduleSquare(0, 0), moduleSquare(1, 1)];
  assert.ok(b[0] > a[0] && b[1] < a[1]);
  assert.ok(moduleSquare(7, 7)[2] < FRAGMENT.size / 2);
});

test('looks: the core\'s level marks and flash, Roman numerals, hat bands', () => {
  assert.deepEqual(levelMarks(2, 3), [1, 1, 0]);
  assert.equal(coreFlash(0), 1);
  assert.equal(coreFlash(Infinity), 0);
  assert.ok(coreFlash(0.5) > 0 && coreFlash(0.5) < 1);
  assert.deepEqual([1, 2, 3, 4, 9, 12, 15].map(romanNumeral), ['I', 'II', 'III', 'IV', 'IX', 'XII', 'XV']);
  assert.equal(romanBars(1, [0, 0]).length, 1 + 2, 'an I between a bar on top and one below');
  assert.equal(romanBars(3, [0, 0]).length, 3 + 2);
  assert.equal(romanBars(4, [0, 0]).length, 1 + 2 + 2, 'IV');
  assert.ok(romanBars(3, [0, 0]).every((quad) => quad.length === 4));
  const bands = hatBands(3);
  assert.equal(bands.length, 3);
  assert.ok(bands[0].y < bands[1].y && bands[1].r < bands[0].r, 'rising up the narrowing hat');
});
