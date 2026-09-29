import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseEnemy } from '../src/combat.js';
import { Game } from '../src/game.js';
import { PLAYER } from '../src/entities/player.js';
import { PLAYER_HITBOX } from '../src/core/rules.js';
import { aimAxis, frontCell } from '../src/entities/clip.js';
import { CLIP_FX, clipPixels, marqueeLook, pasteGrow } from '../src/render/clip-fx.js';
import { clipIcon } from '../src/ui/clip-icon.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { BUG, CRATE, SPELLS, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** Fake input pressing one action this tick. */
const press = (action) => ({ down: (a) => a === action, pressed: (a) => a === action });

/** A bug that stays in its cell. */
const STILL = { ...BUG, movement: 'stationary' };

/** A destructible crate type (two Zaps). */
const CRATE_CROSS = { ...CRATE, integrity: 2 };

/**
 * A game in 12×4×8 rooms alpha (with `props`) and beta; the wizard knows
 * Pause and Cut & Paste (selected), stands at `pos` and aims along +x.
 */
function gameWith(props = {}, pos = [1.5, 0, 3.5]) {
  const rooms = [roomFile('alpha', { size: [12, 4, 8], spawn: [0.5, 0, 7.5], ...props }), roomFile('beta', { size: [12, 4, 8] })];
  const game = new Game(gameData({ rooms, objects: { crate: CRATE, crate_cross: CRATE_CROSS }, enemies: { bug: BUG, still: STILL } }), {
    progress: new Progress([3, 6].map((slot) => saveBit('spells', slot))),
  });
  game.player.spell = 'cut_paste';
  aim(game, pos, Math.PI / 2);
  return game;
}

/** Put the wizard at `pos`, facing `facing` (radians; π/2 is +x). */
function aim(game, pos, facing) {
  game.player.place(pos);
  game.player.facing = game.player.targetFacing = facing;
}

/** Cast the selected spell after the cooldown of the last one; returns this tick's events. */
function cast(game) {
  for (let i = 0; i < 20; i++) game.update(idle);
  return game.update(press('cast'));
}

test('the cell in front is the first whole cell ahead of his box, on his grid axis', () => {
  assert.deepEqual(aimAxis([1, 0]), [1, 0]);
  assert.deepEqual(aimAxis([0.3, -0.9]), [0, -1]);
  assert.deepEqual(aimAxis([Math.SQRT1_2, Math.SQRT1_2]), [1, 0], 'a tie goes to x');
  assert.deepEqual(frontCell([1.5, 0, 3.5], PLAYER_HITBOX, [1, 0]), [2, 0, 3]);
  assert.deepEqual(frontCell([1.9, 0, 3.5], PLAYER_HITBOX, [1, 0]), [3, 0, 3], 'his box reaches into cell 2');
  assert.deepEqual(frontCell([1.7, 0, 3.5], PLAYER_HITBOX, [1, 0]), [2, 0, 3], 'flush with cell 2');
  assert.deepEqual(frontCell([1.5, 1, 3.5], PLAYER_HITBOX, [-1, 0]), [0, 1, 3]);
  assert.deepEqual(frontCell([1.5, 0.6, 3.2], PLAYER_HITBOX, [0, 1]), [1, 1, 4], 'mid-jump: the nearest level');
});

test('Cut takes the crate in front into his clipboard for 20 energy; Paste puts it back for nothing (D87)', () => {
  const game = gameWith({ objects: [{ id: 'box', type: 'crate', at: [2, 0, 3] }] });
  const crate = game.objects[0];
  const events = cast(game);
  assert.deepEqual(eventTypes(events), ['cut', 'cast']);
  assert.equal(events[0].object, crate);
  assert.deepEqual(events[0].cell, [2, 0, 3]);
  assert.equal(game.player.energy, PLAYER.maxEnergy - SPELLS.cut_paste.cost);
  assert.equal(game.objects.length, 0);
  assert.ok(!game.solids.includes(crate) && !game.bodies.includes(crate));
  assert.equal(game.player.clipboard.kind, 'object');
  assert.equal(game.player.clip.mode, 'cut');

  const energy = game.player.energy;
  aim(game, [1.5, 0, 3.5], 0); // facing +z now
  const pasted = cast(game);
  assert.deepEqual(eventTypes(pasted), ['paste', 'cast']);
  const [copy] = game.objects;
  assert.equal(pasted[0].object, copy);
  assert.deepEqual(copy.pos, [1, 0, 4]);
  assert.equal(copy.id, 'box~1');
  assert.ok(game.solids.includes(copy));
  assert.ok(game.player.energy >= energy, 'pasting costs nothing');
  assert.equal(game.player.clipboard, null);
});

