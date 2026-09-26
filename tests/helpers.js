/**
 * Shared test fixtures: small data files and games, fake input, grids.
 * Not a test file itself (node --test only picks up *.test.js here).
 */
import STRINGS from '../data/strings.json' with { type: 'json' };
import { loadGameData } from '../src/data/load.js';
import { Grid } from '../src/world/grid.js';

/** A plain pushable crate type. */
export const CRATE = { kind: 'pushable', color: '#b6ff3c' };

/** A moving platform type (its path is on the room object). */
export const LIFT = { kind: 'platform', color: '#00f0ff' };

/** Looks and rules of the special block types, as in defs.json. */
export const BLOCK_TYPES = { hazard: { color: '#ff3b30', damage: 1 }, void: { color: '#8a5cff' } };

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
 * @param {string[][]} [options.connections] pairs of "room.exit"
 * @param {string} [options.start] start room; the first room by default
 */
export function dataFiles({ rooms, objects = { crate: CRATE }, connections = [], start = rooms[0].id }) {
  return structuredClone({
    'defs.json': { schemaVersion: 1, objects, blocks: BLOCK_TYPES },
    'biomes.json': { schemaVersion: 1, biomes: { home: { name: 'Home', color: '#ffb020' } } },
    'world.json': { schemaVersion: 1, start, connections },
    'strings.json': STRINGS,
    ...Object.fromEntries(rooms.map((room) => [`rooms/${room.id}.json`, room])),
  });
}

/** Loaded content for a small game (dataFiles() through loadGameData()). */
export function gameData(options) {
  return loadGameData(dataFiles(options));
}

/** A grid for a room of `size` with the given block cells, hole tiles, exits and hazard/void cells. */
export function grid({ size = [8, 4, 8], cells = [], holes = [], exits = [], typedCells = {} } = {}) {
  return new Grid({ size, cells, holes, exits, typedCells });
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
