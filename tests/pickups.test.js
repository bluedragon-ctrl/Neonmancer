import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data/load.js';
import { validateData } from '../src/data/validate.js';
import { RoomEdit } from '../src/editor/room-edit.js';
import { Game } from '../src/game.js';
import { PLAYER } from '../src/entities/player.js';
import { createChip } from '../src/render/chip.js';
import { DISK, createDisk, diskMotion } from '../src/render/disk.js';
import { PICKUP_BITS, Progress, SAVE_BLOCKS, pickupBit, saveBit } from '../src/world/progress.js';
import { PICKUPS, SPELLS, dataFiles, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** Fake input pressing cast this tick. */
const cast = { down: (a) => a === 'cast', pressed: (a) => a === 'cast' };

/** A game in one 8×4×8 room with these pickups; the wizard stands at [1.5, 0, 1.5]. */
function gameWith(pickups, options) {
  return new Game(gameData({ rooms: [roomFile('alpha', { pickups })] }), options);
}

/** Put the wizard on a cell's middle and run one tick. */
function stepOnto(game, [x, y, z]) {
  game.player.place([x + 0.5, y, z + 0.5]);
  return eventTypes(game.update(idle));
}

test('save bits come in blocks: spells, buffs, upgrades, fragments, secrets; 128 in all (D71, D88, D100)', () => {
  assert.deepEqual(Object.keys(SAVE_BLOCKS), ['spells', 'buffs', 'upgrades', 'fragments', 'secrets']);
  assert.equal(PICKUP_BITS, 128);
  assert.equal(saveBit('spells', 0), 0);
  assert.equal(saveBit('buffs', 0), 16);
  assert.equal(saveBit('upgrades', 15), 47);
  assert.equal(saveBit('fragments', 63), 111);
  assert.throws(() => saveBit('spells', 16), RangeError);
  assert.equal(pickupBit(PICKUPS.disk_zap, SPELLS), 0);
  assert.equal(pickupBit(PICKUPS.refill_energy, SPELLS), null, 'refills have no bit');
  assert.equal(pickupBit(PICKUPS.buff_recharge, SPELLS), 25, 'a buff: its slot in the buff block');
  assert.equal(pickupBit(PICKUPS.secret_1, SPELLS), 113, 'a secret: its slot in the secrets block, after the fragments');
});

test('Progress remembers bits found; known spells follow from the disks, in slot order', () => {
  const spells = { zap: { slot: 0 }, warp: { slot: 3 }, pause: { slot: 1 } };
  const progress = new Progress([3]);
  assert.deepEqual(progress.knownSpells(spells), ['warp']);
  assert.equal(progress.collect(0), true);
  assert.equal(progress.collect(0), false, 'found already');
  assert.deepEqual(progress.knownSpells(spells), ['zap', 'warp']);
});

test('the wizard starts without a spell; casting does nothing', () => {
  const game = gameWith([]);
  assert.deepEqual(game.player.spells, []);
  assert.equal(game.player.spell, null);
  const events = eventTypes(game.update(cast));
  assert.ok(!events.includes('cast') && !events.includes('deny'));
  assert.equal(game.player.energy, game.player.maxEnergy);
});

test('taking the Zap disk installs Zap for good: it survives death and room resets', () => {
  const game = gameWith([{ id: 'disk', type: 'disk_zap', at: [4, 0, 4] }]);
  assert.equal(game.pickups[0].state, 'idle');
  const events = game.update(idle) && stepOnto(game, [4, 0, 4]);
  assert.ok(events.includes('pickup'));
  assert.equal(game.pickups[0].state, 'taken');
  assert.ok(game.progress.has(0));
  assert.deepEqual(game.player.spells, ['zap']);
  assert.equal(game.player.spell, 'zap');
  // He can cast it at once, during the install animation (D74).
  assert.ok(eventTypes(game.update(cast)).includes('cast'));

  // Death resets the room and the wizard; the disk is a ghost and he still knows Zap.
  game.hurt(99);
  for (let i = 0; i < 200 && game.player.dead; i++) game.update(idle);
  assert.equal(game.player.dead, false);
  assert.equal(game.pickups[0].state, 'ghost');
  assert.deepEqual(game.player.spells, ['zap']);
  assert.ok(!stepOnto(game, [4, 0, 4]).includes('pickup'), 'a ghost cannot be taken');
});

test('a disk found in one room is a ghost in another room too (a bit is the item, not the place)', () => {
  const files = dataFiles({
    rooms: [
      roomFile('alpha', { exits: [{ id: 'east', side: '+x', at: 3 }], pickups: [{ id: 'disk', type: 'disk_zap', at: [4, 0, 4] }] }),
      roomFile('beta', { exits: [{ id: 'west', side: '-x', at: 3 }], pickups: [{ id: 'spare', type: 'disk_zap', at: [2, 0, 2] }] }),
    ],
    connections: [['alpha.east', 'beta.west']],
  });
  const game = new Game(loadGameData(files));
  stepOnto(game, [4, 0, 4]);
  game.enterRoom('beta');
  assert.equal(game.pickups[0].state, 'ghost');
});

test('a refill is left lying while the stat is full, then restores up to the maximum', () => {
  const game = gameWith([
    { id: 'energy', type: 'refill_energy', at: [4, 0, 4] },
    { id: 'health', type: 'refill_integrity', at: [6, 0, 6] },
  ]);
  const { player } = game;
  assert.ok(!stepOnto(game, [4, 0, 4]).includes('pickup'), 'energy full');
  assert.equal(game.pickups[0].state, 'idle');

  player.energy = player.maxEnergy - 1;
  assert.ok(stepOnto(game, [4, 0, 4]).includes('pickup'));
  assert.equal(player.energy, player.maxEnergy, 'no more than the maximum');

  player.integrity = 3;
  stepOnto(game, [6, 0, 6]);
  assert.equal(player.integrity, 3 + PICKUPS.refill_integrity.amount);
  assert.equal(game.pickups[1].state, 'taken');

  // Refills come back with the room.
  game.enterRoom('alpha');
  assert.deepEqual(game.pickups.map((pickup) => pickup.state), ['idle', 'idle']);
});

test('Progress adds up the buffs found (D93)', () => {
  const progress = new Progress([saveBit('buffs', 0), saveBit('buffs', 1), saveBit('buffs', 9)]);
  assert.deepEqual(progress.buffs(PICKUPS), { integrity: 2, energy: 0, recharge: 4 });
  assert.deepEqual(new Progress().buffs(PICKUPS), { integrity: 0, energy: 0, recharge: 0 });
});

test('buffs raise his maxima and fill the stat; they last through death and room resets (D93)', () => {
  const game = gameWith([
    { id: 'health', type: 'buff_integrity_1', at: [4, 0, 4] },
    { id: 'mana', type: 'buff_energy_1', at: [6, 0, 6] },
    { id: 'speed', type: 'buff_recharge', at: [2, 0, 6] },
  ]);
  const { player } = game;
  player.integrity = 3;
  assert.ok(stepOnto(game, [4, 0, 4]).includes('pickup'));
  assert.equal(player.maxIntegrity, PLAYER.maxIntegrity + 1);
  assert.equal(player.integrity, player.maxIntegrity, 'filled up');
  assert.deepEqual(player.install, { item: 'buff_integrity_1', at: [4.5, 0.5, 4.5], tick: 0 }, 'the install animation plays');
  assert.ok(game.progress.has(saveBit('buffs', 0)));

  player.energy = 5;
  stepOnto(game, [6, 0, 6]);
  assert.equal(player.maxEnergy, PLAYER.maxEnergy + 10);
  assert.equal(player.energy, player.maxEnergy, 'filled up');

  stepOnto(game, [2, 0, 6]);
  assert.equal(player.energyTicks, PLAYER.energyTicks - 4);

  // Death resets the room: the chips are ghosts, the wizard keeps his buffs.
  game.hurt(99);
  for (let i = 0; i < 200 && player.dead; i++) game.update(idle);
  assert.deepEqual(game.pickups.map((pickup) => pickup.state), ['ghost', 'ghost', 'ghost']);
  assert.equal(player.integrity, PLAYER.maxIntegrity + 1);
  assert.equal(player.energy, PLAYER.maxEnergy + 10);
  assert.equal(player.energyTicks, PLAYER.energyTicks - 4);
});

test('a loaded save starts him with its buffs (D93)', () => {
  const game = gameWith([], { progress: new Progress([saveBit('buffs', 0), saveBit('buffs', 1), saveBit('buffs', 4)]) });
  assert.equal(game.player.maxIntegrity, PLAYER.maxIntegrity + 2);
  assert.equal(game.player.integrity, game.player.maxIntegrity);
  assert.equal(game.player.maxEnergy, PLAYER.maxEnergy + 10);
  assert.equal(game.player.energy, game.player.maxEnergy);
});

test('a dead wizard takes nothing', () => {
  // The disk hovers where he stands (spawn [1.5, 0, 1.5]).
  const game = gameWith([{ id: 'disk', type: 'disk_zap', at: [1, 0, 1] }]);
  game.hurt(99);
  assert.ok(!eventTypes(game.update(idle)).includes('pickup'));
  assert.equal(game.progress.has(0), false);
});

test('pickups: known types, a free cell of their own inside the room, ids shared with objects and enemies', () => {
  const errorsWith = (pickups, extra = {}) =>
    validateData(dataFiles({ rooms: [roomFile('alpha', { blocks: [{ at: [3, 0, 3] }], objects: [{ id: 'box', type: 'crate', at: [5, 0, 5] }], pickups, ...extra })] }));
  assert.deepEqual(errorsWith([{ id: 'disk', type: 'disk_zap', at: [4, 0, 4] }]), []);
  assert.match(errorsWith([{ id: 'x', type: 'nothing', at: [4, 0, 4] }]).join(), /pickups\[0\]\.type: unknown pickup type "nothing"/);
  assert.match(errorsWith([{ id: 'x', type: 'disk_zap', at: [3, 0, 3] }]).join(), /pickups\[0\]: cell \[3,0,3\] is filled by blocks\[0\]/);
  assert.match(errorsWith([{ id: 'x', type: 'disk_zap', at: [9, 0, 3] }]).join(), /outside size/);
  assert.match(errorsWith([{ id: 'box', type: 'disk_zap', at: [4, 0, 4] }]).join(), /duplicate id "box"/);
  const two = [
    { id: 'a', type: 'refill_energy', at: [4, 0, 4] },
    { id: 'b', type: 'refill_energy', at: [4, 0, 4] },
  ];
  assert.match(errorsWith(two).join(), /pickups\[1\]: cell \[4,0,4\] is taken by pickups\[0\]/);
});

test('defs: spell slots are unique, a disk names a known spell, pickup and object type ids differ', () => {
  const files = dataFiles({ rooms: [roomFile('alpha')] });
  files['defs.json'].spells.warp = { ...SPELLS.zap, slot: 0 };
  files['defs.json'].pickups.disk_warp = { kind: 'disk', spell: 'nope' };
  files['defs.json'].pickups.crate = { kind: 'refill', stat: 'energy', amount: 1 };
  const errors = validateData(files).join('\n');
  assert.match(errors, /spells\.warp\.slot: slot 0 is taken by "zap"/);
  assert.match(errors, /pickups\.disk_warp\.spell: unknown spell "nope"/);
  assert.match(errors, /pickups\.crate: "crate" is an object type too/);
});

test('defs: buff slots are unique; all buffs keep integrity within the save key and recharging above 0 ticks (D93)', () => {
  const files = dataFiles({ rooms: [roomFile('alpha')] });
  files['defs.json'].pickups.buff_integrity_2 = { kind: 'buff', slot: 0, stat: 'integrity', amount: 7 };
  files['defs.json'].pickups.buff_recharge = { kind: 'buff', slot: 9, stat: 'recharge', amount: PLAYER.energyTicks };
  const errors = validateData(files).join('\n');
  assert.match(errors, /pickups\.buff_integrity_2\.slot: buff slot 0 is taken by "buff_integrity_1"/);
  assert.match(errors, /integrity buffs raise the maximum to 16; the save key holds at most 15/);
  assert.match(errors, /recharge buffs take away 12 of 12 ticks/);
});

test('chip model: in its stat\'s color, gray once found; the bits on the back only', () => {
  const chip = createChip({ stat: 'energy', slot: 4 });
  assert.equal(chip.userData.color, '#b6ff3c');
  assert.notEqual(createChip({ stat: 'energy', ghost: true }).userData.color, '#b6ff3c');
  const zeros = chip.userData.spin.children.find((node) => node.isLineSegments2 && node.geometry.attributes.instanceStart.count === 15 * 4);
  assert.ok(zeros, 'one face of 15 zero bits');
});

test('disk look: a ghost spins without the bob; a pick-up rises and flashes, then its pixels fly and fade', () => {
  const ghost = diskMotion({ time: 3, ghost: true });
  const later = diskMotion({ time: 3.7, ghost: true });
  assert.equal(ghost.y, later.y, 'no bob');
  assert.notEqual(ghost.angle, later.angle, 'it spins');
  assert.equal(diskMotion({ time: 1, collected: 0 }).flash, 0);
  const rising = diskMotion({ time: 1, collected: DISK.collect.riseTicks / 2 });
  assert.ok(rising.visible && rising.y > diskMotion({ time: 1 }).y);
  const gone = diskMotion({ time: 1, collected: DISK.collect.riseTicks });
  assert.equal(gone.visible, false);
});

test('room editor: pickups are placed, picked by id and erased like objects', () => {
  const edit = new RoomEdit(roomFile('lab', { objects: [{ id: 'disk_zap_1', type: 'crate', at: [1, 0, 1] }] }));
  assert.equal(edit.placePickup([4, 0, 4], 'disk_zap'), true);
  assert.deepEqual(edit.data.pickups, [{ id: 'disk_zap_2', type: 'disk_zap', at: [4, 0, 4] }], 'the id is free among objects too');
  assert.equal(edit.at([4, 0, 4]).kind, 'pickup');
  assert.equal(edit.placePickup([4, 0, 4], 'disk_zap'), false, 'same type there already');
  assert.equal(edit.item('disk_zap_2').type, 'disk_zap');
  assert.equal(edit.erase([4, 0, 4]), true);
  assert.deepEqual(edit.data.pickups, []);
  edit.placePickup([7, 0, 7], 'refill_energy');
  edit.resize([6, 4, 6]);
  assert.deepEqual(edit.data.pickups, [], 'dropped outside the new size');
});

test('disk model: few draw calls; a ghost is solid-lined (D94)', () => {
  const draws = (model) => {
    let count = 0;
    model.traverse((node) => (count += node.isMesh ? 1 : 0)); // LineSegments2 is a Mesh too
    return count;
  };
  // Today: body, outline, all zero bits in one line, and a lit cube (faces + lines) on
  // each side. A budget, not an exact count, so the look can change without this test.
  const budget = 7;
  assert.ok(draws(createDisk({ slot: 5 })) <= budget, 'a disk stays within its draw calls');
  const ghost = createDisk({ slot: 5, ghost: true });
  assert.ok(draws(ghost) <= budget, 'so does a ghost');
  const zeros = ghost.userData.spin.children.find((node) => node.isLineSegments2 && node.geometry.attributes.instanceStart.count === 30 * 4);
  assert.ok(zeros, 'one line with the 4 sides of 15 zero bits on both faces');
  const dashed = [];
  for (const model of [ghost, createChip({ stat: 'energy', ghost: true })]) {
    model.traverse((node) => node.isLineSegments2 && node.material.dashed && dashed.push(node));
  }
  assert.deepEqual(dashed, [], 'found disks and chips are drawn with solid lines');
});
