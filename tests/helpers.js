/**
 * Shared test fixtures: small data files and games, fake input, grids.
 * Not a test file itself (node --test only picks up *.test.js here).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import STRINGS from '../data/strings.json' with { type: 'json' };
import { formatJson } from '../src/editor/format-json.js';
import { loadGameData } from '../src/data/load.js';
import { resolveBlockTypes } from '../src/data/room-data.js';
import { Grid } from '../src/world/grid.js';

/** A plain pushable crate type. */
export const CRATE = { kind: 'pushable', color: '#b6ff3c' };

/** A moving platform type (its path is on the room object). */
export const LIFT = { kind: 'platform', color: '#00f0ff' };

/** The central core (D101), as in defs.json. */
export const CORE = { kind: 'core', color: '#eef3ff' };

/** A bug enemy template, as in defs.json (3 units per second: 20 ticks per cell). */
export const BUG = {
  look: 'bug',
  movement: 'patrol',
  attack: 'touch',
  hostility: 'hostile',
  aggroRange: 0,
  integrity: 2,
  damage: 1,
  speed: 3,
  bounce: true,
  solid: false,
  color: '#2bff88',
};

/**
 * A virus enemy template, as in defs.json but chasing at 3 units per second (20
 * ticks per cell): a burst (range 1.2, 24 ticks of charge, 90 of
 * cooldown).
 */
export const VIRUS = {
  look: 'virus',
  movement: 'chase',
  attack: 'burst',
  hostility: 'hostile',
  aggroRange: 5,
  integrity: 2,
  damage: 1,
  speed: 2,
  chaseSpeed: 3,
  color: '#ffe23a',
  attackRange: 1.2,
  attackCharge: 0.4,
  attackCooldown: 1.5,
};

/**
 * A sentinel enemy template, as in defs.json but chasing at 3 units per second
 * (20 ticks per cell): an arc (range 5, 42 ticks of charge).
 */
export const SENTINEL = {
  look: 'sentinel',
  movement: 'chase',
  attack: 'arc',
  hostility: 'hostile',
  aggroRange: 7,
  integrity: 3,
  damage: 1,
  speed: 1.5,
  chaseSpeed: 3,
  color: '#ff8a1a',
  attackRange: 5,
  attackCharge: 0.7,
  attackCooldown: 2,
};

/** Spell tuning, as in defs.json. */
export const SPELLS = {
  zap: { slot: 0, color: '#00f0ff', cost: 10, cooldown: 0.25, speed: 12, damage: 1 },
  shield: { slot: 1, color: '#3b82ff', cost: 20, cooldown: 0.25, duration: 7 },
  firewall: { slot: 2, color: '#ff5a14', cost: 40, cooldown: 0.25, duration: 7, damage: 1, burnInterval: 0.5 },
  pause: { slot: 3, color: '#c9a2ff', cost: 25, cooldown: 0.25, speed: 10, duration: 5 },
  blink: { slot: 4, color: '#9ef0ff', cost: 15, cooldown: 0.25, range: 3, damage: 1, hitDamage: 2 },
  warp: { slot: 5, color: '#ff6ee8', cost: 30, cooldown: 0.25 },
  cut_paste: { slot: 6, color: '#f4f6ff', cost: 20, pasteCost: 0, cooldown: 0.25 },
  compile: { slot: 7, color: '#ffe45c', cost: 50, cooldown: 0.25, duration: 7, object: 'crate' },
  fork: { slot: 8, color: '#4d8bff', cost: 25, cooldown: 0.25, duration: 10 },
  scan: { slot: 9, color: '#8f6bff', cost: 15, cooldown: 0.25, range: 6 },
  pull: { slot: 10, color: '#a6ffcf', cost: 15, cooldown: 0.25, range: 6 },
};

/**
 * Pickup types (D71): the data disks, both refills, the level 3 access pass, a buff of each stat
 * (D93), the three upgrades (D95) and two secrets (D100), as in defs.json.
 * The integrity refill gives 2 here (3 in defs.json); the tests read its amount from here.
 */
