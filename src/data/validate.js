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
  ENEMY_DEFAULTS,
  ENEMY_OPTIONS,
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
import { legAxis, pathCells } from '../world/path.js';

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

  // Only pushables break (entities/pushable.js); integrity on another kind would do nothing.
  for (const [id, type] of Object.entries(files['defs.json'].objects ?? {})) {
    if (type.integrity !== undefined && type.kind !== 'pushable') {
      report('defs.json', `objects.${id}.integrity`, `only pushable objects can be destroyed, not a ${type.kind}`);
    }
  }

  const context = {
    objectTypes: files['defs.json'].objects ?? {},
    enemyTypes: files['defs.json'].enemies ?? {},
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

function validateRoom(file, room, { objectTypes, enemyTypes, biomes }, report) {
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
    /** "x,y,z" → type of the special block filling it (hazard, void); plain blocks aren't listed */
    blockTypes: new Map(),
    /** "x,y,z" → path of the platform whose path sweeps it */
    pathCells: new Map(),
    /** "x,y,z" of every collapsing block */
    collapsing: new Set(),
    /** Ids of objects and enemies (one namespace per room) */
    ids: new Set(),
  };
  const exits = (room.exits ?? []).map(withExitDefaults);
  const exitFits = validateExitBounds(checks, exits);
  validateBlocks(checks);
  validateObjects(checks, objectTypes);
  validateHoles(checks);
  validateEnemies(checks, enemyTypes);
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
    for (const cell of blockCells(block)) {
      if (!fillCell(checks, cell, path)) break;
      if (block.type && block.type !== 'block') checks.blockTypes.set(cellKey(cell), block.type);
    }
  });
}

/** Objects: unique ids, known types, valid overrides, each in a free cell. */
function validateObjects(checks, objectTypes) {
  const { report, ids } = checks;
  (checks.room.objects ?? []).forEach((object, i) => {
    const path = `objects[${i}]`;
    if (ids.has(object.id)) report(path, `duplicate object id "${object.id}"`);
    ids.add(object.id);

    const type = objectTypes[object.type] && { ...OBJECT_STYLE_DEFAULTS, ...objectTypes[object.type] };
    if (!type) report(path, `unknown object type "${object.type}"`);
    else validateOverrides(report, `${path}.overrides`, object, type);
    const inside = fillCell(checks, object.at, path);

    // Platforms follow a path (D46); nothing else does yet.
    if (type?.kind === 'platform' && !object.path) report(path, 'a platform needs a "path"');
    if (type && type.kind !== 'platform' && object.path) report(`${path}.path`, `only platforms follow a path, not "${object.type}"`);
    if (type?.kind === 'platform' && object.path && inside) validatePath(checks, `${path}.path`, object);

    // Collapsing blocks (D47) may grow back; nothing else does.
    if (type && type.kind !== 'collapsing' && object.regrow !== undefined) {
      report(`${path}.regrow`, `only collapsing blocks grow back, not "${object.type}"`);
    }
    if (type?.kind === 'collapsing' && inside) checks.collapsing.add(cellKey(object.at));
  });
}

/**
 * A platform's path: points inside the room, each leg along one axis, and
 * no static block anywhere it sweeps. Objects on the path are allowed (a
 * crate in the way makes the platform wait).
 */
function validatePath({ room, report, filled, pathCells: swept }, path, { at, path: { points, mode } }) {
  if (!validatePathShape(room, report, path, at, points, mode)) return;
  for (const cell of clearPathCells(filled, report, path, at, { points, mode }) ?? []) swept.set(cellKey(cell), path);
}

/**
 * The cells a path sweeps, or null (reported) if it runs through a static block.
 * @returns {number[][]|null}
 */
function clearPathCells(filled, report, path, at, { points, mode }) {
  const cells = pathCells(at, { points, mode });
  for (const cell of cells) {
    const by = filled.get(cellKey(cell));
    if (by?.startsWith('blocks')) {
      report(path, `it runs through cell ${cellText(cell)}, filled by ${by}`);
      return null;
    }
  }
  return cells;
}

/**
 * Points inside the room, each leg along one axis (`level`: along x or z,
 * all at the height of `at`), a loop closing along one axis too.
 * @returns {boolean} whether the shape is fine
 */
