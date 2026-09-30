import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { PLAYER } from '../src/entities/player.js';
import { WARP, warpTarget } from '../src/entities/warp.js';
import { PLAYER_HITBOX } from '../src/core/rules.js';
import { WARP_FX, dashLook, kickPixels, warpFlash } from '../src/render/warp-fx.js';
import { dashPose } from '../src/render/warp-view.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { BUG, SPELLS, eventTypes, gameData, grid, idle, roomFile } from './helpers.js';

/** Half the wizard's width: his feet center stops this far from a wall. */
const HALF = PLAYER_HITBOX[0] / 2;

/** A still body with a box, like a room object or an enemy. */
const body = (box) => ({ box: () => box });

/** A 1×1×1 box with its lower corner at [x, y, z]. */
const cube = ([x, y, z]) => [
  [x, x + 1],
  [y, y + 1],
  [z, z + 1],
];

/** Fake input pressing one action this tick. */
const press = (action) => ({ down: (a) => a === action, pressed: (a) => a === action });

/**
 * A game in one 12×4×8 room; the wizard knows Blink and Warp, stands at
 * `pos` and aims along +x.
 */
function gameWith(props = {}, pos = [1.5, 0, 3.5]) {
  const game = new Game(gameData({ rooms: [roomFile('alpha', { size: [12, 4, 8], spawn: [0.5, 0, 7.5], ...props })] }), {
    progress: new Progress([4, 5].map((slot) => saveBit('spells', slot))),
  });
  game.player.place(pos);
  game.player.facing = game.player.targetFacing = Math.PI / 2;
  return game;
}

/** Cast `spell` (selecting it first); returns this tick's events. */
function cast(game, spell) {
  while (game.player.spell !== spell) game.update(press('spellNext'));
  return game.update(press('cast'));
}

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-3, `${message ?? ''} ${actual} ≉ ${expected}`);

test('warpTarget goes its full range through open space, over holes and hazard floors', () => {
  const g = grid({ size: [12, 4, 8], holes: [[3, 3], [4, 3]], blocks: { hazard: [[3, 0, 2]] } });
  const target = warpTarget([1.5, 0, 3.5], PLAYER_HITBOX, [1, 0], 3, g, [], []);
  assert.deepEqual(target, { to: [4.5, 0, 3.5], distance: 3, cut: false, passed: [] });
});

test('warpTarget stops short of a block, an object and the room side (open space only, D86)', () => {
  const g = grid({ size: [12, 4, 8], cells: [[4, 0, 3]] });
  const wall = warpTarget([1.5, 0, 3.5], PLAYER_HITBOX, [1, 0], 3, g, [], []);
  close(wall.to[0], 4 - HALF, 'against the block');
  assert.equal(wall.cut, true);

  const crate = warpTarget([1.5, 0, 3.5], PLAYER_HITBOX, [1, 0], 3, grid({ size: [12, 4, 8] }), [body(cube([3, 0, 3]))], []);
  close(crate.to[0], 3 - HALF, 'against the crate');
  assert.equal(crate.cut, true);

  const side = warpTarget([10.5, 0, 3.5], PLAYER_HITBOX, [1, 0], 3, grid({ size: [12, 4, 8] }), [], []);
  close(side.to[0], 12 - HALF, 'against the side');
  assert.equal(side.cut, true);
});

test('a two-thick wall stops it: it never goes through one', () => {
  const g = grid({ size: [12, 4, 8], cells: [[3, 0, 3], [3, 1, 3]] });
  const target = warpTarget([1.5, 0, 3.5], PLAYER_HITBOX, [1, 0], Infinity, g, [], []);
  close(target.to[0], 3 - HALF);
});

test('with no range limit it goes as far as the first stop (Warp)', () => {
  const g = grid({ size: [12, 4, 8], cells: [[10, 0, 3]] });
  const target = warpTarget([1.5, 0, 3.5], PLAYER_HITBOX, [1, 0], Infinity, g, [], []);
  close(target.to[0], 10 - HALF);
});

test('it keeps his height: from mid-jump it passes over a low block', () => {
  const g = grid({ size: [12, 4, 8], cells: [[3, 0, 3]] });
  const target = warpTarget([1.5, 1.1, 3.5], PLAYER_HITBOX, [1, 0], 3, g, [], []);
  assert.deepEqual(target.to, [4.5, 1.1, 3.5]);
  assert.equal(target.cut, false);
});

