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
  sideLength,
  withExitDefaults,
} from './room-data.js';

/** Files every game needs (paths relative to data/). */
export const REQUIRED_FILES = ['defs.json', 'biomes.json', 'world.json'];

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

  const [w, h, d] = room.size;
  if (w + d > MAX_ROOM_FOOTPRINT) {
    report(file, 'size', `width + depth is ${w + d}, at most ${MAX_ROOM_FOOTPRINT} fits the camera`);
  }
  if (!biomes[room.biome]) report(file, 'biome', `unknown biome "${room.biome}"`);

  const inside = ([x, y, z]) => x < w && y < h && z < d;

  // Exits.
  const exitIds = new Set();
  (room.exits ?? []).forEach((raw, i) => {
    const path = `exits[${i}]`;
    const exit = withExitDefaults(raw);
    if (exitIds.has(exit.id)) report(file, path, `duplicate exit id "${exit.id}"`);
    exitIds.add(exit.id);
    const length = sideLength(exit.side, room.size);
    if (exit.at + exit.width > length) {
      report(file, path, `cells ${exit.at}–${exit.at + exit.width - 1} run past the side (length ${length})`);
    }
    if (exit.y + exit.height > h) report(file, path, `top (y ${exit.y + exit.height}) is above the room height ${h}`);
  });

  // Blocks and objects: inside the room, no two in the same cell.
  const filled = new Map(); // "x,y,z" → what fills it
  const fill = (cell, path) => {
    if (!inside(cell)) {
      report(file, path, `cell ${cellText(cell)} is outside size ${cellText(room.size)}`);
      return false;
    }
    const key = cell.join(',');
    if (filled.has(key)) {
      report(file, path, `cell ${cellText(cell)} is already filled by ${filled.get(key)}`);
      return false;
    }
    filled.set(key, path);
    return true;
  };

  (room.blocks ?? []).forEach((block, i) => {
    const path = `blocks[${i}]`;
    if (block.to && block.to.some((v, axis) => v < block.at[axis])) {
      report(file, path, `"to" ${cellText(block.to)} must not be below "at" ${cellText(block.at)} on any axis`);
      return;
    }
    // Report only the first bad cell of a block, not one per cell.
    for (const cell of blockCells(block)) if (!fill(cell, path)) break;
  });

  const objectIds = new Set();
  (room.objects ?? []).forEach((object, i) => {
    const path = `objects[${i}]`;
    if (objectIds.has(object.id)) report(file, path, `duplicate object id "${object.id}"`);
    objectIds.add(object.id);

    const type = objectTypes[object.type] && { ...OBJECT_STYLE_DEFAULTS, ...objectTypes[object.type] };
    if (!type) {
      report(file, path, `unknown object type "${object.type}"`);
    } else {
      // Overrides can only change existing properties, with valid values.
      const overridesPath = `${path}.overrides`;
      for (const [key, value] of Object.entries(object.overrides ?? {})) {
        if (!(key in type)) report(file, overridesPath, `"${key}" is not a property of type "${object.type}"`);
        else if (typeof value !== typeof type[key]) {
          report(file, overridesPath, `"${key}" must be a ${typeof type[key]}`);
        } else if (OBJECT_STYLES[key] && !OBJECT_STYLES[key].includes(value)) {
          report(file, overridesPath, `"${key}" must be one of ${OBJECT_STYLES[key].join(', ')}`);
        } else if (key === 'color' && !/^#[0-9a-fA-F]{6}$/.test(value)) {
          report(file, overridesPath, `"color" must be #rrggbb`);
        }
      }
    }
    fill(object.at, path);
  });

  // Spawn: the whole player hitbox inside the room and clear of solids.
  const [sx, sy, sz] = room.spawn;
  const [hw, hh, hd] = PLAYER_HITBOX;
  const min = [sx - hw / 2, sy, sz - hd / 2];
  const max = [sx + hw / 2, sy + hh, sz + hd / 2];
  if (min.some((v) => v < 0) || max[0] > w || max[1] > h || max[2] > d) {
    report(file, 'spawn', `the player (${hw}×${hh}×${hd}) at ${cellText(room.spawn)} does not fit inside the room`);
  } else {
    const overlapped = blockCells({
      at: min.map(Math.floor),
      to: max.map((v) => Math.ceil(v) - 1),
    });
    const hit = overlapped.find((cell) => filled.has(cell.join(',')));
    if (hit) report(file, 'spawn', `the player at ${cellText(room.spawn)} overlaps ${filled.get(hit.join(','))}`);
  }
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
