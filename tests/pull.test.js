import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseEnemy } from '../src/combat.js';
import { Game } from '../src/game.js';
import { PLAYER } from '../src/entities/player.js';
import { pullTarget } from '../src/entities/pull.js';
import { PULL_FX, PULL_PIXELS, pullMarquee, pullPixels } from '../src/render/pull-fx.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { BUG, CRATE, SPELLS, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** Fake input pressing one action this tick. */
const press = (action) => ({ down: (a) => a === action, pressed: (a) => a === action });

/** A bug that stays in its cell. */
const STILL = { ...BUG, movement: 'stationary' };

/**
 * A game in a 12×4×8 room with `props`; the wizard knows Pause and Pull
 * (selected), stands at `pos` and aims along +x.
 */
function gameWith(props = {}, pos = [1.5, 0, 3.5]) {
  const rooms = [roomFile('alpha', { size: [12, 4, 8], spawn: [0.5, 0, 7.5], ...props })];
  const game = new Game(gameData({ rooms, objects: { crate: CRATE }, enemies: { bug: BUG, still: STILL } }), {
    progress: new Progress([3, 10].map((slot) => saveBit('spells', slot))),
  });
  game.player.spell = 'pull';
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

/** Run `ticks` ticks without input; returns their events. */
function run(game, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(idle));
  return events;
}

test('Pull slides the first crate in line one cell towards him for 15 energy (D124)', () => {
  const game = gameWith({ objects: [{ id: 'box', type: 'crate', at: [5, 0, 3] }] });
  const [crate] = game.objects;
  const events = cast(game);
  assert.deepEqual(eventTypes(events), ['pull', 'cast']);
  assert.equal(events[0].object, crate);
  assert.deepEqual(events[0].cell, [5, 0, 3]);
  assert.equal(game.player.energy, PLAYER.maxEnergy - SPELLS.pull.cost);
  assert.equal(game.player.pull.target, crate);
  assert.equal(crate.state, 'slide');
  run(game, 30);
  assert.deepEqual(crate.pos, [4, 0, 3]);
  assert.equal(crate.state, 'rest');
  assert.equal(game.player.pull, null, 'the beam is over');
});

test('the line runs over holes, a crate pulled onto one plugs it', () => {
  const game = gameWith({ holes: [{ at: [3, 3] }], objects: [{ id: 'box', type: 'crate', at: [4, 0, 3] }] });
  const [crate] = game.objects;
  assert.deepEqual(eventTypes(cast(game)), ['pull', 'cast']);
  assert.ok(eventTypes(run(game, 40)).includes('plug'));
  assert.equal(crate.state, 'plugged');
  assert.equal(game.grid.isHole(3.5, 3.5), false);
});

test('nothing to pull fizzles and costs nothing: right in front, behind a block, out of range, loaded', () => {
  const cases = [
    { objects: [{ id: 'box', type: 'crate', at: [2, 0, 3] }] },
    { blocks: [{ at: [3, 0, 3] }], objects: [{ id: 'box', type: 'crate', at: [5, 0, 3] }] },
    { objects: [{ id: 'box', type: 'crate', at: [2 + SPELLS.pull.range, 0, 3] }] },
    { objects: [{ id: 'box', type: 'crate', at: [5, 0, 3] }, { id: 'top', type: 'crate', at: [5, 1, 3] }] },
    { objects: [{ id: 'box', type: 'crate', at: [1, 0, 3] }] },
  ];
  for (const props of cases) {
    const game = gameWith(props);
    assert.deepEqual(eventTypes(cast(game)), ['fizzle'], JSON.stringify(props));
    assert.equal(game.player.energy, PLAYER.maxEnergy);
    assert.ok(game.objects.every((object) => object.state === 'rest'));
  }
  // The farthest cell in range still counts.
  const far = gameWith({ objects: [{ id: 'box', type: 'crate', at: [1 + SPELLS.pull.range, 0, 3] }] });
  assert.deepEqual(eventTypes(cast(far)), ['pull', 'cast']);
});

test('the line runs at his feet: a crate on a ledge above is out of line, an enemy in line is taken', () => {
  const game = gameWith({ blocks: [{ at: [4, 0, 3] }], objects: [{ id: 'up', type: 'crate', at: [4, 1, 3] }] });
  assert.equal(pullTarget(game, SPELLS.pull.range), null, 'the ledge is in the way');
  const other = gameWith({ enemies: [{ id: 'b', template: 'still', at: [6, 0, 3] }], objects: [{ id: 'box', type: 'crate', at: [8, 0, 3] }] });
  const found = pullTarget(other, SPELLS.pull.range);
  assert.equal(found.enemy, other.enemies[0], 'the first thing in line');
  assert.deepEqual([found.cell, found.dir, found.distance], [[6, 0, 3], [-1, 0], 5]);
});