function validatePathShape(room, report, path, at, points, mode, level = false) {
  const [w, h, d] = room.size;
  const outside = points.findIndex(([x, y, z]) => !(x < w && y < h && z < d));
  if (outside >= 0) {
    report(`${path}.points[${outside}]`, `cell ${cellText(points[outside])} is outside size ${cellText(room.size)}`);
    return false;
  }
  const oneAxis = (a, b) => (level ? a[1] === b[1] && [0, 2].includes(legAxis(a, b)) : legAxis(a, b) >= 0);
  const rule = level ? 'on exactly one of x and z (same y)' : 'on exactly one axis';
  const stops = [at, ...points];
  for (let i = 1; i < stops.length; i++) {
    if (!oneAxis(stops[i - 1], stops[i])) {
      report(`${path}.points[${i - 1}]`, `${cellText(stops[i])} must differ from ${cellText(stops[i - 1])} ${rule}`);
      return false;
    }
  }
  if (mode === 'loop' && !oneAxis(stops.at(-1), at)) {
    report(path, `a loop runs from ${cellText(stops.at(-1))} back to ${cellText(at)}: they must differ ${rule}`);
    return false;
  }
  return true;
}

/**
 * Enemies (D48): unique ids (shared with objects), known types and valid
 * overrides, each in a free cell of its own, not starting over a hole;
 * patrols have a path, level (legs along x or z) and through no static
 * block; stationary enemies have none.
 */
function validateEnemies(checks, enemyTypes) {
  const { room, report, ids, filled, holes } = checks;
  const [w, h, d] = room.size;
  const taken = new Map();
  (room.enemies ?? []).forEach((enemy, i) => {
    const path = `enemies[${i}]`;
    if (ids.has(enemy.id)) report(path, `duplicate id "${enemy.id}"`);
    ids.add(enemy.id);
    const type = enemyTypes[enemy.type] && { ...ENEMY_DEFAULTS, ...enemyTypes[enemy.type] };
    if (!type) report(path, `unknown enemy type "${enemy.type}"`);
    else validateOverrides(report, `${path}.overrides`, enemy, type, ENEMY_OPTIONS);
    // A patrol walks its path; a stationary enemy has none.
    const movement = enemy.overrides?.movement ?? type?.movement;
    if (movement === 'patrol' && !enemy.path) report(path, 'a patrolling enemy needs a "path"');
    if (movement === 'stationary' && enemy.path) report(`${path}.path`, 'a stationary enemy has no path');

    const [x, y, z] = enemy.at;
    const key = cellKey(enemy.at);
    if (!(x < w && y < h && z < d)) {
      report(path, `cell ${cellText(enemy.at)} is outside size ${cellText(room.size)}`);
      return;
    }
    if (filled.has(key)) report(path, `cell ${cellText(enemy.at)} is filled by ${filled.get(key)}`);
    else if (taken.has(key)) report(path, `cell ${cellText(enemy.at)} is taken by ${taken.get(key)}`);
    taken.set(key, path);
    if (y === 0 && holes.has(cellKey([x, z]))) report(path, `it starts over ${holes.get(cellKey([x, z]))}`);

    if (!enemy.path) return;
    const { points, mode } = enemy.path;
    if (!validatePathShape(room, report, `${path}.path`, enemy.at, points, mode, true)) return;
    clearPathCells(filled, report, `${path}.path`, enemy.at, { points, mode });
  });
}

/** Number ranges of overridable values, as in the schemas: [min, max, whole numbers only]. */
const OVERRIDE_RANGES = {
  tint: [0, 1, false],
  aggroRange: [0, 32, false],
  speed: [0.01, 8, false],
  integrity: [1, 15, true],
  damage: [1, 99, true],
};

/**
 * Overrides can only change existing properties of the type, with valid
 * values (`enums`: the allowed values of listed properties).
 */
