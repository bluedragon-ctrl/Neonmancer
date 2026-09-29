import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../src/data/validate.js';
import { BOLT, boltDirections } from '../src/entities/bolt.js';
import { ENEMY } from '../src/entities/enemy.js';
import { Game } from '../src/game.js';
import { Vector3 } from 'three';
import { BUG as BUG_LOOK, popPixels } from '../src/render/bug.js';
import { CRAWLER, animateCrawler, crawlerFoot, crawlerPopPixels, createCrawler } from '../src/render/crawler.js';
import { CRON, animateCron, createCron, cronHand, cronPopPixels } from '../src/render/cron.js';
import { MOODS, eyeMood, popBurst } from '../src/render/enemy-look.js';
import { ENEMY_MODELS } from '../src/render/entity-view.js';
import { PHISH, animatePhish, createPhish } from '../src/render/phish.js';
import { WYRM, wyrmShades } from '../src/render/wyrm.js';
import { SENTINEL, sentinelPopPixels } from '../src/render/sentinel.js';
import { VIRUS as VIRUS_LOOK, virusPopPixels } from '../src/render/virus.js';
import { WORM, wormPopPixels, wormSpine } from '../src/render/worm.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { BUG, CRATE, SENTINEL as SENTINEL_TYPE, VIRUS, dataFiles, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** A stationary bug firing slow bolts (D80): 12 ticks of charge, 6 units per second. */
const SHOOTER = { extends: 'bug', movement: 'stationary', attack: 'bolt', aggroRange: 6, attackRange: 6, attackCharge: 0.2, attackCooldown: 2, boltSpeed: 6 };

/** A tower (D81): four level bolts along the grid axes, 12 ticks of charge, 6 units per second. */
const TOWER = { extends: 'sentinel', movement: 'stationary', attack: 'bolt', boltPattern: 'cross', aggroRange: 5, attackRange: 5, attackCharge: 0.2, boltSpeed: 6 };

/** A stationary bug whose bolt bounces once (D81), 8 units per second, a long cooldown. */
const BOUNCER = { ...SHOOTER, boltBounces: 1, boltSpeed: 8, attackCooldown: 5 };

/** A stationary bug with a burst (friendly fire). */
const ZAPPER = { extends: 'bug', movement: 'stationary', attack: 'burst', aggroRange: 3, attackRange: 1.2, attackCharge: 0.2 };

const TEMPLATES = { bug: BUG, virus: VIRUS, sentinel: SENTINEL_TYPE, shooter: SHOOTER, tower: TOWER, bouncer: BOUNCER, zapper: ZAPPER };

/** A destructible crate type. */
const BRITTLE = { ...CRATE, integrity: 1 };

/**
 * A game in one 8×4×8 room with the given enemies, objects and blocks; the
 * wizard is put at `pos` and knows Zap.
 */
function gameWith({ enemies, objects = [], blocks = [], pos }) {
  const game = new Game(
    gameData({
      rooms: [roomFile('alpha', { enemies, objects, blocks, spawn: [0.5, 0, 7.5] })],
      objects: { crate: CRATE, brittle: BRITTLE },
      enemies: TEMPLATES,
    }),
    { progress: new Progress([saveBit('spells', 0)]) },
  );
  game.player.place(pos);
  return game;
}

/** Run the game for `ticks` ticks; returns every event. */
function run(game, ticks, inp = idle) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(inp));
  return events;
}

/** Run until an event of `type` happens (at most `limit` ticks); returns the ticks it took. */
function until(game, type, limit = 600) {
  for (let i = 1; i <= limit; i++) if (game.update(idle).some((e) => e.type === type)) return i;
  assert.fail(`no "${type}" within ${limit} ticks`);
}

/** Fake input pressing cast this tick. */
const cast = { down: (a) => a === 'cast', pressed: (a) => a === 'cast' };

const virus = (at, id = 'v', overrides) => ({ id, template: 'virus', at, ...(overrides && { overrides }) });
const shooter = (at, id = 's') => ({ id, template: 'shooter', at });
const sitter = (at, id = 'b', overrides = {}) => ({ id, template: 'bug', at, overrides: { movement: 'stationary', ...overrides } });

