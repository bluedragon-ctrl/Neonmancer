/**
 * Semantic data checks: the rules JSON Schema cannot express (room bounds,
 * overlaps, known types and biomes, exits and connections).
 *
 * Runs at load time in the game and, after the schema pass, in the dev
 * server, the build and CI. Assumes the data already matches the schemas;
 * anything unexpected is still reported instead of crashing.
 *
 * Errors name the file and the path inside it, e.g.
 *   rooms/cache_hall.json › blocks[3]: cell [12,0,4] is outside size [12,4,12]
 */
import { DATA_SCHEMA_VERSION } from '../core/version.js';
import { MAX_ROOM_FOOTPRINT, PLAYER_HITBOX } from '../core/rules.js';
import {
  OBJECT_STYLES,
  OBJECT_STYLE_DEFAULTS,
  OPPOSITE_SIDE,
  blockCells,
  cellKey,
  exitCells,
  holeTiles,
  sideLength,
  withExitDefaults,
} from './room-data.js';

/** Files every game needs (paths relative to data/). */
export const REQUIRED_FILES = ['defs.json', 'biomes.json', 'world.json', 'strings.json'];

/**
 * @param {string} file path relative to data/
 * @param {string} path location inside the file, e.g. "blocks[3]" ('' for the whole file)
 * @param {string} message
 */
export function formatError(file, path, message) {
  return path ? `${file} › ${path}: ${message}` : `${file}: ${message}`;
}

const cellText = (cell) => `[${cell.join(',')}]`;

/** "rooms/boot_sector.json" → "boot_sector" */
const roomIdFromFile = (file) => file.slice('rooms/'.length, -'.json'.length);

/**
 * @param {Record<string, any>} files parsed JSON keyed by path relative to data/
 * @returns {string[]} error messages; empty when the data is valid
 */
export function validateData(files) {
  const errors = [];
  const report = (file, path, message) => errors.push(formatError(file, path, message));

  for (const name of REQUIRED_FILES) {
    if (!files[name]) report(name, '', 'file is missing');
  }
  if (errors.length > 0) return errors;

  for (const [file, data] of Object.entries(files)) {
    if (data?.schemaVersion !== DATA_SCHEMA_VERSION) {
      report(file, 'schemaVersion', `is ${data?.schemaVersion}, the game expects ${DATA_SCHEMA_VERSION}`);
    }
  }

  const context = {
    objectTypes: files['defs.json'].objects ?? {},
    biomes: files['biomes.json'].biomes ?? {},
  };
  /** room id (from the file name) → room data */
  const rooms = new Map();
  for (const [file, room] of Object.entries(files)) {
    if (!file.startsWith('rooms/')) continue;
    guarded(file, report, () => validateRoom(file, room, context, report));
    rooms.set(roomIdFromFile(file), room);
  }
  guarded('world.json', report, () => validateWorld(files['world.json'], rooms, report));
  return errors;
}

/** Run a check; turn a crash on malformed data into an error message. */
function guarded(file, report, check) {
  try {
    check();
  } catch (err) {
    report(file, '', `could not be checked (${err.message})`);
  }
}

function validateRoom(file, room, { objectTypes, biomes }, report) {
  const expectedId = roomIdFromFile(file);
  if (room.id !== expectedId) report(file, 'id', `"${room.id}" must match the file name ("${expectedId}")`);

  const [w, , d] = room.size;
  if (w + d > MAX_ROOM_FOOTPRINT) {
    report(file, 'size', `width + depth is ${w + d}, at most ${MAX_ROOM_FOOTPRINT} fits the camera`);
  }
  if (!biomes[room.biome]) report(file, 'biome', `unknown biome "${room.biome}"`);

  /** What the room checks share: errors go to this file; what fills each cell and tile. */
  const checks = {
    room,
    report: (path, message) => report(file, path, message),
    /** "x,y,z" → path of the block or object filling it */
    filled: new Map(),
    /** "x,z" → path of the hole entry */
    holes: new Map(),
  };
  const exits = (room.exits ?? []).map(withExitDefaults);
  const exitFits = validateExitBounds(checks, exits);
  validateBlocks(checks);
  validateObjects(checks, objectTypes);
  validateHoles(checks);
  validateExitPassage(checks, exits, exitFits);

  // Spawn and reset (D39). reset defaults to spawn (buildRoom does the
  // same), so it only needs its own check when a room gives it explicitly.
  validatePlayerPoint(checks, 'spawn', room.spawn);
  if (room.reset) validatePlayerPoint(checks, 'reset', room.reset);
}

