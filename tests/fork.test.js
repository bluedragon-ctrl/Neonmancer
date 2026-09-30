import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../src/data/validate.js';
import { Game } from '../src/game.js';
import { DECOY } from '../src/entities/decoy.js';
import { PLAYER } from '../src/entities/player.js';
import { Progress, saveBit } from '../src/world/progress.js';
import { BUG, CRATE, SENTINEL, SPELLS, VIRUS, dataFiles, eventTypes, gameData, idle, roomFile } from './helpers.js';

/** Fake input pressing one action this tick. */
const press = (action) => ({ down: (a) => a === action, pressed: (a) => a === action });

/** Ticks a decoy stands. */
const LIFETIME = Math.round(SPELLS.fork.duration * 60);

const TYPES = { crate: CRATE, plate: { kind: 'plate', color: '#eef3ff', edges: 'dashed' } };

/**
 * A game in a 12×4×8 room with `props`; the wizard knows Fork (selected),
 * stands at `pos` and aims along +x.
 */
function gameWith(props = {}, pos = [1.5, 0, 3.5]) {
  const rooms = [roomFile('alpha', { size: [12, 4, 8], spawn: [0.5, 0, 7.5], ...props })];
  const game = new Game(
    gameData({ rooms, objects: TYPES, enemies: { bug: BUG, virus: VIRUS, sentinel: SENTINEL } }),
    { progress: new Progress([saveBit('spells', 8)]) },
  );
  game.player.spell = 'fork';
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

test('Fork stands a decoy in the free cell in front of him for 25 energy (D129)', () => {
  const game = gameWith();
  const events = cast(game);
  assert.deepEqual(eventTypes(events), ['fork', 'cast']);
  assert.equal(game.player.energy, PLAYER.maxEnergy - SPELLS.fork.cost);
  assert.deepEqual(game.decoy.pos, [2.5, 0, 3.5]);
  assert.equal(game.decoy.active, true);
  assert.deepEqual(game.decoy.size, game.player.size);
  assert.deepEqual(events.find((e) => e.type === 'fork').cell, [2, 0, 3]);
  assert.notEqual(game.player.fork, null, 'the bits fly');
});

test('the decoy is no solid body: he walks through it, nothing pushes it', () => {
  const game = gameWith();
  cast(game);
  assert.ok(!game.bodies.includes(game.decoy));
  assert.ok(!game.solids.includes(game.decoy));
  stand(game, [2.5, 0, 3.5]);
  run(game, 5);
  assert.equal(game.player.dead, false);
  assert.deepEqual(game.decoy.pos, [2.5, 0, 3.5]);
});

test('it derezzes after its duration and leaves the room once its pixels have flown', () => {
  const game = gameWith();
  cast(game);
  run(game, LIFETIME - 5);
  assert.equal(game.decoy.active, true);
  run(game, 10);
  assert.equal(game.decoy.active, false);
  assert.notEqual(game.decoy, null, 'its pixels fly');
  run(game, DECOY.derezTicks + 2);
  assert.equal(game.decoy, null);
});

test('a new fork replaces the old one', () => {
  const game = gameWith();
  cast(game);
  const first = game.decoy;
  stand(game, [5.5, 0, 3.5]);
  cast(game);
  assert.notEqual(game.decoy, first);
  assert.deepEqual(game.decoy.pos, [6.5, 0, 3.5]);
});

test('no free cell: it fizzles and costs nothing', () => {
  const game = gameWith({ blocks: [{ at: [2, 0, 3] }] });
  const events = cast(game);
  assert.deepEqual(eventTypes(events), ['fizzle']);
  assert.equal(game.decoy, null);
  assert.equal(game.player.energy, PLAYER.maxEnergy);
});

test('a decoy cast over the edge of a ledge falls to the floor; over a hole it pops', () => {
  const ledge = gameWith({ blocks: [{ at: [0, 0, 0] }] }, [1.5, 1, 3.5]);
  ledge.grid.setCell?.call;
  const game = gameWith({ holes: [{ at: [2, 3] }] });
  cast(game);
  run(game, 3);
  assert.equal(game.decoy.active, false);
  assert.ok(ledge);
});

test('it holds a floor plate down like a body standing on it', () => {
  const game = gameWith({ objects: [{ id: 'p', type: 'plate', at: [2, 0, 3] }] });
  const [plate] = game.switches;
  assert.equal(plate.on, false);
  cast(game);
  run(game, 2);
  assert.equal(plate.on, true);
  run(game, LIFETIME);
  assert.equal(plate.on, false, 'off again once it derezzed');
});

test('a hostile enemy that sees only the decoy goes for it', () => {
  const game = gameWith({ enemies: [{ id: 'v', template: 'virus', at: [5, 0, 1] }] }, [1.5, 0, 7.5]);
  const [virus] = game.enemies;
  // The wizard hides behind the room's far wall of sight: out of its range.
  assert.equal(virus.sense(game), false);
  assert.equal(virus.sees, false);
  stand(game, [1.5, 0, 1.5]);
  cast(game);
  stand(game, [1.5, 0, 7.5]);
  game.update(idle);
  assert.equal(virus.sees, true);
  assert.equal(virus.focus, game.decoy);
  assert.deepEqual(virus.lastSeen, [2, 1]);
});

test('an enemy that sees both goes for the nearer; the decoy wins a tie', () => {
  const game = gameWith({ enemies: [{ id: 'v', template: 'virus', at: [3, 0, 3], variant: { movement: 'stationary', attack: 'none' } }] }, [2.5, 0, 3.5]);
  const [virus] = game.enemies;
  stand(game, [1.5, 0, 3.5]);
  cast(game); // decoy at [2.5, 0, 3.5]; the virus at x 3.5 is 0.5 from its box
  stand(game, [5.5, 0, 3.5]);
  game.update(idle);
  assert.equal(virus.focus, game.decoy, 'the decoy is nearer');
  stand(game, [3.5, 0, 3.5]);
  game.update(idle);
  assert.equal(virus.focus, game.player, 'he is right next to it, the decoy 0.5 away');
});

test('an enemy no longer goes for it once it has derezzed', () => {
  const game = gameWith({ enemies: [{ id: 'v', template: 'virus', at: [5, 0, 1] }] }, [1.5, 0, 1.5]);
  const [virus] = game.enemies;
  cast(game);
  stand(game, [1.5, 0, 7.5]);
  game.update(idle);
  assert.equal(virus.focus, game.decoy);
  run(game, LIFETIME);
  assert.equal(virus.sees, false);
  assert.equal(virus.focus, null);
});

test('a sentinel aims its arc at the decoy, and the decoy takes no harm', () => {
  const game = gameWith({ enemies: [{ id: 's', template: 'sentinel', at: [6, 0, 3] }] }, [1.5, 0, 3.5]);
  const [sentinel] = game.enemies;
  cast(game);
  stand(game, [1.5, 0, 7.5]); // out of its sight
  const events = run(game, 120);
  assert.ok(events.some((e) => e.type === 'discharge'), 'it fired at the decoy');
  assert.equal(game.player.integrity, game.player.maxIntegrity);
  assert.equal(game.decoy.active, true);
  assert.ok(sentinel.alive);
});

test('data: Fork needs a duration; its disk is known', () => {
  const files = dataFiles({ rooms: [roomFile('a')] });
  assert.deepEqual(validateData(files), []);
  assert.ok(files['defs.json'].spells.fork);
  assert.ok(Object.values(files['defs.json'].pickups).some((pickup) => pickup.spell === 'fork'));
});