// ---- moving (D80)

test('two chasers never start into the same cell: one waits, instead of both bumping back and forth', () => {
  const touch = { attack: 'touch' };
  const game = gameWith({ enemies: [virus([1, 0, 3], 'a', touch), virus([5, 0, 3], 'b', touch)], pos: [3.5, 0, 3.5] });
  game.invincible = true;
  const [a, b] = game.enemies;
  run(game, 90);
  assert.deepEqual(a.pos, [3, 0, 3], 'the first one got there');
  assert.deepEqual(b.pos, [4, 0, 3], 'the other one waits next to it');
});

test('turned back mid-step, an enemy waits in the cell it left before stepping again', () => {
  const game = gameWith({ enemies: [virus([1, 0, 1], 'v', { hostility: 'provoked' })], pos: [7.5, 0, 7.5] });
  const [enemy] = game.enemies;
  Object.assign(enemy, { state: 'walk', from: [1, 0, 1], target: [2, 0, 1], walked: 0 });
  run(game, 5);
  // A crate appears in its way.
  game.objects.push(...new Game(gameData({ rooms: [roomFile('b', { objects: [{ id: 'c', type: 'crate', at: [2, 0, 1] }] })] })).objects);
  game.refreshBodies();
  run(game, 3);
  assert.equal(enemy.state, 'walk', 'walking back');
  assert.equal(enemy.wait, ENEMY.turnTicks, 'to wait there');
  run(game, 10);
  assert.deepEqual(enemy.pos, [1, 0, 1], 'back where it came from');
  assert.ok(enemy.wait > 0 && enemy.wait < ENEMY.turnTicks, `waiting: ${enemy.wait}`);
});

test('an enemy whose ground goes mid-step drops as it walks on, and lands', () => {
  const game = gameWith({
    enemies: [{ id: 'b', template: 'bug', at: [1, 1, 1], path: { points: [[2, 1, 1]] } }],
    objects: [
      { id: 'c1', type: 'crate', at: [1, 0, 1] },
      { id: 'c2', type: 'crate', at: [2, 0, 1] },
    ],
    pos: [7.5, 0, 7.5],
  });
  const [enemy] = game.enemies;
  run(game, 8);
  assert.equal(enemy.state, 'walk');
  // Both crates gone (as broken ones would be).
  game.objects = [];
  game.updateOrder = [];
  game.refreshBodies();
  run(game, 4);
  assert.equal(enemy.state, 'walk', 'still walking');
  assert.ok(enemy.pos[1] < 1, `dropping: ${enemy.pos}`);
  run(game, 30);
  assert.equal(enemy.pos[1], 0, 'landed');
  assert.ok(enemy.alive);
});

test('going home, a chaser finds its way round a wall', () => {
  const game = gameWith({ enemies: [virus([1, 0, 1], 'v', { hostility: 'provoked' })], blocks: [{ at: [3, 0, 0], to: [3, 0, 5] }], pos: [7.5, 0, 7.5] });
  const [enemy] = game.enemies;
  enemy.pos = [5, 0, 1];
  enemy.behavior.mode = 'return';
  run(game, 500);
  assert.deepEqual(enemy.pos, [1, 0, 1]);
  assert.equal(enemy.behavior.mode, 'calm');
});

test('with no way home a chaser gives up and stays', () => {
  const game = gameWith({ enemies: [virus([1, 0, 1], 'v', { hostility: 'provoked' })], blocks: [{ at: [3, 0, 0], to: [3, 0, 7] }], pos: [7.5, 0, 7.5] });
  const [enemy] = game.enemies;
  enemy.pos = [5, 0, 1];
  enemy.behavior.mode = 'return';
  run(game, 60);
  assert.deepEqual(enemy.pos, [5, 0, 1]);
  assert.equal(enemy.behavior.mode, 'calm');
});