test('with nothing to cut or no room to paste it fizzles: energy kept, clipboard kept', () => {
  const game = gameWith({ blocks: [{ at: [1, 0, 4] }], objects: [{ id: 'box', type: 'crate', at: [2, 0, 3] }] });
  aim(game, [1.5, 0, 3.5], -Math.PI / 2); // facing −x: nothing there
  assert.deepEqual(eventTypes(cast(game)), ['fizzle']);
  assert.equal(game.player.energy, PLAYER.maxEnergy);

  aim(game, [1.5, 0, 3.5], Math.PI / 2);
  cast(game);
  const energy = game.player.energy;
  aim(game, [1.5, 0, 3.5], 0); // a block in front
  assert.deepEqual(eventTypes(cast(game)), ['fizzle']);
  assert.ok(game.player.clipboard);
  aim(game, [0.5, 0, 3.5], -Math.PI / 2); // the room's side in front
  assert.deepEqual(eventTypes(cast(game)), ['fizzle']);
  assert.ok(game.player.energy >= energy);
  assert.ok(game.player.clipboard);
});

test('only on his own level: a crate with something on it stays, one a level up is out of reach', () => {
  const game = gameWith({
    blocks: [{ at: [1, 0, 3] }],
    objects: [
      { id: 'low', type: 'crate', at: [2, 0, 3] },
      { id: 'top', type: 'crate', at: [2, 1, 3] },
    ],
  });
  const [low, top] = game.objects;
  aim(game, [2.5, 0, 2.5], 0); // on the floor facing +z: the low crate, loaded
  assert.deepEqual(eventTypes(cast(game)), ['fizzle']);
  aim(game, [2.5, 0, 4.5], Math.PI); // facing −z from the other side: same, and the top one is a level up
  assert.deepEqual(eventTypes(cast(game)), ['fizzle']);

  aim(game, [1.5, 1, 3.5], Math.PI / 2); // on the block: the top crate is on his level
  assert.equal(cast(game)[0].object, top);
  aim(game, [1.5, 1, 3.5], Math.PI);
  cast(game); // paste it off the stack; it drops to the floor
  aim(game, [2.5, 0, 2.5], 0);
  assert.equal(cast(game)[0].object, low, 'nothing on it any more');

  const loaded = gameWith({ objects: [{ id: 'box', type: 'crate', at: [2, 0, 3] }], enemies: [{ id: 'bug', template: 'still', at: [2, 1, 3] }] });
  assert.deepEqual(eventTypes(cast(loaded)), ['fizzle'], 'a bug sits on it');
});

test('only a frozen enemy can be cut; it pastes still frozen for what was left, its freeze paused while held', () => {
  const game = gameWith({ enemies: [{ id: 'bug', template: 'still', at: [2, 0, 3] }] });
  const [bug] = game.enemies;
  assert.deepEqual(eventTypes(cast(game)), ['fizzle'], 'not while it is awake');

  pauseEnemy(game, bug, 300);
  for (let i = 0; i < 40; i++) game.update(idle);
  bug.integrity = 1;
  const events = game.update(press('cast'));
  assert.equal(events.find((e) => e.type === 'cut')?.enemy, bug);
  assert.equal(game.enemies.length, 0);
  const left = bug.frozen.ticks - bug.frozen.tick;
  for (let i = 0; i < 100; i++) game.update(idle);
  aim(game, [1.5, 0, 3.5], 0);
  const pasted = game.update(press('cast')).find((e) => e.type === 'paste').enemy;
  assert.notEqual(pasted, bug);
  assert.deepEqual(pasted.pos, [1, 0, 4]);
  // No time passed while held; it thaws on from the tick it is pasted in.
  assert.equal(pasted.frozen.ticks - pasted.frozen.tick, left - 1);
  assert.equal(pasted.integrity, 1);
  assert.ok(pasted.provoked);
  assert.ok(game.solids.includes(pasted), 'solid while frozen');
  for (let i = 0; i < left; i++) game.update(idle);
  assert.equal(pasted.frozen, null, 'it thaws as usual');
});