/**
 * Exit ids are unique and every exit fits its side and the room height.
 * @returns {boolean[]} per exit, whether it fits
 */
function validateExitBounds({ room, report }, exits) {
  const ids = new Set();
  const height = room.size[1];
  return exits.map((exit, i) => {
    const path = `exits[${i}]`;
    if (ids.has(exit.id)) report(path, `duplicate exit id "${exit.id}"`);
    ids.add(exit.id);
    const length = sideLength(exit.side, room.size);
    const fitsSide = exit.at + exit.width <= length;
    const fitsHeight = exit.y + exit.height <= height;
    if (!fitsSide) report(path, `cells ${exit.at}–${exit.at + exit.width - 1} run past the side (length ${length})`);
    if (!fitsHeight) report(path, `top (y ${exit.y + exit.height}) is above the room height ${height}`);
    return fitsSide && fitsHeight;
  });
}

/**
 * Fill a cell for `path`: it must be inside the room and not filled yet.
 * @returns {boolean} whether it was free
 */
function fillCell({ room, report, filled }, cell, path) {
  const [w, h, d] = room.size;
  const [x, y, z] = cell;
  if (!(x < w && y < h && z < d)) {
    report(path, `cell ${cellText(cell)} is outside size ${cellText(room.size)}`);
    return false;
  }
  const key = cellKey(cell);
  if (filled.has(key)) {
    report(path, `cell ${cellText(cell)} is already filled by ${filled.get(key)}`);
    return false;
  }
  filled.set(key, path);
  return true;
}

/**
 * A block or hole entry's "to" must not be below its "at" on any axis.
 * @returns {boolean} whether the range is fine
 */
function validateRange(report, path, { at, to }) {
  if (!to || to.every((v, axis) => v >= at[axis])) return true;
  report(path, `"to" ${cellText(to)} must not be below "at" ${cellText(at)} on any axis`);
  return false;
}

/** Blocks: inside the room, no two in the same cell. */
function validateBlocks(checks) {
  (checks.room.blocks ?? []).forEach((block, i) => {
    const path = `blocks[${i}]`;
    if (!validateRange(checks.report, path, block)) return;
    // Report only the first bad cell of a block, not one per cell.
    for (const cell of blockCells(block)) if (!fillCell(checks, cell, path)) break;
  });
}

/** Objects: unique ids, known types, valid overrides, each in a free cell. */
function validateObjects(checks, objectTypes) {
  const { report } = checks;
  const ids = new Set();
  (checks.room.objects ?? []).forEach((object, i) => {
    const path = `objects[${i}]`;
    if (ids.has(object.id)) report(path, `duplicate object id "${object.id}"`);
    ids.add(object.id);

    const type = objectTypes[object.type] && { ...OBJECT_STYLE_DEFAULTS, ...objectTypes[object.type] };
    if (!type) report(path, `unknown object type "${object.type}"`);
    else validateOverrides(report, `${path}.overrides`, object, type);
    fillCell(checks, object.at, path);
  });
}