test('a patrol knocked off its path finds its way back round a wall', () => {
  const game = gameWith({
    enemies: [{ id: 'b', template: 'bug', at: [1, 0, 1], path: { points: [[1, 0, 3]] } }],
    blocks: [{ at: [0, 0, 5], to: [4, 0, 5] }],
    pos: [7.5, 0, 7.5],
  });
  const [enemy] = game.enemies;
  enemy.pos = [2, 0, 7]; // behind the wall, off its path
  let back = false;
  for (let i = 0; i < 400 && !back; i++) {
    game.update(idle);
    back = enemy.pos[0] === 1 && enemy.pos[2] <= 3;
  }
  assert.ok(back, `back on its path: ${enemy.pos}`);
});

// ---- alarm (D80)

test("the wizard's Zap alarms a hostile enemy: a \"!\", it turns to him and a chaser searches where he stood", () => {
  const game = gameWith({ enemies: [virus([1, 0, 1], 'v', { aggroRange: 2 })], pos: [6.5, 0, 1.5] });
  const [enemy] = game.enemies;
  game.player.targetFacing = -Math.PI / 2; // aiming along −x
  game.update(cast);
  const events = run(game, 40);
  assert.deepEqual(events.filter((e) => e.type === 'alert').map((e) => e.enemy), [enemy]);
  assert.equal(enemy.integrity, VIRUS.integrity - 1);
  assert.deepEqual(enemy.lastSeen, [6, 1]);
  assert.ok(enemy.behavior.chasing, `after him: ${enemy.behavior.mode}`);
  assert.ok(Math.abs(enemy.facing - Math.PI / 2) < 1e-9, 'faces him');
  run(game, 60);
  assert.ok(enemy.pos[0] >= 3, `on its way to him: ${enemy.pos}`);
});

test('a Zap alarms a hostile bug too ("!"), but not a peaceful one', () => {
  const hostile = gameWith({ enemies: [sitter([4, 0, 3])], pos: [0.5, 0, 3.5] });
  hostile.player.targetFacing = Math.PI / 2;
  hostile.update(cast);
  assert.ok(eventTypes(run(hostile, 30)).includes('alert'));
  assert.equal(hostile.enemies[0].alerted, true);

  const calm = gameWith({ enemies: [sitter([4, 0, 3], 'b', { hostility: 'peaceful' })], pos: [0.5, 0, 3.5] });
  calm.player.targetFacing = Math.PI / 2;
  calm.update(cast);
  assert.ok(!eventTypes(run(calm, 30)).includes('alert'));
  assert.equal(calm.enemies[0].alerted, false);
});

test("any hit alarms: another enemy's burst sends a chaser looking for the wizard (he gets the blame)", () => {
  const game = gameWith({
    enemies: [
      { id: 'z', template: 'zapper', at: [2, 0, 2] },
      virus([2, 0, 3], 'v', { aggroRange: 1.5 }), // next to the zapper, but too far to see him
    ],
    pos: [3.5, 0, 1.5],
  });
  const [, chaser] = game.enemies;
  until(game, 'discharge');
  assert.equal(chaser.integrity, VIRUS.integrity - 1, 'caught in the burst');
  assert.equal(chaser.alerted, true);
  assert.deepEqual(chaser.lastSeen, [3, 1], 'where the wizard stands');
  assert.ok(chaser.behavior.chasing, `after him: ${chaser.behavior.mode}`);
});

test('a popped enemy sees and thinks nothing more', () => {
  const game = gameWith({ enemies: [virus([1, 0, 1])], pos: [3.5, 0, 1.5] });
  const [enemy] = game.enemies;
  run(game, 1);
  assert.equal(enemy.alerted, true);
  enemy.hit(99, 'zap');
  run(game, 5);
  assert.equal(enemy.sees, false);
  assert.equal(enemy.alerted, false);
});

// ---- bolt attack (D80)

