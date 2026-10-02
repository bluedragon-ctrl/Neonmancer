import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { hitEnemy } from '../src/combat.js';
import { bossPhases, withEnemyDefaults } from '../src/data/room-data.js';
import { validateData } from '../src/data/validate.js';
import { BOSS, ENEMY } from '../src/entities/enemy.js';
import { PICKUP } from '../src/entities/pickup.js';
import { Game } from '../src/game.js';
import { ARMOR_SHELL, BOSS_MARK, armorShellLook, bodyScale, bossMarkSize, teleportLook } from '../src/render/boss-mark.js';
import { dropHeight } from '../src/render/pickup-view.js';
import { BOSS_BAR_LINGER, bossBarState } from '../src/ui/boss-bar.js';
import { buildRoom } from '../src/world/room.js';
import { loadGameData } from '../src/data/load.js';
import { BUG, dataFiles, eventTypes, gameData, idle, roomFile } from './helpers.js';

/**
 * A boss that stands still and never attacks, awake as soon as it sees the
 * wizard; it teleports every second, every half second below half its
 * integrity (then it walks faster too).
 */
const WARDEN = {
  look: 'bug',
  movement: 'stationary',
  attack: 'none',
  hostility: 'hostile',
  aggroRange: 16,
  integrity: 20,
  damage: 1,
  speed: 1,
  color: '#ff73c0',
  boss: {
    phases: [
      { from: 1, teleport: 1 },
      { from: 0.5, teleport: 0.5, speed: 2 },
    ],
  },
};

/** A boss two cubes high in plate armor (D135), which never moves nor attacks. */
const GATEKEEPER = {
  look: 'virus',
  movement: 'stationary',
  attack: 'none',
  hostility: 'hostile',
  aggroRange: 16,
  integrity: 4,
  damage: 1,
  speed: 1,
  color: '#d9ff5c',
  height: 1.6,
  boss: { armor: 'plate', phases: [{ from: 1 }] },
};

const TEMPLATES = { bug: BUG, warden: WARDEN, gatekeeper: GATEKEEPER };

/** The arena: 8×4×8, a boss in the middle holding fragment 0, an open exit east to a hall. */
function arena({ boss = { id: 'boss', template: 'warden', at: [4, 0, 4], drop: 'frag' }, objects = [], blocks = [], ...props } = {}) {
  return dataFiles({
    rooms: [
      roomFile('arena', {
        spawn: [0.5, 0, 0.5],
        exits: [{ id: 'east', side: '+x', at: 3 }],
        enemies: [boss],
        pickups: [{ id: 'frag', type: 'fragment_0', at: [2, 0, 6] }],
        objects,
        blocks,
        ...props,
      }),
      roomFile('hall', { exits: [{ id: 'west', side: '-x', at: 3 }] }),
    ],
    objects: { plate: { kind: 'plate', color: '#eef3ff' } },
    enemies: TEMPLATES,
    connections: [['arena.east', 'hall.west']],
  });
}

function gameIn(files) {
  return new Game(loadGameData(files));
}

/** Run the game for `ticks` ticks; returns every event. */
function run(game, ticks) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...game.update(idle));
  return events;
}

/** Hit the boss until it has `left` integrity; returns the events. */
function hitDown(game, left) {
  const { boss } = game;
  const events = [];
  game.emit = (type, details) => events.push({ type, ...details });
  while (boss.integrity > left) hitEnemy(game, boss, 1, 'zap');
  delete game.emit;
  return events;
}

// ---- data

test('a boss phase changes only what it names; a template without a boss block has one phase', () => {
  const values = withEnemyDefaults(WARDEN);
  const phases = bossPhases(values);
  assert.equal(phases.length, 2);
  assert.equal(phases[0].teleport, 1);
  assert.equal(phases[1].speed, 2);
  assert.equal(phases[1].look, 'bug', 'the rest is the template');
  assert.equal('from' in phases[1], false);
  assert.equal(bossPhases(withEnemyDefaults(BUG)).length, 1);
});

test('the shipped data is valid with its bosses and test arenas', () => {
  assert.deepEqual(validateData(arena()), []);
});

