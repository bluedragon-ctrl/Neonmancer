/**
 * Shared test fixtures: small data files and games, fake input, grids.
 * Not a test file itself (node --test only picks up *.test.js here).
 */
import STRINGS from '../data/strings.json' with { type: 'json' };
import { loadGameData } from '../src/data/load.js';
import { resolveBlockTypes } from '../src/data/room-data.js';
import { Grid } from '../src/world/grid.js';

/** A plain pushable crate type. */
export const CRATE = { kind: 'pushable', color: '#b6ff3c' };

/** A moving platform type (its path is on the room object). */
export const LIFT = { kind: 'platform', color: '#00f0ff' };

/** A bug enemy type, as in defs.json (3 units per second: 20 ticks per cell). */
export const BUG = {
  movement: 'patrol',
  attack: 'contact',
  hostility: 'hostile',
  aggroRange: 0,
  integrity: 2,
  damage: 1,
  speed: 3,
  bounce: true,
  solid: false,
  color: '#2bff88',
};

/** Spell tuning, as in defs.json. */
export const SPELLS = { zap: { slot: 0, cost: 10, cooldown: 0.25, speed: 12, damage: 1 } };

/** Pickup types (D71): the Zap disk and both refills. */
export const PICKUPS = {
  disk_zap: { kind: 'disk', spell: 'zap' },
  refill_integrity: { kind: 'refill', stat: 'integrity', amount: 2 },
  refill_energy: { kind: 'refill', stat: 'energy', amount: 30 },
};

/** Block types, as in defs.json (D60): plain, hazard, void, collapsing and a variant that grows back after 3 s. */
export const BLOCK_TYPES = {
  block: { look: 'plain' },
  hazard: { look: 'hazard', color: '#ff3b30', damage: 1 },
  void: { look: 'void', color: '#8a5cff', lethal: true },
  collapsing: { kind: 'collapsing', color: '#ff2bd6' },
  collapsing_regrow: { extends: 'collapsing', regrow: 3 },
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
 * @param {Record<string, object>} [options.objects] object types; a crate by default
 * @param {Record<string, object>} [options.enemies] enemy types; a bug by default
 * @param {Record<string, object>} [options.blocks] block types; BLOCK_TYPES by default
 * @param {Record<string, object>} [options.pickups] pickup types; PICKUPS by default
 * @param {string[][]} [options.connections] pairs of "room.exit"
 * @param {string} [options.start] start room; the first room by default
 * @param {Record<string, number[]>} [options.positions] map cells; the rooms in a row by default
 */
export function dataFiles({
  rooms,
  objects = { crate: CRATE },
  enemies = { bug: BUG },
  blocks = BLOCK_TYPES,
  pickups = PICKUPS,
  connections = [],
  start = rooms[0].id,
  positions = Object.fromEntries(rooms.map((room, i) => [room.id, [i, 0]])),
}) {
  return structuredClone({
    'defs.json': { schemaVersion: 1, objects, enemies, spells: SPELLS, pickups, blocks },
    'biomes.json': { schemaVersion: 1, biomes: { home: { name: 'Home', color: '#ffb020' } } },
    'world.json': { schemaVersion: 1, start, connections, positions },
    'strings.json': STRINGS,
    ...Object.fromEntries(rooms.map((room) => [`rooms/${room.id}.json`, room])),
  });
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