test('a shooter charges, then fires a slow bolt that hurts the wizard when it reaches him', () => {
  const game = gameWith({ enemies: [shooter([1, 0, 1])], pos: [5.5, 0, 1.5] });
  const [enemy] = game.enemies;
  until(game, 'charge');
  const events = run(game, enemy.chargeTicks);
  assert.ok(eventTypes(events).includes('discharge'));
  assert.equal(game.bolts.length, 1);
  const [bolt] = game.bolts;
  assert.equal(bolt.owner, enemy);
  assert.equal(bolt.color, SHOOTER.attackColor ?? BUG.color);
  assert.equal(game.player.integrity, game.player.maxIntegrity, 'not yet: it is on its way');
  const flight = run(game, 60);
  const hurt = flight.find((e) => e.type === 'hurt');
  assert.equal(hurt?.enemy, enemy);
  assert.ok(eventTypes(flight).includes('zap'), 'sparks where it stopped');
  assert.equal(game.player.integrity, game.player.maxIntegrity - BUG.damage);
  assert.equal(game.bolts.length, 0);
});

test('stepping aside dodges a bolt; it flies on to the room side', () => {
  const game = gameWith({ enemies: [shooter([1, 0, 1])], pos: [5.5, 0, 1.5] });
  until(game, 'discharge');
  game.player.place([5.5, 0, 4.5]);
  const events = run(game, 80);
  assert.ok(!eventTypes(events).includes('hurt'));
  assert.ok(eventTypes(events).includes('zap'));
  assert.equal(game.player.integrity, game.player.maxIntegrity);
});

test('a bolt hits another enemy in its way; a crate stops it unharmed', () => {
  const game = gameWith({ enemies: [shooter([1, 0, 1]), sitter([3, 0, 1], 'inway', { hostility: 'provoked' })], pos: [5.5, 0, 1.5] });
  const [, inway] = game.enemies;
  until(game, 'discharge');
  run(game, 30);
  assert.equal(inway.integrity, BUG.integrity - 1);
  assert.equal(inway.hostile, true, 'provoked by it');
  assert.equal(game.player.integrity, game.player.maxIntegrity);

  const crated = gameWith({ enemies: [shooter([1, 0, 1])], pos: [5.5, 0, 1.5] });
  until(crated, 'discharge');
  // A destructible crate dropped into its way now takes the bolt, and shrugs it off.
  const crate = new Game(gameData({ rooms: [roomFile('b', { objects: [{ id: 'c', type: 'brittle', at: [3, 0, 1] }] })], objects: { brittle: BRITTLE } })).objects[0];
  crated.objects.push(crate);
  crated.refreshBodies();
  const events = run(crated, 40);
  assert.ok(eventTypes(events).includes('zap'));
  assert.ok(!eventTypes(events).some((t) => t === 'hit' || t === 'break' || t === 'hurt'));
  assert.equal(crate.state, 'rest');
  assert.equal(crate.integrity, 1);
});

test('a shooter aims up at a wizard standing higher', () => {
  const game = gameWith({ enemies: [shooter([1, 0, 1])], blocks: [{ at: [5, 0, 1] }], pos: [5.5, 1, 1.5] });
  until(game, 'discharge');
  assert.ok(game.bolts[0].dir[1] > 0, 'flies up');
  run(game, 60);
  assert.equal(game.player.integrity, game.player.maxIntegrity - BUG.damage);
});

// ---- bolt patterns and bounces (D81)

test('bolt directions: four level axes for a cross; aimed in 3D, or level when it bounces', () => {
  const from = [1.5, 0.4, 1.5];
  assert.deepEqual(boltDirections({ boltPattern: 'cross', boltBounces: 0 }, from, [9, 9, 9], 0), [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]);
  const [aimed] = boltDirections({ boltPattern: 'aimed', boltBounces: 0 }, from, [4.5, 4.4, 1.5], 0);
  assert.deepEqual(aimed.map((c) => Math.round(c * 1e9) / 1e9), [0.6, 0.8, 0]);
  assert.deepEqual(boltDirections({ boltPattern: 'aimed', boltBounces: 2 }, from, [4.5, 4.4, 1.5], 0), [[1, 0, 0]], 'level');
  const [above] = boltDirections({ boltPattern: 'aimed', boltBounces: 2 }, from, [1.5, 3, 1.5], Math.PI / 2);
  assert.ok(Math.abs(above[0] - 1) < 1e-9 && above[1] === 0, `the way it faces: ${above}`);
});