test('enemies are passed, never landed in: it backs off to a free spot', () => {
  const g = grid({ size: [12, 4, 8] });
  const enemy = body(cube([2, 0, 3]));
  const aside = body(cube([2, 0, 5]));
  const passed = warpTarget([1.5, 0, 3.5], PLAYER_HITBOX, [1, 0], 3, g, [], [enemy, aside]);
  assert.deepEqual(passed.to, [4.5, 0, 3.5]);
  assert.deepEqual(passed.passed, [enemy], 'only the one on the way');
  const landing = warpTarget([1.5, 0, 3.5], PLAYER_HITBOX, [1, 0], 3, g, [], [body(cube([4, 0, 3]))]);
  assert.ok(landing.to[0] + HALF <= 4 + 1e-9, `short of the enemy: ${landing.to[0]}`);
  assert.equal(landing.cut, false, 'an enemy is no wall');
});

test('diagonally it sweeps the line and stops at a corner in its way', () => {
  const g = grid({ size: [12, 4, 8], cells: [[3, 0, 5]] });
  const dir = [Math.SQRT1_2, Math.SQRT1_2];
  const target = warpTarget([1.5, 0, 3.5], PLAYER_HITBOX, dir, 3, g, [], []);
  assert.ok(target.cut);
  assert.ok(target.distance < 3);
});

test('right against a wall there is nowhere to go', () => {
  const g = grid({ size: [12, 4, 8], cells: [[2, 0, 3]] });
  assert.equal(warpTarget([2 - HALF, 0, 3.5], PLAYER_HITBOX, [1, 0], 3, g, [], []), null);
  assert.equal(warpTarget([2 - HALF - WARP.minDistance / 2, 0, 3.5], PLAYER_HITBOX, [1, 0], 3, g, [], []), null);
});

test('from an exit opening it can go back into the room', () => {
  const g = grid({ size: [12, 4, 8], exits: [{ id: 'w', side: '-x', at: 3, y: 0, width: 1, height: 2 }] });
  const target = warpTarget([-0.2, 0, 3.5], PLAYER_HITBOX, [1, 0], 3, g, [], []);
  assert.deepEqual(target.to, [2.8, 0, 3.5]);
});

test('Blink teleports him 3 units the way he aims, for its energy, leaving an afterimage (D86)', () => {
  const game = gameWith({ holes: [{ at: [2, 3], to: [3, 3] }] });
  const energy = game.player.energy;
  const events = cast(game, 'blink');
  const warp = events.find((e) => e.type === 'warp');
  assert.deepEqual(warp.from, [1.5, 0, 3.5]);
  assert.deepEqual(game.player.pos, [4.5, 0, 3.5]);
  assert.deepEqual(game.player.prev, game.player.pos, 'drawn there at once, not slid');
  assert.equal(game.player.energy, energy - SPELLS.blink.cost);
  assert.deepEqual(game.player.warp, { spell: 'blink', from: [1.5, 0, 3.5], to: [4.5, 0, 3.5], tick: 0 });
  assert.ok(eventTypes(events).includes('cast'));
  assert.ok(!eventTypes(events).includes('hurt'));
  // Over the two-tile gap and still standing.
  for (let i = 0; i < 10; i++) game.update(idle);
  assert.equal(game.player.dead, false);
  for (let i = 0; i < PLAYER.warpTicks; i++) game.update(idle);
  assert.equal(game.player.warp, null, 'the afterimage fades');
});

test('Blink cut short by a wall lands him against it, hurt', () => {
  const game = gameWith({ blocks: [{ at: [3, 0, 3], to: [3, 1, 3] }] });
  const events = cast(game, 'blink');
  close(game.player.pos[0], 3 - HALF);
  const hurt = events.find((e) => e.type === 'hurt');
  assert.equal(hurt?.amount, SPELLS.blink.damage);
  assert.equal(game.player.integrity, PLAYER.maxIntegrity - SPELLS.blink.damage);
});

test('Warp goes to the wall, however far, and never hurts', () => {
  const game = gameWith({ blocks: [{ at: [10, 0, 3], to: [10, 1, 3] }] });
  const events = cast(game, 'warp');
  close(game.player.pos[0], 10 - HALF);
  assert.ok(!eventTypes(events).includes('hurt'));
  assert.equal(game.player.energy, PLAYER.maxEnergy - SPELLS.warp.cost);
});