test('boss one, Null Pointer: a bolt-shooting bug that teleports faster each phase and drops fragment 7 (D136)', () => {
  const defs = JSON.parse(readFileSync('data/defs.json', 'utf8')).enemies.null_pointer;
  const strings = JSON.parse(readFileSync('data/strings.json', 'utf8')).strings;
  const room = JSON.parse(readFileSync('data/rooms/boss_arena.json', 'utf8'));
  assert.equal(strings['boss.null_pointer'], 'NULL POINTER');
  assert.equal(defs.look, 'bug');
  assert.equal(defs.attack, 'bolt');
  assert.equal(defs.pausable, false);
  const teleports = defs.boss.phases.map((phase) => phase.teleport);
  assert.ok(teleports.every((t, i) => i === 0 || t < teleports[i - 1]), 'teleports more often as it weakens');
  assert.deepEqual(room.enemies.map((e) => [e.template, e.drop]), [['null_pointer', 'fragment_7']]);
  assert.equal(room.pickups.find((p) => p.id === 'fragment_7').type, 'fragment_7');
  assert.equal(room.shrine, undefined, 'no shrine with a boss (D104)');
});

test('boss two, the Gatekeeper: a tall armored chaser, harder than boss one, drops the energy buff (D137)', () => {
  const enemies = JSON.parse(readFileSync('data/defs.json', 'utf8')).enemies;
  const gate = enemies.gatekeeper;
  const room = JSON.parse(readFileSync('data/rooms/boss_plates.json', 'utf8'));
  assert.equal(JSON.parse(readFileSync('data/strings.json', 'utf8')).strings['boss.gatekeeper'], 'THE GATEKEEPER');
  assert.equal(gate.boss.armor, 'plate');
  assert.equal(gate.height, 1.6);
  assert.ok(gate.integrity > enemies.null_pointer.integrity * 0.5 && gate.boss.phases.length >= 3);
  assert.deepEqual(room.enemies.map((e) => [e.template, e.drop]), [['gatekeeper', 'buff_energy_2']]);
  assert.ok(room.objects.filter((o) => o.type === 'plate').length >= 2, 'plates to lure it over');
});

test('validation: a boss drops a permanent pickup of its room, and only a boss drops one', () => {
  const errors = (files) => validateData(files).join('\n');
  assert.match(errors(arena({ boss: { id: 'boss', template: 'warden', at: [4, 0, 4] } })), /a boss drops a permanent pickup/);
  assert.match(errors(arena({ boss: { id: 'boss', template: 'warden', at: [4, 0, 4], drop: 'none' } })), /no pickup "none"/);
  const refill = arena();
  refill['rooms/arena.json'].pickups.push({ id: 'heal', type: 'refill_integrity', at: [1, 0, 6] });
  refill['rooms/arena.json'].enemies[0].drop = 'heal';
  assert.match(errors(refill), /"heal" is a refill: a boss drops a permanent pickup/);
  const bug = arena();
  bug['rooms/arena.json'].enemies.push({ id: 'b', template: 'bug', at: [1, 0, 1], path: { points: [[1, 0, 1], [1, 0, 3]] }, drop: 'frag' });
  assert.match(errors(bug), /only a boss drops a pickup/);
});

test('validation: one boss a room, no shrine with it, the cell above a tall one free', () => {
  const errors = (files) => validateData(files).join('\n');
  const two = arena();
  two['rooms/arena.json'].pickups.push({ id: 'frag_1', type: 'fragment_1', at: [1, 0, 6] });
  two['rooms/arena.json'].enemies.push({ id: 'boss_2', template: 'warden', at: [5, 0, 5], drop: 'frag_1' });
  assert.match(errors(two), /at most one boss in a room/);
  assert.match(errors(arena({ shrine: [1, 1] })), /no shrine in a boss room/);
  const tall = { id: 'boss', template: 'gatekeeper', at: [4, 0, 4], drop: 'frag' };
  assert.deepEqual(validateData(arena({ boss: tall })), []);
  assert.match(errors(arena({ boss: tall, blocks: [{ at: [4, 1, 4] }] })), /the cell above, \[4,1,4\], is filled/);
});

test('validation: a boss is hostile, its phases start at 1 and go down; only a boss takes more than 15', () => {
  const check = (template) => {
    const files = arena();
    files['defs.json'].enemies.warden = template;
    return validateData(files).join('\n');
  };
  assert.match(check({ ...WARDEN, hostility: 'provoked' }), /a boss is hostile/);
  assert.match(check({ ...WARDEN, boss: { phases: [{ from: 0.9 }] } }), /"from" 1/);
  assert.match(check({ ...WARDEN, boss: { phases: [{ from: 1 }, { from: 0.5 }, { from: 0.6 }] } }), /lower than the phase before/);
  assert.match(check({ ...WARDEN, boss: { phases: [{ from: 1 }, { from: 0.01 }] } }), /never comes/);
  assert.match(check({ ...WARDEN, boss: { phases: [{ from: 1 }, { from: 0.5, movement: 'chase', aggroRange: 0 }] } }), /phases\[1\]: a chaser needs an aggroRange/);
  assert.equal(check({ ...WARDEN, integrity: 40 }), '');
  const files = arena();
  files['defs.json'].enemies.bug = { ...BUG, integrity: 16 };
  assert.match(validateData(files).join('\n'), /only a boss takes more/);
});