test('a pasted enemy takes its patrol path along', () => {
  const game = gameWith({ enemies: [{ id: 'bug', template: 'bug', at: [2, 0, 3], path: { points: [[5, 0, 3]] } }] });
  pauseEnemy(game, game.enemies[0], 30);
  cast(game);
  aim(game, [1.5, 0, 3.5], 0);
  const pasted = cast(game).find((e) => e.type === 'paste').enemy;
  assert.deepEqual(pasted.data.path.points, [[4, 0, 4]]);
});

test('a pasted destructible crate keeps its integrity; pasted over a hole it plugs it', () => {
  const game = gameWith({ holes: [{ at: [1, 4] }], objects: [{ id: 'box', type: 'crate_cross', at: [2, 0, 3] }] });
  game.objects[0].hit(1);
  cast(game);
  aim(game, [1.5, 0, 3.5], 0);
  const events = cast(game);
  const copy = events.find((e) => e.type === 'paste').object;
  assert.equal(copy.integrity, 1);
  for (let i = 0; i < 30; i++) events.push(...game.update(idle));
  assert.equal(copy.state, 'plugged');
  assert.ok(events.some((e) => e.type === 'plug'));
});

test('what he holds goes with him to another room; the room he took it from has it back (D87)', () => {
  const game = gameWith({ objects: [{ id: 'box', type: 'crate', at: [2, 0, 3] }] });
  cast(game);
  game.enterRoom('beta');
  assert.equal(game.player.clipboard.data.id, 'box');
  aim(game, [1.5, 0, 3.5], Math.PI / 2);
  cast(game);
  assert.deepEqual(game.objects.map((o) => [o.id, o.pos]), [['box~1', [2, 0, 3]]]);
  game.enterRoom('alpha');
  assert.deepEqual(game.objects.map((o) => o.id), ['box'], 'rooms reset: it is back');
});

test('dying loses what he holds', () => {
  const game = gameWith({ objects: [{ id: 'box', type: 'crate', at: [2, 0, 3] }] });
  cast(game);
  game.hurt(PLAYER.maxIntegrity);
  assert.equal(game.player.clipboard, null);
});

test('the effect: the marquee snaps on, the pixels stream, a pasted thing grows in', () => {
  const { snapTicks, streamTicks } = CLIP_FX;
  assert.ok(marqueeLook('cut', 0).visible);
  assert.ok(marqueeLook('cut', 0).scale > marqueeLook('cut', snapTicks).scale, 'it snaps in');
  assert.equal(marqueeLook('cut', PLAYER.clipTicks).visible, false);
  const from = [2.5, 0.5, 3.5];
  const hands = [1.8, 0.48, 3.5];
  assert.equal(clipPixels('cut', 0, from, 1, hands).length, 0, 'the crate still shows while the marquee snaps on');
  assert.equal(clipPixels('cut', snapTicks + 1, from, 1, hands).length, CLIP_FX.pixels);
  assert.equal(clipPixels('cut', snapTicks + streamTicks, from, 1, hands).length, 0);
  assert.equal(pasteGrow(0), 0);
  assert.equal(pasteGrow(PLAYER.clipTicks), 1);
});

test('the HUD clipboard icon: nothing when empty, a cube for a crate, a caged enemy when frozen', () => {
  assert.equal(clipIcon(null, '#c9a2ff'), '');
  const crate = clipIcon({ kind: 'object', data: { color: '#b6ff3c' } }, '#c9a2ff');
  assert.match(crate, /^<svg/);
  assert.match(crate, /#b6ff3c/);
  assert.doesNotMatch(crate, /#c9a2ff/);
  const bug = clipIcon({ kind: 'enemy', data: { color: '#2bff88' }, frozen: { tick: 0, ticks: 300 } }, '#c9a2ff');
  assert.match(bug, /#2bff88/);
  assert.match(bug, /#c9a2ff/, 'in its cage');
});