test('Pull drags an enemy a cell towards him and he gets the blame (D81)', () => {
  const game = gameWith({ enemies: [{ id: 'b', template: 'still', at: [5, 0, 3] }] });
  const [bug] = game.enemies;
  const events = cast(game);
  assert.deepEqual(eventTypes(events), ['alert', 'pull', 'cast']);
  assert.equal(events[1].enemy, bug);
  assert.equal(bug.state, 'walk');
  run(game, 30);
  assert.deepEqual(bug.pos, [4, 0, 3]);
  assert.equal(bug.state, 'rest');
  assert.equal(bug.pulled, null);
  assert.deepEqual(bug.lastSeen, [1, 3], 'it looks for him');
});

test('an enemy pulled over a hole drops in and pops', () => {
  const game = gameWith({ holes: [{ at: [4, 3] }], enemies: [{ id: 'b', template: 'still', at: [5, 0, 3] }] });
  const [bug] = game.enemies;
  cast(game);
  const events = run(game, 60);
  assert.ok(eventTypes(events).includes('pop'));
  assert.equal(bug.deathCause, 'hole');
});

test('a frozen enemy is pulled too and stays frozen', () => {
  const game = gameWith({ enemies: [{ id: 'b', template: 'still', at: [5, 0, 3] }] });
  const [bug] = game.enemies;
  pauseEnemy(game, bug, 300);
  assert.ok(eventTypes(cast(game)).includes('pull'));
  run(game, 30);
  assert.deepEqual(bug.pos, [4, 0, 3]);
  assert.ok(bug.frozen);
});

test('an enemy mid-step is pulled from the nearer of its two cells', () => {
  const game = gameWith({ enemies: [{ id: 'b', template: 'bug', at: [8, 0, 3], path: { points: [[8, 0, 6]] } }] });
  const [bug] = game.enemies;
  while (!(bug.state === 'walk' && bug.walked > 0.6)) game.update(idle);
  assert.deepEqual(bug.target, [8, 0, 4]);
  aim(game, [8.5, 0, 7.5], Math.PI); // facing −z, down its path
  assert.ok(bug.pull([0, 1], game));
  assert.deepEqual(bug.target, [8, 0, 5]);
  while (bug.pulled) game.update(idle);
  assert.deepEqual(bug.pos, [8, 0, 5]);
});

test('an enemy stopped on its way is dragged back to its cell; one against him, a body or the side stays', () => {
  const game = gameWith({ enemies: [{ id: 'b', template: 'still', at: [5, 0, 3] }] });
  const [bug] = game.enemies;
  assert.ok(bug.pull([-1, 0], game));
  // Something appears in the cell it is pulled into.
  const blocker = { box: () => [[4, 5], [0, 1], [3, 4]] };
  game.obstacles.push(blocker);
  run(game, 40);
  assert.deepEqual(bug.pos, [5, 0, 3], 'back where it was pulled from');
  assert.equal(bug.state, 'rest');
  assert.equal(bug.pulled, null);
  assert.equal(bug.pull([-1, 0], game), false, 'the cell is taken');
  game.obstacles.pop();
  aim(game, [4.5, 0, 3.5], Math.PI / 2);
  assert.equal(bug.pull([-1, 0], game), false, 'he stands there');
  const edge = gameWith({ enemies: [{ id: 'e', template: 'still', at: [11, 0, 3] }] });
  assert.equal(edge.enemies[0].pull([1, 0], edge), false, 'the room side');
});

test('the beam: rings leave the target, shrink into his hands and stop with the beam', () => {
  const target = [4.5, 0.5, 3.5];
  const hands = [1.8, 0.7, 3.5];
  assert.equal(pullPixels(0, target, hands).length, PULL_PIXELS);
  const first = pullPixels(0, target, hands).filter((p) => p.scale > 0);
  assert.equal(first.length, 8, 'one ring at the start');
  const middle = first.reduce((sum, p) => sum.map((v, i) => v + p.offset[i] / 8), [0, 0, 0]);
  assert.ok(middle.every((v, i) => Math.abs(v - target[i]) < 1e-9), 'round the target');
  assert.ok(first.every((p) => Math.abs(p.offset[0] - target[0]) < 1e-9), 'standing across the beam (along x here)');
  const busy = pullPixels(PULL_FX.travelTicks - 1, target, hands).filter((p) => p.scale > 0);
  assert.ok(busy.length > 8, 'several rings on the way');
  assert.ok(pullPixels(PLAYER.pullTicks, target, hands).every((p) => p.scale === 0), 'none after the beam');
  assert.ok(pullMarquee(0) > 1 && pullMarquee(PULL_FX.snapTicks) === 1);
  assert.equal(pullMarquee(PLAYER.pullTicks), null);
});