test('Blink or Warp right against a wall fizzles: he stays and keeps his energy', () => {
  const game = gameWith({ blocks: [{ at: [2, 0, 3], to: [2, 1, 3] }] }, [2 - HALF, 0, 3.5]);
  for (const spell of ['blink', 'warp']) {
    const events = cast(game, spell);
    assert.deepEqual(eventTypes(events).filter((t) => t !== 'spell' && t !== 'land'), ['fizzle']);
    assert.equal(game.player.energy, PLAYER.maxEnergy);
    assert.equal(game.player.cooldown, 0);
    assert.equal(game.player.integrity, PLAYER.maxIntegrity);
    close(game.player.pos[0], 2 - HALF);
  }
});

test('Blink onto a hole drops him in', () => {
  const game = gameWith({ holes: [{ at: [4, 3] }] });
  cast(game, 'blink');
  const events = [];
  for (let i = 0; i < 5; i++) events.push(...game.update(idle));
  assert.ok(eventTypes(events).includes('die'));
});

test('a respawn or a new room clears the afterimage', () => {
  const game = gameWith();
  cast(game, 'blink');
  assert.ok(game.player.warp);
  game.enterRoom('alpha');
  assert.equal(game.player.warp, null);
});

/** A bug standing still (integrity 3), not bouncy. */
const SITTER = { ...BUG, movement: 'stationary', bounce: false, integrity: 3 };

test('Blink hits every enemy it passes through; Warp passes them harmlessly (D86)', () => {
  for (const [spell, loss] of [['blink', SPELLS.blink.hitDamage], ['warp', 0]]) {
    const game = new Game(
      gameData({
        rooms: [roomFile('alpha', { size: [12, 4, 8], spawn: [0.5, 0, 7.5], blocks: [{ at: [6, 0, 3], to: [6, 1, 3] }], enemies: [{ id: 'a', template: 'sitter', at: [2, 0, 3] }, { id: 'b', template: 'sitter', at: [3, 0, 3] }] })],
        enemies: { bug: BUG, sitter: SITTER },
      }),
      { progress: new Progress([4, 5].map((slot) => saveBit('spells', slot))) },
    );
    game.player.place([1.2, 0, 3.5]);
    game.player.facing = game.player.targetFacing = Math.PI / 2;
    const events = cast(game, spell);
    assert.ok(game.player.pos[0] > 4, `${spell} went past them`);
    for (const enemy of game.enemies) assert.equal(enemy.integrity, SITTER.integrity - loss, `${spell}: ${enemy.id}`);
    assert.equal(events.filter((e) => e.type === 'hit').length, loss > 0 ? 2 : 0);
  }
});

test('a Blink hit pops an enemy on its last integrity', () => {
  const game = new Game(
    gameData({
      rooms: [roomFile('alpha', { size: [12, 4, 8], spawn: [0.5, 0, 7.5], enemies: [{ id: 'a', template: 'sitter', at: [2, 0, 3] }] })],
      enemies: { bug: BUG, sitter: { ...SITTER, integrity: 1 } },
    }),
    { progress: new Progress([4].map((slot) => saveBit('spells', slot))) },
  );
  game.player.place([1.2, 0, 3.5]);
  game.player.facing = game.player.targetFacing = Math.PI / 2;
  const events = cast(game, 'blink');
  assert.ok(eventTypes(events).includes('pop'));
  assert.equal(game.enemies[0].alive, false);
});

test('the Blink dash is drawn shooting forward, stretched, then settles (D86)', () => {
  assert.deepEqual(dashLook(0), { along: 0, stretch: 1 + WARP_FX.dashStretch });
  assert.equal(dashLook(WARP_FX.dashTicks).along, 1);
  assert.ok(dashLook(1).along > 1 / WARP_FX.dashTicks, 'fast from the start');
  assert.equal(dashLook(WARP_FX.dashTicks + 3).stretch, 1);
  const warp = { spell: 'blink', from: [0, 0, 0], to: [3, 0, 0] };
  assert.deepEqual(dashPose(warp, [3, 0, 0], 0).pos, [0, 0, 0]);
  assert.deepEqual(dashPose(warp, [3, -0.5, 0], WARP_FX.dashTicks).pos, [3, -0.5, 0], 'his fall shows');
  assert.deepEqual(dashPose({ ...warp, spell: 'warp' }, [3, 0, 0], 0), { pos: [3, 0, 0], stretch: 1 }, 'Warp is no dash');
});

test('the Blink kick and the Warp flash are over in time (the Warp pixels: stream.test.js)', () => {
  assert.deepEqual(kickPixels(PLAYER.warpTicks, [1, 0]), []);
  assert.ok(warpFlash(0) > 0.5);
  assert.equal(warpFlash(WARP_FX.flashTicks), 0);
});