test('a room gives its boss the pickup it drops', () => {
  const content = loadGameData(arena());
  const room = buildRoom(content.rooms.get('arena'), content);
  assert.equal(room.enemies[0].drop, 'frag');
  assert.equal(room.enemies[0].boss.phases.length, 2);
});

// ---- the fight

test('a boss wakes when it sees the wizard (or is hit) and shows its bar from then on', () => {
  const game = gameIn(arena({ blocks: [{ at: [3, 0, 0], to: [3, 1, 7] }] }));
  const { boss } = game;
  run(game, 5);
  assert.equal(boss.awake, false, 'a wall between them');
  assert.equal(bossBarState(game), null);
  hitEnemy(game, boss, 1, 'zap');
  assert.equal(boss.awake, true);
  const bar = bossBarState(game);
  assert.equal(bar.name, 'WARDEN');
  assert.equal(bar.share, 19 / 20);
  assert.deepEqual(bar.phases, [0.5]);
  assert.equal(bar.armored, false);
});

test('a boss moves on to the next phase once its integrity is down to its share', () => {
  const game = gameIn(arena());
  const { boss } = game;
  assert.equal(boss.maxIntegrity, 20);
  assert.equal(eventTypes(hitDown(game, 11)).includes('phase'), false);
  assert.equal(boss.phase, 0);
  const events = hitDown(game, 10);
  assert.deepEqual(eventTypes(events), ['hit', 'phase', 'alert']);
  assert.equal(boss.phase, 1);
  assert.equal(boss.data.speed, 2);
  assert.equal(boss.teleportTicks, 30);
});

test('Pause never freezes a boss, Pull never drags one', () => {
  const game = gameIn(arena());
  const { boss } = game;
  assert.equal(boss.freeze(300), null);
  assert.equal(boss.frozen, null);
  assert.equal(boss.pull([-1, 0], game), false);
});

test('an awake boss teleports to a free cell of its floor, away from the wizard, the same way every time', () => {
  const cells = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const game = gameIn(arena());
    game.player.place([1.5, 0, 1.5]);
    const events = run(game, 120);
    const jump = events.find((event) => event.type === 'teleport');
    assert.ok(jump, 'it teleported');
    const { boss } = game;
    const to = boss.warp?.to ?? boss.pos;
    assert.deepEqual(jump.enemy.warp?.from ?? [4, 0, 4], [4, 0, 4]);
    assert.equal(to[1], 0);
    assert.ok(Math.hypot(to[0] + 0.5 - 1.5, to[2] + 0.5 - 1.5) >= BOSS.teleportClear - 0.5, `away from him: ${to}`);
    cells.push(boss.pos.join());
  }
  assert.equal(cells[0], cells[1], 'its own seeded dice');
});

test('a teleport flickers out, jumps half way through and flickers in', () => {
  const game = gameIn(arena());
  const { boss } = game;
  boss.wake();
  boss.warp = { tick: 0, to: [6, 0, 1], from: null };
  run(game, BOSS.teleportTicks / 2 - 1);
  assert.deepEqual(boss.pos, [4, 0, 4]);
  assert.deepEqual(eventTypes(run(game, 1)), ['teleport']);
  assert.deepEqual(boss.pos, [6, 0, 1]);
  assert.deepEqual(boss.prev, [6, 0, 1], 'no slide across the room');
  run(game, BOSS.teleportTicks / 2);
  assert.equal(boss.warp, null);
  assert.deepEqual(teleportLook(null, 30), { width: 1, height: 1, visible: true });
  assert.equal(teleportLook(15, 30).visible, false, 'gone at the turn');
  assert.equal(teleportLook(0, 30).width, 1);
});

test('plate armor turns hits away unless the boss stands on a plate', () => {
  const plate = { id: 'plate', type: 'plate', at: [4, 0, 4] };
  const off = gameIn(arena({ boss: { id: 'boss', template: 'gatekeeper', at: [5, 0, 5], drop: 'frag' }, objects: [plate] }));
  run(off, 1);
  assert.equal(off.boss.exposed, false);
  assert.deepEqual(eventTypes(hitDown(off, 4).concat(callHit(off))).slice(0, 1), ['armor']);
  assert.equal(off.boss.integrity, 4);
  assert.equal(bossBarState(off).armored, true);

  const on = gameIn(arena({ boss: { id: 'boss', template: 'gatekeeper', at: [4, 0, 4], drop: 'frag' }, objects: [plate] }));
  assert.ok(eventTypes(run(on, 1)).includes('exposed'));
  assert.equal(on.boss.exposed, true);
  assert.equal(callHit(on)[0].type, 'hit');
  assert.equal(on.boss.integrity, 3);
});