function validateOverrides(report, path, object, type, enums = OBJECT_STYLES) {
  for (const [key, value] of Object.entries(object.overrides ?? {})) {
    const range = OVERRIDE_RANGES[key];
    if (!(key in type)) report(path, `"${key}" is not a property of type "${object.type}"`);
    else if (typeof value !== typeof type[key]) report(path, `"${key}" must be a ${typeof type[key]}`);
    else if (enums[key] && !enums[key].includes(value)) {
      report(path, `"${key}" must be one of ${enums[key].join(', ')}`);
    } else if (key === 'color' && !/^#[0-9a-fA-F]{6}$/.test(value)) report(path, `"color" must be #rrggbb`);
    else if (range && !(value >= range[0] && value <= range[1] && (!range[2] || Number.isInteger(value)))) {
      report(path, `"${key}" must be ${range[2] ? 'a whole number ' : ''}between ${range[0]} and ${range[1]}`);
    }
  }
}

/** Holes: floor tiles inside the room, nothing standing in them but platforms and collapsing blocks. */
function validateHoles({ room, report, filled, holes, pathCells, collapsing }) {
  const [w, , d] = room.size;
  (room.holes ?? []).forEach((hole, i) => {
    const path = `holes[${i}]`;
    if (!validateRange(report, path, hole)) return;
    for (const [x, z] of holeTiles(hole)) {
      const tile = cellText([x, z]);
      const key = cellKey([x, z]);
      // A platform may start over a hole (it carries the wizard across), and
      // a collapsing block may stand in one (a bridge that gives way).
      const floor = cellKey([x, 0, z]);
      const under = !pathCells.has(floor) && !collapsing.has(floor) && filled.get(floor);
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

/**
 * Exits: the first row inside is free, so the wizard can pass and arrive,
 * no platform passes through it, and a raised exit's floor is no void
 * block (he would die on arrival).
 */
function validateExitPassage({ room, report, filled, holes, blockTypes, pathCells }, exits, exitFits) {
  exits.forEach((exit, i) => {
    if (!exitFits[i]) return; // reported already
    const { inside } = exitCells(exit, room.size);
    const blocked = inside.find((cell) => filled.has(cellKey(cell)));
    if (blocked) {
      report(`exits[${i}]`, `cell ${cellText(blocked)} inside the exit is filled by ${filled.get(cellKey(blocked))}`);
      return;
    }
    const swept = inside.find((cell) => pathCells.has(cellKey(cell)));
    if (swept) {
      report(`exits[${i}]`, `cell ${cellText(swept)} inside the exit is on ${pathCells.get(cellKey(swept))}`);
      return;
    }
    const pit = exit.y === 0 && inside.find(([x, , z]) => holes.has(cellKey([x, z])));
    if (pit) report(`exits[${i}]`, `tile ${cellText([pit[0], pit[2]])} inside the exit is a hole`);
    const voidFloor = inside.find(([x, y, z]) => y === exit.y && blockTypes.get(cellKey([x, y - 1, z])) === 'void');
    if (voidFloor) report(`exits[${i}]`, `the floor inside the exit is a void block at ${cellText([voidFloor[0], exit.y - 1, voidFloor[2]])}`);
  });
}

/**
 * Does the player's hitbox fit at `point`, inside the room, clear of solids,
 * not hovering over an unsupported hole and not above a hazard or void block
 * (he would land on it)? Used for both `spawn` and `reset`.
 * @param {string} path 'spawn' or 'reset'
 * @param {number[]} point feet center
 */
function validatePlayerPoint({ room, report, filled, holes, blockTypes, collapsing }, path, point) {
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

  // Not above a hole unless a block below catches the player for good (a
  // collapsing block gives way under him).
  const [cx, cz] = [Math.floor(px), Math.floor(pz)];
  const catches = (y) => filled.has(cellKey([cx, y, cz])) && !collapsing.has(cellKey([cx, y, cz]));
  const below = [...Array(Math.floor(py)).keys()].reverse().find(catches);
  const hole = holes.get(cellKey([cx, cz]));
  if (hole && below === undefined) report(path, `the player at ${cellText(point)} would fall into ${hole}`);

  // What he lands on: not a hazard or void block.
  const landing = below !== undefined && blockTypes.get(cellKey([cx, below, cz]));
  if (landing) report(path, `the player at ${cellText(point)} would land on a ${landing} block (${filled.get(cellKey([cx, below, cz]))})`);
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