export const PICKUPS = {
  disk_zap: { kind: 'disk', spell: 'zap' },
  disk_shield: { kind: 'disk', spell: 'shield' },
  disk_firewall: { kind: 'disk', spell: 'firewall' },
  disk_pause: { kind: 'disk', spell: 'pause' },
  disk_blink: { kind: 'disk', spell: 'blink' },
  disk_warp: { kind: 'disk', spell: 'warp' },
  disk_cut_paste: { kind: 'disk', spell: 'cut_paste' },
  disk_compile: { kind: 'disk', spell: 'compile' },
  disk_pull: { kind: 'disk', spell: 'pull' },
  disk_fork: { kind: 'disk', spell: 'fork' },
  disk_scan: { kind: 'disk', spell: 'scan' },
  refill_integrity: { kind: 'refill', stat: 'integrity', amount: 2 },
  refill_energy: { kind: 'refill', stat: 'energy', amount: 30 },
  access_pass_3: { kind: 'access', level: 3 },
  buff_integrity_1: { kind: 'buff', slot: 0, stat: 'integrity', amount: 1 },
  buff_integrity_2: { kind: 'buff', slot: 1, stat: 'integrity', amount: 1 },
  buff_energy_1: { kind: 'buff', slot: 4, stat: 'energy', amount: 10 },
  buff_recharge: { kind: 'buff', slot: 9, stat: 'recharge', amount: 4 },
  upgrade_zap_plus: { kind: 'upgrade', upgrade: 'zap_plus', slot: 0, spell: 'zap', color: '#00f0ff', bounces: 3 },
  upgrade_shield_plus: { kind: 'upgrade', upgrade: 'shield_plus', slot: 1, spell: 'shield', color: '#cfe8ff' },
  upgrade_double_jump: { kind: 'upgrade', upgrade: 'double_jump', slot: 2, color: '#ff2bd6' },
  secret_0: { kind: 'secret', slot: 0 },
  secret_1: { kind: 'secret', slot: 1 },
  fragment_0: { kind: 'fragment', slot: 0 },
  fragment_1: { kind: 'fragment', slot: 1 },
  fragment_2: { kind: 'fragment', slot: 2 },
  fragment_3: { kind: 'fragment', slot: 3 },
};

/** Score values (D100), as in defs.json. */
export const SCORE = { bit: 50, secret: 200, accessLevel: 500 };

/**
 * Block types, as in defs.json (D60): plain, hazard, void, fake (D128),
 * gates (D141): collapsing (a step gate) and a variant that grows back
 * after 3 s, a switch gate and a bridge.
 */
export const BLOCK_TYPES = {
  block: { look: 'plain' },
  hazard: { look: 'hazard', color: '#ff3b30', damage: 1 },
  void: { look: 'void', color: '#8a5cff', lethal: true },
  fake: { look: 'plain', fake: true },
  collapsing: { kind: 'gate', trigger: 'step' },
  collapsing_regrow: { extends: 'collapsing', regrow: 3 },
  gate: { kind: 'gate', color: '#eef3ff' },
  bridge: { extends: 'gate', start: 'gone' },
};

/**
 * A room file with defaults (8×4×8, biome "home", spawn near a corner);
 * `props` overrides or adds anything.
 * @param {string} id
 * @param {object} [props]
 */
export function roomFile(id, props = {}) {
  return { schemaVersion: 1, id, name: id, biome: 'home', size: [8, 4, 8], spawn: [1.5, 0, 1.5], ...props };
}

/**
 * Data files for a small game, keyed like data/ (a fresh copy every call):
 * one biome "home", the object types, the rooms and their connections.
 * @param {object} options
 * @param {object[]} options.rooms room files (see roomFile())
 * @param {Record<string, object>} [options.objects] object types; a crate always (Compile's, D125)
 * @param {Record<string, object>} [options.enemies] enemy templates; a bug by default
 * @param {Record<string, object>} [options.blocks] block types; BLOCK_TYPES by default
 * @param {Record<string, object>} [options.pickups] pickup types; PICKUPS by default
 * @param {string[][]} [options.connections] pairs of "room.exit"
 * @param {string} [options.start] start room; the first room by default
 * @param {Record<string, number[]>} [options.positions] map cells; the rooms in a row by default
 */
export function dataFiles({
  rooms,
  objects = {},
  enemies = { bug: BUG },
  blocks = BLOCK_TYPES,
  pickups = PICKUPS,
  connections = [],
  start = rooms[0].id,
  positions = Object.fromEntries(rooms.map((room, i) => [room.id, [i, 0]])),
  fragments,
}) {
  const variants = withVariants(rooms, enemies);
  return structuredClone({
    'defs.json': { schemaVersion: 1, score: SCORE, objects: { crate: CRATE, ...objects }, enemies: variants.enemies, spells: SPELLS, pickups, blocks },
    'biomes.json': { schemaVersion: 1, biomes: { home: { name: 'Home', color: '#ffb020' } } },
    'world.json': { schemaVersion: 1, start, ...(fragments && { fragments }), connections, positions },
    'strings.json': STRINGS,
    ...Object.fromEntries(variants.rooms.map((room) => [`rooms/${room.id}.json`, room])),
  });
}