/** One hit of 1 on the boss; returns its events. */
function callHit(game) {
  const events = [];
  game.emit = (type, details) => events.push({ type, ...details });
  hitEnemy(game, game.boss, 1, 'zap');
  delete game.emit;
  return events;
}

test('a tall boss stands two cubes high, its eyes and mark as far up', () => {
  const game = gameIn(arena({ boss: { id: 'boss', template: 'gatekeeper', at: [4, 0, 4], drop: 'frag' } }));
  const { boss } = game;
  assert.deepEqual(boss.box()[1], [0, 1.6]);
  assert.ok(Math.abs(boss.eyeHeight - (ENEMY.eyeHeight * 1.6) / 0.6) < 1e-9);
  assert.equal(bossMarkSize(1.6).y, 0.8);
  assert.ok(bossMarkSize(1.6).radius > bossMarkSize(0.6).radius);
  assert.equal(bodyScale(0.6), 1);
  assert.equal(bodyScale(1.6), BOSS_MARK.maxScale, 'kept within its cell');
});

test('plate armor shows as a shell round the boss: it holds shut, and lifts and grows away as it opens', () => {
  assert.deepEqual(armorShellLook(0), { lift: 0, grow: 1 });
  assert.deepEqual(armorShellLook(1), { lift: ARMOR_SHELL.lift, grow: 1 + ARMOR_SHELL.grow });
});

// ---- the drop and the defeated bit (D104)

test('a boss holds its drop; beaten, it lets it fall, and stays away once it is found', () => {
  const game = gameIn(arena());
  const { boss } = game;
  const pickup = game.pickups.find((one) => one.data.id === 'frag');
  assert.equal(pickup.state, 'held');
  assert.equal(pickup.takeable, false);

  hitDown(game, 0);
  const events = run(game, 1);
  assert.ok(eventTypes(events).includes('drop'));
  assert.equal(pickup.state, 'idle');
  assert.equal(pickup.takeable, false, 'still falling');
  run(game, PICKUP.dropTicks);
  assert.equal(pickup.takeable, true);
  assert.equal(eventTypes(run(game, 5)).includes('drop'), false, 'once');

  // Taken, the boss stays away: the room has none, its exit stays open.
  game.player.place([2.5, 0, 6.5]);
  run(game, 2);
  assert.equal(pickup.state, 'taken');
  game.enterRoom('arena');
  assert.equal(game.boss, null);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.pickups[0].state, 'ghost');
});

test('the boss bar lingers a moment after the boss is beaten, then goes', () => {
  const game = gameIn(arena());
  hitDown(game, 0);
  assert.equal(bossBarState(game).share, 0);
  run(game, BOSS_BAR_LINGER);
  assert.equal(bossBarState(game), null);
});

test('a boss\'s drop falls into its cell and rests there', () => {
  assert.ok(dropHeight(0) > 1);
  assert.ok(dropHeight(PICKUP.dropTicks / 2) < dropHeight(0));
  assert.equal(dropHeight(PICKUP.dropTicks), 0);
  assert.equal(dropHeight(1000), 0);
});

test('an arena never locks its doors: a locked exit there still needs a switch, like anywhere (D135)', () => {
  const files = arena();
  files['rooms/arena.json'].exits[0].requires = [{ switch: '*' }];
  assert.match(validateData(files).join('\n'), /a switch lock needs a switch in the room/);
  const game = gameIn(arena());
  assert.deepEqual(game.locks, [], 'its doors are open while the boss lives');
});

test('the room editor gives a boss its drop; a template that is no boss takes it away', async () => {
  const { RoomEdit } = await import('../src/editor/room-edit.js');
  const edit = new RoomEdit(structuredClone(arena()['rooms/arena.json']));
  assert.equal(edit.setDrop('boss', null), true);
  assert.equal(edit.item('boss').drop, undefined);
  assert.equal(edit.setDrop('boss', 'frag'), true);
  assert.equal(edit.item('boss').drop, 'frag');
  const id = edit.setEnemy('boss', 'bug', true, false);
  assert.equal(edit.item(id).drop, undefined);
});