test('a tower fires four ways: bolts along the axes hit the wizard and a bug; its corners are safe', () => {
  const game = gameWith({ enemies: [{ id: 't', template: 'tower', at: [3, 0, 3] }, sitter([6, 0, 3], 'b', { hostility: 'provoked' })], pos: [3.5, 0, 6.5] });
  const [tower, bug] = game.enemies;
  until(game, 'discharge');
  assert.equal(game.bolts.length, 4);
  assert.ok(game.bolts.every((bolt) => bolt.owner === tower && bolt.dir[1] === 0));
  run(game, 60);
  assert.equal(game.player.integrity, game.player.maxIntegrity - SENTINEL_TYPE.damage, 'the +z bolt');
  assert.equal(bug.integrity, BUG.integrity - 1, 'the +x bolt');
  assert.equal(bug.alerted, true, 'alarmed by the hit');

  const corner = gameWith({ enemies: [{ id: 't', template: 'tower', at: [3, 0, 3] }], pos: [5.5, 0, 5.5] });
  until(corner, 'discharge');
  run(corner, 60);
  assert.equal(corner.player.integrity, corner.player.maxIntegrity);
});

test('a bouncing bolt glances off the room side and comes back at its own shooter', () => {
  const game = gameWith({ enemies: [{ id: 'b', template: 'bouncer', at: [1, 0, 3] }], pos: [5.5, 0, 3.5] });
  const [enemy] = game.enemies;
  until(game, 'discharge');
  game.player.place([5.5, 0, 6.5]); // out of the way
  const events = run(game, 100);
  const ricochets = events.filter((e) => e.type === 'ricochet');
  assert.equal(ricochets.length, 1);
  assert.ok(ricochets[0].pos[0] > 7.5 && ricochets[0].dir[0] > 0, `off the +x side, coming in along +x: ${ricochets[0].pos}`);
  assert.equal(enemy.integrity, BUG.integrity - 1, 'hit by its own bolt');
  assert.equal(game.player.integrity, game.player.maxIntegrity);
});

test('a bouncing bolt glances off a crate (unharmed), then stops at the next wall', () => {
  const game = gameWith({ enemies: [{ id: 'b', template: 'bouncer', at: [1, 0, 3] }], pos: [5.5, 0, 3.5] });
  const [enemy] = game.enemies;
  until(game, 'discharge');
  const crate = new Game(gameData({ rooms: [roomFile('b', { objects: [{ id: 'c', type: 'brittle', at: [3, 0, 3] }] })], objects: { brittle: BRITTLE } })).objects[0];
  game.objects.push(crate);
  game.refreshBodies();
  const [bolt] = game.bolts;
  const events = run(game, 30);
  assert.equal(events.filter((e) => e.type === 'ricochet').length, 1);
  assert.equal(crate.state, 'rest');
  assert.equal(crate.integrity, 1);
  assert.equal(bolt.target, enemy, 'back into its shooter');
});

// ---- data (D80)

test('data: chasers need an aggro range, peaceful enemies no charged attack, nobody starts on a void block', () => {
  const errors = (enemies, blocks = []) =>
    validateData(dataFiles({ rooms: [roomFile('alpha', { enemies, blocks })], enemies: TEMPLATES, objects: { crate: CRATE } })).join('\n');
  assert.equal(errors([shooter([1, 0, 1])]), '');
  assert.match(errors([virus([1, 0, 1], 'v', { aggroRange: 0, attack: 'touch' })]), /a chaser needs an aggroRange above 0/);
  assert.match(errors([virus([1, 0, 1], 'v', { hostility: 'peaceful' })]), /a peaceful enemy never fires its burst/);
  assert.equal(errors([virus([1, 0, 1], 'v', { hostility: 'peaceful', attack: 'none' })]), '');
  assert.match(errors([shooter([1, 1, 1])], [{ at: [1, 0, 1], type: 'void' }]), /starts on a lethal block at \[1,0,1\]/);
  assert.match(errors([{ ...shooter([1, 0, 1]), overrides: { boltSpeed: 40 } }]), /"boltSpeed" must be between 0\.5 and 16/);
  assert.match(errors([{ ...shooter([1, 0, 1]), overrides: { wings: 2 } }]), /"wings" is not a property of template "shooter"/);
  assert.match(errors([{ ...shooter([1, 0, 1]), overrides: { boltPattern: 'star' } }]), /"boltPattern" must be one of aimed, cross/);
  assert.match(errors([{ ...shooter([1, 0, 1]), overrides: { boltBounces: 1.5 } }]), /"boltBounces" must be a whole number/);
  assert.equal(errors([{ ...shooter([1, 0, 1]), overrides: { boltPattern: 'cross', boltBounces: 3 } }]), '');
});