/**
 * Test rooms may give an enemy `variant` values (test fixtures only: a room
 * enemy is all its template, D119): each becomes a template of its own
 * built on the enemy's (`bug_v1`, `bug_v2`...), so a test can tweak one
 * enemy without naming a template for it.
 * @param {object[]} rooms room files
 * @param {Record<string, object>} enemies enemy templates
 * @returns {{ rooms: object[], enemies: Record<string, object> }} copies with the variants made templates
 */
export function withVariants(rooms, enemies) {
  const templates = { ...enemies };
  let n = 0;
  const out = rooms.map((room) => {
    if (!room.enemies?.some((enemy) => enemy.variant)) return room;
    const list = room.enemies.map(({ variant, ...enemy }) => {
      if (!variant) return enemy;
      const id = `${enemy.template}_v${++n}`;
      templates[id] = { extends: enemy.template, ...variant };
      return { ...enemy, template: id };
    });
    return { ...room, enemies: list };
  });
  return { rooms: out, enemies: templates };
}

/**
 * A fixed world for the map and save tools' tests, so they don't depend on
 * data/ (which the author rearranges with the world map tool). Map cells:
 *
 *                      cache_hall [0,-1]   relay_station [1,-1]
 *   crawl_space [-1,0] boot_sector [0,0]   stack_yard [1,0]       fault_line [2,0]
 *                      transit_bus [0,1]   volatile_memory [1,1]
 *
 * Every room is 12×4×12 with its exits in the middle of the walls
 * (north -z, south +z, west -x, east +x).
 */
export function testWorld() {
  const connections = [
    ['stack_yard.east', 'fault_line.west'],
    ['fault_line.east', 'transit_bus.west'],
    ['transit_bus.east', 'volatile_memory.west'],
    ['volatile_memory.east', 'crawl_space.west'],
    ['boot_sector.south', 'transit_bus.north'],
    ['cache_hall.east', 'relay_station.west'],
    ['relay_station.south', 'stack_yard.north'],
    ['boot_sector.east', 'stack_yard.west'],
    ['boot_sector.west', 'crawl_space.east'],
    ['boot_sector.north', 'cache_hall.south'],
  ];
  const positions = {
    boot_sector: [0, 0],
    cache_hall: [0, -1],
    stack_yard: [1, 0],
    fault_line: [2, 0],
    crawl_space: [-1, 0],
    transit_bus: [0, 1],
    volatile_memory: [1, 1],
    relay_station: [1, -1],
  };
  const sides = { north: '-z', south: '+z', west: '-x', east: '+x' };
  const rooms = Object.keys(positions).map((id) => {
    const exits = connections
      .flat()
      .filter((ref) => ref.startsWith(`${id}.`))
      .map((ref) => ref.slice(id.length + 1))
      .map((exit) => ({ id: exit, side: sides[exit], at: 5 }));
    return roomFile(id, { size: [12, 4, 12], exits });
  });
  return dataFiles({ rooms, connections, start: 'boot_sector', positions });
}

/** Write data files (keyed like data/) into `root`/data. */
export function writeDataFiles(root, files) {
  for (const [name, data] of Object.entries(files)) {
    const path = join(root, 'data', name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, formatJson(data));
  }
}

/** Loaded content for a small game (dataFiles() through loadGameData()). */
export function gameData(options) {
  return loadGameData(dataFiles(options));
}

/**
 * A grid for a room of `size` with the given plain block cells, hole tiles,
 * exits, and cells of other static block types (`blocks`, by type).
 */
export function grid({ size = [8, 4, 8], cells = [], holes = [], exits = [], blocks = {} } = {}) {
  return new Grid({ size, blocks: { block: cells, ...blocks }, blockTypes: resolveBlockTypes(BLOCK_TYPES), holes, exits });
}

/** Just the types of a list of game events, e.g. ['exit'], for short assertions. */
export const eventTypes = (events) => events.map((event) => event.type);

/** Fake input with nothing held. */
export const idle = { down: () => false, pressed: () => false };

/** Fake input holding the given actions every tick. */
export const hold = (...actions) => ({ down: (a) => actions.includes(a), pressed: () => false });

/**
 * Fake input: `held` actions are down every tick; `tap` is down and pressed
 * on the first tick only (call next() after each tick).
 * @param {string[]} [held]
 * @param {string[]} [tap]
 */
export function input(held = [], tap = []) {
  let first = true;
  return {
    down: (a) => held.includes(a) || (first && tap.includes(a)),
    pressed: (a) => first && tap.includes(a),
    next() {
      first = false;
    },
  };
}