/** Overrides can only change existing properties of the type, with valid values. */
function validateOverrides(report, path, object, type) {
  for (const [key, value] of Object.entries(object.overrides ?? {})) {
    if (!(key in type)) report(path, `"${key}" is not a property of type "${object.type}"`);
    else if (typeof value !== typeof type[key]) report(path, `"${key}" must be a ${typeof type[key]}`);
    else if (OBJECT_STYLES[key] && !OBJECT_STYLES[key].includes(value)) {
      report(path, `"${key}" must be one of ${OBJECT_STYLES[key].join(', ')}`);
    } else if (key === 'color' && !/^#[0-9a-fA-F]{6}$/.test(value)) report(path, `"color" must be #rrggbb`);
    else if (key === 'tint' && !(value >= 0 && value <= 1)) report(path, `"tint" must be between 0 and 1`);
  }
}

/** Holes: floor tiles inside the room, nothing standing in them. */
function validateHoles({ room, report, filled, holes }) {
  const [w, , d] = room.size;
  (room.holes ?? []).forEach((hole, i) => {
    const path = `holes[${i}]`;
    if (!validateRange(report, path, hole)) return;
    for (const [x, z] of holeTiles(hole)) {
      const tile = cellText([x, z]);
      const key = cellKey([x, z]);
      const under = filled.get(cellKey([x, 0, z]));
      let problem = null;
      if (x >= w || z >= d) problem = `tile ${tile} is outside size ${cellText(room.size)}`;
      else if (holes.has(key)) problem = `tile ${tile} is already a hole in ${holes.get(key)}`;
      else if (under) problem = `tile ${tile} is under ${under}`;
      if (problem) {
        report(path, problem);
        break; // one problem per entry is enough
      }
      holes.set(key, path);
    }
  });
}

/** Exits: the first row inside is free, so the wizard can pass and arrive. */
function validateExitPassage({ room, report, filled, holes }, exits, exitFits) {
  exits.forEach((exit, i) => {
    if (!exitFits[i]) return; // reported already
    const { inside } = exitCells(exit, room.size);
    const blocked = inside.find((cell) => filled.has(cellKey(cell)));
    if (blocked) {
      report(`exits[${i}]`, `cell ${cellText(blocked)} inside the exit is filled by ${filled.get(cellKey(blocked))}`);
      return;
    }
    const pit = exit.y === 0 && inside.find(([x, , z]) => holes.has(cellKey([x, z])));
    if (pit) report(`exits[${i}]`, `tile ${cellText([pit[0], pit[2]])} inside the exit is a hole`);
  });
}

/**
 * Does the player's hitbox fit at `point`, inside the room, clear of solids
 * and not hovering over an unsupported hole? Used for both `spawn` and `reset`.
 * @param {string} path 'spawn' or 'reset'
 * @param {number[]} point feet center
 */
function validatePlayerPoint({ room, report, filled, holes }, path, point) {
  const [w, h, d] = room.size;
  const [px, py, pz] = point;
  const [hw, hh, hd] = PLAYER_HITBOX;
  const min = [px - hw / 2, py, pz - hd / 2];
  const max = [px + hw / 2, py + hh, pz + hd / 2];
  if (min.some((v) => v < 0) || max[0] > w || max[1] > h || max[2] > d) {
    report(path, `the player (${hw}×${hh}×${hd}) at ${cellText(point)} does not fit inside the room`);
    return;
  }
  const overlapped = blockCells({
    at: min.map(Math.floor),
    to: max.map((v) => Math.ceil(v) - 1),
  });
  const hit = overlapped.find((cell) => filled.has(cellKey(cell)));
  if (hit) report(path, `the player at ${cellText(point)} overlaps ${filled.get(cellKey(hit))}`);

  // Not above a hole unless a block below catches the player.
  const [cx, cz] = [Math.floor(px), Math.floor(pz)];
  const caught = [...Array(Math.floor(py)).keys()].some((y) => filled.has(cellKey([cx, y, cz])));
  const hole = holes.get(cellKey([cx, cz]));
  if (hole && !caught) report(path, `the player at ${cellText(point)} would fall into ${hole}`);
}

function validateWorld(world, rooms, report) {
  const file = 'world.json';
  if (!rooms.has(world.start)) report(file, 'start', `unknown room "${world.start}"`);

  /** "room.exit" → exit, for every exit in every room */
  const exits = new Map();
  for (const [id, room] of rooms) {
    for (const exit of room?.exits ?? []) exits.set(`${id}.${exit.id}`, withExitDefaults(exit));
  }

  const used = new Set();
  world.connections.forEach((pair, i) => {
    const path = `connections[${i}]`;
    const [a, b] = pair.map((ref) => {
      if (!exits.has(ref)) report(file, path, `unknown exit "${ref}"`);
      else if (used.has(ref)) report(file, path, `exit "${ref}" is already connected`);
      used.add(ref);
      return exits.get(ref);
    });
    if (!a || !b) return;
    if (OPPOSITE_SIDE[a.side] !== b.side) {
      report(file, path, `exits must be on opposite sides (${a.side} and ${b.side})`);
    }
    if (a.width !== b.width) report(file, path, `exits must be equally wide (${a.width} and ${b.width})`);
  });

  for (const ref of exits.keys()) {
    if (!used.has(ref)) report(file, 'connections', `exit "${ref}" is not connected`);
  }
}