// ---- looks

test('look: every enemy shares the mood colors, and every pop is over after its time', () => {
  assert.equal(eyeMood({ hostile: true, data: { hostility: 'provoked' } }), 'hostile');
  assert.equal(eyeMood({ hostile: false, data: { hostility: 'provoked' } }), 'provoked');
  assert.equal(eyeMood({ hostile: false, data: { hostility: 'peaceful' } }), 'peaceful');
  assert.deepEqual(Object.keys(MOODS), ['hostile', 'provoked', 'peaceful']);
  for (const [pop, look] of [
    [popPixels, BUG_LOOK],
    [virusPopPixels, VIRUS_LOOK],
    [sentinelPopPixels, SENTINEL],
    [cronPopPixels, CRON],
    [wormPopPixels, WORM],
    [crawlerPopPixels, CRAWLER],
  ]) {
    assert.equal(pop(0).length, look.pop.pixels);
    assert.deepEqual(pop(look.pop.ticks), []);
    assert.deepEqual(pop(-1), []);
  }
  const burst = popBurst({ pixels: 3, ticks: 10, spread: 0, rise: 0 }, { seed: 1, middle: 0.5, start: 0 });
  assert.deepEqual(burst(5).map(({ offset }) => offset[1]), [0.5, 0.5, 0.5], 'no rise nor scatter: level');
});

test('look (D104): every model builds, poses in every state without NaN, arcs from a reach and pops', () => {
  for (const [look, model] of Object.entries(ENEMY_MODELS)) {
    const enemy = model.create('#7a7dff');
    assert.equal(typeof model.muzzle, 'number', `${look}: muzzle is a reach along the line of fire`);
    for (const pose of [
      { state: 'rest', time: 0.3 },
      { state: 'walk', walked: 0.4, time: 1.1, alert: 1 },
      { state: 'fall', time: 2 },
      { time: 2.5, alert: 1, attack: 20, charge: 36 },
      { time: 2.9, alert: 1, attack: 40, charge: 36, squash: 0.2, shift: 0.05 },
    ]) {
      model.animate(enemy, pose);
      model.setMood(enemy, 'provoked');
      enemy.updateMatrixWorld(true);
      enemy.traverse((node) => assert.ok(node.matrixWorld.elements.every(Number.isFinite), `${look}: finite pose`));
    }
    assert.equal(model.popPixels(0).length, model.pop.pixels, look);
    assert.deepEqual(model.popPixels(model.pop.ticks), [], look);
  }
});

test('look (wyrm): its plates are shades of its body color, neighbors apart, darker towards the tail', () => {
  const shades = wyrmShades('#3dff9a');
  assert.equal(shades.length, WYRM.plates.length);
  const hsl = shades.map((c) => c.getHSL({}));
  hsl.slice(1).forEach((h, i) => {
    assert.ok(h.l < hsl[i].l, 'darker plate by plate');
    assert.notEqual(h.h, hsl[i].h, 'neighbors apart');
  });
});

test('look (phish): calm it is a bare disk; after the wizard its legs, jaw and eyes come out', () => {
  const phish = createPhish('#eef3ff');
  animatePhish(phish, { time: 1 });
  assert.ok(phish.userData.legs.every(({ thigh }) => !thigh.visible), 'disguised');
  animatePhish(phish, { time: 1.2, alert: 1 });
  assert.ok(phish.userData.legs.every(({ thigh }) => thigh.visible), 'sprung');
  assert.equal(phish.userData.disk.userData.spin.position.y, PHISH.stand);
});

test('look (cron, D83): its four emitters hold the grid axes at bolt height whichever way it faces', () => {
  const cron = createCron('#ff4f7a');
  for (const facing of [0, 1.1, -2.5]) {
    cron.rotation.y = facing;
    animateCron(cron, { time: 3.7, alert: 1 });
    cron.updateMatrixWorld(true);
    const tips = cron.userData.emitters.map((tip) => tip.getWorldPosition(new Vector3()));
    const axes = tips.map(({ x, z }) => [Math.round(x / Math.hypot(x, z)), Math.round(z / Math.hypot(x, z))].join()).sort();
    assert.deepEqual(axes, ['-1,0', '0,-1', '0,1', '1,0'], `facing ${facing}`);
    for (const tip of tips) {
      assert.ok(Math.abs(tip.y - ENEMY.eyeHeight) < 0.03, 'at the height the bolts leave');
      assert.ok(Math.hypot(tip.x, tip.z) <= BOLT.reach + 0.05, 'where a bolt starts, not beyond');
    }
  }
});

test('look (cron): the hand whirls whole turns over a charge, so it lands where it would have been', () => {
  const turn = Math.PI * 2;
  const extra = (cronHand(2, 0.5, 1) - cronHand(2, 0.5, 0)) / turn;
  assert.equal(extra, -CRON.whirl);
  assert.ok(Number.isInteger(CRON.whirl));
  assert.ok(Math.abs(cronHand(1, 1, 0)) > Math.abs(cronHand(1, 0, 0)), 'faster while after the wizard');
});

test('look (worm): the head leads, the tail trails behind it on the floor, humps rise and never sink', () => {
  const flat = wormSpine(0, 0);
  assert.equal(flat.length, WORM.tail.length + 1);
  assert.deepEqual(flat[0], [0, WORM.head.r, WORM.head.z]);
  flat.slice(1).forEach(([x, y, z], i) => {
    assert.ok(z < flat[i][2], 'each ball behind the one before');
    assert.equal(y, WORM.tail[i][0], 'resting on the floor');
    assert.ok(Math.abs(x) <= WORM.wiggle.width, 'wiggling no wider than its wiggle');
  });
  for (let phase = 0; phase < 7; phase += 0.5) {
    wormSpine(phase).slice(1).forEach(([, y], i) => assert.ok(y >= WORM.tail[i][0] && y <= WORM.tail[i][0] + WORM.hump.height + 1e-9));
  }
});

test('look (crawler): a foot swings forward lifted, then slides back planted; a tripod is always down', () => {
  const { stride, lift } = CRAWLER.step;
  assert.deepEqual(crawlerFoot(0), [-stride / 2, 0]);
  const [, top] = crawlerFoot(0.25);
  assert.ok(Math.abs(top - lift) < 1e-9, 'highest halfway through its swing');
  assert.deepEqual(crawlerFoot(0.75), [0, 0], 'planted, halfway back');
  const crawler = createCrawler('#3dffd0');
  for (let walked = 0; walked < 2; walked += 0.07) {
    animateCrawler(crawler, { state: 'walk', walked });
    crawler.updateMatrixWorld(true);
    const down = crawler.userData.legs.filter(({ lower }) => {
      // The foot: the lower part's far end (placeLimb() stretches it from the knee along +y).
      const foot = new Vector3(0, 0.5, 0).applyMatrix4(lower.matrixWorld);
      return foot.y < 1e-6;
    });
    assert.ok(down.length >= 3, `three feet down at ${walked.toFixed(2)} cells`);
  }
});

test('a chaser with a touch attack (the crawler, D83) runs up to the wizard and hurts him', () => {
  const game = gameWith({ enemies: [virus([1, 0, 3], 'c', { look: 'crawler', attack: 'touch' })], pos: [5.5, 0, 3.5] });
  until(game, 'hurt', 300);
  assert.equal(game.player.integrity, game.player.maxIntegrity - VIRUS.damage);
});
