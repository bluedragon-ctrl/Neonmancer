/**
 * Semantic data checks: the rules JSON Schema cannot express (room bounds,
 * overlaps, known types and biomes, exits and connections, map positions,
 * spell slots and pickups).
 *
 * Runs at load time in the game and, after the schema pass, in the dev
 * server, the build and CI. Assumes the data already matches the schemas;
 * anything unexpected is still reported instead of crashing.
 *
 * Errors name the file and the path inside it, e.g.
 *   rooms/cache_hall.json › blocks[3]: cell [12,0,4] is outside size [12,4,12]
 */
import { DATA_SCHEMA_VERSION } from '../core/version.js';
import { MAX_ROOM_FOOTPRINT, MAX_SAVED_INTEGRITY, PLAYER_HITBOX } from '../core/rules.js';
import { PLAYER } from '../entities/player.js';
import {
  CHARGED_ATTACKS,
  ENEMY_OPTIONS,
  ENEMY_REQUIRED,
  OBJECT_STYLES,
  OBJECT_STYLE_DEFAULTS,
  OPPOSITE_SIDE,
  blockCells,
  cellKey,
  exitCells,
  holeTiles,
  sideLength,
  resolveBlockTypes,
  resolveEnemyTemplates,
  templateChain,
  withEnemyDefaults,
  withExitDefaults,
  KIND_BLOCK_VALUES,
  STATIC_BLOCK_VALUES,
} from './room-data.js';
import { SWITCH_KINDS } from '../entities/switch.js';
import { mapKey } from '../world/map.js';
import { legAxis, pathCells } from '../world/path.js';
import { MAX_ROOM_NUMBER } from '../world/room-numbers.js';

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

  // Only pushables break (entities/pushable.js) and only platforms hurt
  // (D82); on another kind these would do nothing.
  for (const [id, type] of Object.entries(files['defs.json'].objects ?? {})) {
    if (type.integrity !== undefined && type.kind !== 'pushable') {
      report('defs.json', `objects.${id}.integrity`, `only pushable objects can be destroyed, not a ${type.kind}`);
    }
    if (type.damage !== undefined && type.kind !== 'platform') {
      report('defs.json', `objects.${id}.damage`, `only platforms can hurt, not a ${type.kind}`);
    }
  }

  const enemies = files['defs.json'].enemies ?? {};
  validateTemplates(enemies, report);
  const blocks = files['defs.json'].blocks ?? {};
  validateBlockTypes(blocks, report);
  const pickupTypes = files['defs.json'].pickups ?? {};
  validateSpellsAndPickups(files['defs.json'].spells ?? {}, pickupTypes, files['defs.json'].objects ?? {}, report);
  const context = {
    objectTypes: files['defs.json'].objects ?? {},
    pickupTypes,
    blockTypes: resolveBlockTypes(blocks),
    enemyTemplates: resolveEnemyTemplates(enemies),
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
  guarded('world.json', report, () => validateFragments(files['world.json'], rooms, context.objectTypes, report));
  return errors;
}

/**
 * Enemy templates (D58, D79): `extends` names a known template, the chain
 * of them has no loop, and each template is complete once filled in.
 */
function validateTemplates(enemies, report) {
  const resolved = resolveEnemyTemplates(enemies);
  for (const id of Object.keys(enemies)) {
    const path = `enemies.${id}`;
    const { chain, loop, unknown } = templateChain(enemies, id);
    if (unknown) report('defs.json', `${path}.extends`, `unknown enemy template "${unknown}"`);
    else if (loop) report('defs.json', `${path}.extends`, `a loop: ${[...chain, enemies[chain.at(-1)].extends].join(' → ')}`);
    const missing = ENEMY_REQUIRED.filter((key) => resolved[id][key] === undefined);
    if (!unknown && !loop && missing.length > 0) report('defs.json', path, `missing ${missing.join(', ')}`);
  }
}

/** The spell each upgrade improves (D95); the jump improves none. */
const UPGRADE_SPELLS = { zap_plus: 'zap', shield_plus: 'shield', double_jump: null };

/**
 * Spell, buff, upgrade, secret and fragment slots are unique (each is a save bit, D71), a
 * data disk or a spell upgrade names a known spell, each upgrade has one
 * pickup type (D95), and pickup type ids differ from object type ids
 * (the room editor lists both under its Object tool). All buffs together
 * keep the wizard within the save key's integrity field and recharging at
 * least one unit a tick.
 */
function validateSpellsAndPickups(spells, pickupTypes, objectTypes, report) {
  /** slot → spell id */
  const slots = new Map();
  for (const [id, spell] of Object.entries(spells)) {
    if (slots.has(spell.slot)) report('defs.json', `spells.${id}.slot`, `slot ${spell.slot} is taken by "${slots.get(spell.slot)}"`);
    else slots.set(spell.slot, id);
  }
  /** buff slot → pickup type id */
  const buffSlots = new Map();
  /** All buffs of each stat together. */
  const total = { integrity: 0, energy: 0, recharge: 0 };
  /** upgrade slot → pickup type id, and upgrade → pickup type id */
  const upgradeSlots = new Map();
  const upgrades = new Map();
  /** secret slot → pickup type id */
  const secretSlots = new Map();
  /** fragment slot → pickup type id */
  const fragmentSlots = new Map();
  for (const [id, type] of Object.entries(pickupTypes)) {
    if ((type.kind === 'disk' || type.kind === 'upgrade') && type.spell !== undefined && !spells[type.spell]) {
      report('defs.json', `pickups.${id}.spell`, `unknown spell "${type.spell}"`);
    }
    if (objectTypes[id]) report('defs.json', `pickups.${id}`, `"${id}" is an object type too`);
    if (type.kind === 'upgrade') {
      if (upgradeSlots.has(type.slot)) report('defs.json', `pickups.${id}.slot`, `upgrade slot ${type.slot} is taken by "${upgradeSlots.get(type.slot)}"`);
      else upgradeSlots.set(type.slot, id);
      if (upgrades.has(type.upgrade)) report('defs.json', `pickups.${id}.upgrade`, `upgrade "${type.upgrade}" is "${upgrades.get(type.upgrade)}" already`);
      else upgrades.set(type.upgrade, id);
      const needsSpell = UPGRADE_SPELLS[type.upgrade];
      if (needsSpell && type.spell !== needsSpell) report('defs.json', `pickups.${id}.spell`, `${type.upgrade} upgrades "${needsSpell}"`);
      if (!needsSpell && type.spell !== undefined) report('defs.json', `pickups.${id}.spell`, `${type.upgrade} upgrades no spell`);
      if (type.bounces !== undefined && type.upgrade !== 'zap_plus') report('defs.json', `pickups.${id}.bounces`, 'only zap_plus bounces');
      if (type.upgrade === 'zap_plus' && type.bounces === undefined) report('defs.json', `pickups.${id}`, 'missing bounces');
    }
    if (type.kind === 'secret') {
      if (secretSlots.has(type.slot)) report('defs.json', `pickups.${id}.slot`, `secret slot ${type.slot} is taken by "${secretSlots.get(type.slot)}"`);
      else secretSlots.set(type.slot, id);
    }
    if (type.kind === 'fragment') {
      if (fragmentSlots.has(type.slot)) report('defs.json', `pickups.${id}.slot`, `fragment slot ${type.slot} is taken by "${fragmentSlots.get(type.slot)}"`);
      else fragmentSlots.set(type.slot, id);
    }
    if (type.kind !== 'buff') continue;
    if (buffSlots.has(type.slot)) report('defs.json', `pickups.${id}.slot`, `buff slot ${type.slot} is taken by "${buffSlots.get(type.slot)}"`);
    else buffSlots.set(type.slot, id);
    total[type.stat] += type.amount;
  }
  if (PLAYER.maxIntegrity + total.integrity > MAX_SAVED_INTEGRITY) {
    report('defs.json', 'pickups', `integrity buffs raise the maximum to ${PLAYER.maxIntegrity + total.integrity}; the save key holds at most ${MAX_SAVED_INTEGRITY}`);
  }
  if (PLAYER.energyTicks - total.recharge < 1) {
    report('defs.json', 'pickups', `recharge buffs take away ${total.recharge} of ${PLAYER.energyTicks} ticks per energy unit; at least 1 must be left`);
  }
}

/**
 * Block types (D60): a variant extends a base type; filled in, each has a
 * look (static, in the grid) or a kind (runs as room objects), never both,
 * and only the values that go with it. `block`, the default type of room
 * blocks, is static.
 */
function validateBlockTypes(blocks, report) {
  const resolved = resolveBlockTypes(blocks);
  for (const [id, own] of Object.entries(blocks)) {
    const path = `blocks.${id}`;
    const base = own.extends === undefined ? null : blocks[own.extends];
    if (own.extends !== undefined) {
      if (!base) {
        report('defs.json', `${path}.extends`, `unknown block type "${own.extends}"`);
        continue;
      }
      if (base.extends !== undefined) {
        report('defs.json', `${path}.extends`, `"${own.extends}" is a variant itself; extend its base "${base.extends}"`);
        continue;
      }
    }
    const type = resolved[id];
    if (type.look === undefined && type.kind === undefined) report('defs.json', path, 'needs a "look" (a static block) or a "kind" (runs as room objects)');
    else if (type.look !== undefined && type.kind !== undefined) report('defs.json', path, 'has both a "look" and a "kind"; a block type is one or the other');
    else if (type.kind !== undefined) {
      const wrong = STATIC_BLOCK_VALUES.filter((key) => key in own);
      if (wrong.length > 0) report('defs.json', path, `${wrong.join(', ')}: only for static blocks (with a "look"), not a ${type.kind} block`);
    } else {
      const wrong = KIND_BLOCK_VALUES.filter((key) => key in own);
      if (wrong.length > 0) report('defs.json', path, `${wrong.join(', ')}: only for blocks with a "kind", not a static block`);
    }
  }
  if (resolved.block && !resolved.block.static) report('defs.json', 'blocks.block', 'the default block type must be static (a "look", not a "kind")');
}

/** Run a check; turn a crash on malformed data into an error message. */
function guarded(file, report, check) {
  try {
    check();
  } catch (err) {
    report(file, '', `could not be checked (${err.message})`);
  }
}

function validateRoom(file, room, { objectTypes, pickupTypes, blockTypes, enemyTemplates, biomes }, report) {
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
    /** "x,y,z" → block type (resolved) filling it, only for types that hurt or kill (damage, lethal) */
    blockTypes: new Map(),
    /** "x,y,z" → path of the platform whose path sweeps it */
    pathCells: new Map(),
    /** "x,y,z" of every collapsing block */
    collapsing: new Set(),
    /** Ids of objects, enemies and pickups (one namespace per room) */
    ids: new Set(),
    /** "x,z" → path of the plate on that floor tile (D75) */
    plates: new Map(),
  };
  const exits = (room.exits ?? []).map(withExitDefaults);
  const exitFits = validateExitBounds(checks, exits);
  validateBlocks(checks, blockTypes);
  validateObjects(checks, objectTypes);
  validateHoles(checks);
  validateShrine(checks);
  validateEnemies(checks, enemyTemplates);
  validatePickups(checks, pickupTypes);
  validateExitPassage(checks, exits, exitFits);
  validateLocks(checks, exits, objectTypes);

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

/** Blocks: known types, inside the room, no two in the same cell. */
function validateBlocks(checks, blockTypes) {
  (checks.room.blocks ?? []).forEach((block, i) => {
    const path = `blocks[${i}]`;
    const type = blockTypes[block.type ?? 'block'];
    if (!type) {
      checks.report(`${path}.type`, `unknown block type "${block.type}"`);
      return;
    }
    if (!validateRange(checks.report, path, block)) return;
    // Report only the first bad cell of a block, not one per cell.
    for (const cell of blockCells(block)) {
      if (!fillCell(checks, cell, path)) break;
      if (type.damage || type.lethal) checks.blockTypes.set(cellKey(cell), type);
      // Collapsing blocks (D47) give way: they don't hold up the player or a hole.
      if (type.kind === 'collapsing') checks.collapsing.add(cellKey(cell));
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
    // A plate is a floor tile, no body (D75): things may stand on it.
    if (type?.kind === 'plate') return validatePlate(checks, path, object.at);
    const inside = fillCell(checks, object.at, path);
    // The core stands 2 high (D101): the cell above is its too.
    if (type?.kind === 'core') fillCell(checks, [object.at[0], object.at[1] + 1, object.at[2]], path);

    // Among objects only platforms follow a path (D46).
    if (type?.kind === 'platform' && !object.path) report(path, 'a platform needs a "path"');
    if (type && type.kind !== 'platform' && object.path) report(`${path}.path`, `only platforms follow a path, not "${object.type}"`);
    if (type?.kind === 'platform' && object.path && inside) validatePath(checks, `${path}.path`, object);
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
 * Enemies (D48, D78, D80): unique ids (shared with objects), known types
 * and valid overrides, each in a free cell of its own, not starting over a
 * hole nor on a lethal block; patrols have a path, level (legs along x or
 * z) and through no static block; chasers may have one (walked while
 * calm); stationary enemies have none. What could never happen is an
 * error: a chaser needs an aggro range to see the wizard; a charged attack
 * only fires at a wizard it has noticed, so its aggro range must reach its
 * attack range, and a peaceful enemy never fires one.
 */
function validateEnemies(checks, enemyTemplates) {
  const { room, report, ids, filled, holes, blockTypes } = checks;
  const [w, h, d] = room.size;
  const taken = new Map();
  (room.enemies ?? []).forEach((enemy, i) => {
    const path = `enemies[${i}]`;
    if (ids.has(enemy.id)) report(path, `duplicate id "${enemy.id}"`);
    ids.add(enemy.id);
    const type = enemyTemplates[enemy.template] && withEnemyDefaults(enemyTemplates[enemy.template]);
    if (!type) report(path, `unknown enemy template "${enemy.template}"`);
    else {
      validateOverrides(report, `${path}.overrides`, enemy, type, ENEMY_OPTIONS, `template "${enemy.template}"`);
      const values = { ...type, ...enemy.overrides };
      if (values.movement === 'chase' && !(values.aggroRange > 0)) {
        report(path, 'a chaser needs an aggroRange above 0: it never sees the wizard to chase');
      }
      if (CHARGED_ATTACKS.includes(values.attack)) {
        if (values.aggroRange < values.attackRange) {
          report(path, `its aggroRange ${values.aggroRange} is shorter than its attackRange ${values.attackRange}: it only fires at a wizard it has noticed`);
        }
        if (values.hostility === 'peaceful') report(path, `a peaceful enemy never fires its ${values.attack}: make it hostile or provoked, or its attack none`);
      }
    }
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
    if (blockTypes.get(cellKey([x, y - 1, z]))?.lethal) report(path, `it starts on a lethal block at ${cellText([x, y - 1, z])}: it would pop at once`);

    if (!enemy.path) return;
    const { points, mode } = enemy.path;
    if (!validatePathShape(room, report, `${path}.path`, enemy.at, points, mode, true)) return;
    clearPathCells(filled, report, `${path}.path`, enemy.at, { points, mode });
  });
}

/**
 * Pickups (D71): unique ids (shared with objects and enemies), known types,
 * inside the room in a cell no block or object fills, one per cell.
 */
function validatePickups({ room, report, ids, filled }, pickupTypes) {
  const [w, h, d] = room.size;
  const taken = new Map();
  (room.pickups ?? []).forEach((pickup, i) => {
    const path = `pickups[${i}]`;
    if (ids.has(pickup.id)) report(path, `duplicate id "${pickup.id}"`);
    ids.add(pickup.id);
    if (!pickupTypes[pickup.type]) report(`${path}.type`, `unknown pickup type "${pickup.type}"`);
    const [x, y, z] = pickup.at;
    const key = cellKey(pickup.at);
    if (!(x < w && y < h && z < d)) report(path, `cell ${cellText(pickup.at)} is outside size ${cellText(room.size)}`);
    else if (filled.has(key)) report(path, `cell ${cellText(pickup.at)} is filled by ${filled.get(key)}`);
    else if (taken.has(key)) report(path, `cell ${cellText(pickup.at)} is taken by ${taken.get(key)}`);
    taken.set(key, path);
  });
}

/** Number ranges of overridable values, as in the schemas: [min, max, whole numbers only]. */
const OVERRIDE_RANGES = {
  tint: [0, 1, false],
  aggroRange: [0, 32, false],
  speed: [0.01, 8, false],
  chaseSpeed: [0.01, 8, false],
  memory: [0, 10, false],
  attackRange: [0.5, 16, false],
  attackCharge: [0, 3, false],
  attackCooldown: [0, 10, false],
  boltSpeed: [0.5, 16, false],
  boltBounces: [0, 8, true],
  integrity: [1, 15, true],
  damage: [1, 99, true],
};

/** Override values that are colors (#rrggbb). */
const COLOR_KEYS = ['color', 'attackColor'];

/**
 * Overrides can only change existing properties of the type, with valid
 * values (`enums`: the allowed values of listed properties).
 * @param {string} [typeName] how errors name the type ('type "crate"'; an enemy's template)
 */
function validateOverrides(report, path, object, type, enums = OBJECT_STYLES, typeName = `type "${object.type}"`) {
  for (const [key, value] of Object.entries(object.overrides ?? {})) {
    const range = OVERRIDE_RANGES[key];
    if (!(key in type)) report(path, `"${key}" is not a property of ${typeName}`);
    else if (typeof value !== typeof type[key]) report(path, `"${key}" must be a ${typeof type[key]}`);
    else if (enums[key] && !enums[key].includes(value)) {
      report(path, `"${key}" must be one of ${enums[key].join(', ')}`);
    } else if (COLOR_KEYS.includes(key) && !/^#[0-9a-fA-F]{6}$/.test(value)) report(path, `"${key}" must be #rrggbb`);
    else if (range && !(value >= range[0] && value <= range[1] && (!range[2] || Number.isInteger(value)))) {
      report(path, `"${key}" must be ${range[2] ? 'a whole number ' : ''}between ${range[0]} and ${range[1]}`);
    }
  }
}

/**
 * A plate (D75) lies on the floor (y 0), inside the room, in a cell no block
 * fills (blocks are checked first) and on no hole (checked with the holes).
 */
function validatePlate({ room, report, filled, plates }, path, [x, y, z]) {
  const [w, , d] = room.size;
  if (y !== 0) report(`${path}.at`, 'a plate lies on the floor (y 0)');
  else if (x < 0 || z < 0 || x >= w || z >= d) report(`${path}.at`, `cell ${cellText([x, y, z])} is outside size ${cellText(room.size)}`);
  else if (filled.has(cellKey([x, y, z]))) report(`${path}.at`, `cell ${cellText([x, y, z])} is filled by ${filled.get(cellKey([x, y, z]))}`);
  else if (plates.has(cellKey([x, z]))) report(`${path}.at`, `tile ${cellText([x, z])} has ${plates.get(cellKey([x, z]))} already`);
  else plates.set(cellKey([x, z]), path);
}

/** A locked exit (D75) opens when every switch in the room is on, so the room needs one. */
function validateLocks({ room, report }, exits, objectTypes) {
  const switches = (room.objects ?? []).filter((object) => SWITCH_KINDS.includes(objectTypes[object.type]?.kind));
  exits.forEach((exit, i) => {
    if (exit.locked && switches.length === 0) report(`exits[${i}].locked`, 'a locked exit needs a switch in the room (a target or a plate)');
  });
}

/** Holes: floor tiles inside the room, nothing standing in them but platforms and collapsing blocks. */
function validateHoles({ room, report, filled, holes, pathCells, collapsing, plates }) {
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
      else if (plates.has(key)) problem = `tile ${tile} is under ${plates.get(key)}`;
      if (problem) {
        report(path, problem);
        break; // one problem per entry is enough
      }
      holes.set(key, path);
    }
  });
}

/** The backup shrine (D97): a floor tile inside the room, on no hole, plate, block or object. */
function validateShrine({ room, report, filled, holes, plates }) {
  if (!room.shrine) return;
  const [x, z] = room.shrine;
  const tile = cellText([x, z]);
  const key = cellKey([x, z]);
  const under = filled.get(cellKey([x, 0, z])) ?? holes.get(key) ?? plates.get(key);
  if (x >= room.size[0] || z >= room.size[2]) report('shrine', `tile ${tile} is outside size ${cellText(room.size)}`);
  else if (under) report('shrine', `tile ${tile} is under ${under}`);
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
    const lethalFloor = inside.find(([x, y, z]) => y === exit.y && blockTypes.get(cellKey([x, y - 1, z]))?.lethal);
    if (lethalFloor) {
      const cell = [lethalFloor[0], exit.y - 1, lethalFloor[2]];
      report(`exits[${i}]`, `the floor inside the exit is a lethal ${blockTypes.get(cellKey(cell)).id} block at ${cellText(cell)}`);
    }
  });
}

/**
 * Does the player's hitbox fit at `point`, inside the room, clear of solids,
 * not hovering over an unsupported hole and not above a block that hurts or
 * kills (damage, lethal: he would land on it)? Used for both `spawn` and `reset`.
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

  // What he lands on: not a block that hurts or kills.
  const landing = below !== undefined && blockTypes.get(cellKey([cx, below, cz]));
  if (landing) report(path, `the player at ${cellText(point)} would land on a ${landing.id} block (${filled.get(cellKey([cx, below, cz]))})`);
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

  // One cell of the world map per room (D66).
  const positions = world.positions ?? {};
  /** "x,z" → room id placed there */
  const cells = new Map();
  for (const [id, cell] of Object.entries(positions)) {
    if (!rooms.has(id)) report(file, `positions.${id}`, `unknown room "${id}"`);
    const key = mapKey(cell);
    if (cells.has(key)) report(file, `positions.${id}`, `cell ${cellText(cell)} is taken by "${cells.get(key)}"`);
    else cells.set(key, id);
  }
  for (const id of rooms.keys()) {
    if (!positions[id]) report(file, 'positions', `room "${id}" has no position on the map`);
  }

  // A number per room for the access key (D111); a deleted room's entry stays.
  const numbers = world.numbers ?? {};
  /** number → room id */
  const owners = new Map();
  for (const [id, number] of Object.entries(numbers)) {
    if (!Number.isInteger(number) || number < 0 || number > MAX_ROOM_NUMBER) report(file, `numbers.${id}`, `${number} is not a room number (0–${MAX_ROOM_NUMBER})`);
    else if (owners.has(number)) report(file, `numbers.${id}`, `number ${number} is taken by "${owners.get(number)}"`);
    else owners.set(number, id);
  }
  for (const id of rooms.keys()) {
    if (!Object.hasOwn(numbers, id)) report(file, 'numbers', `room "${id}" has no number`);
  }
}

/**
 * Key fragments and access (D101): the access thresholds rise and stay
 * within the fragments the core needs; an exit asks for a level the
 * thresholds can give; there is at most one core in the world.
 */
function validateFragments(world, rooms, objectTypes, report) {
  const file = 'world.json';
  const { required = 64, access = [] } = world.fragments ?? {};
  access.forEach((needed, i) => {
    if (i > 0 && needed <= access[i - 1]) report(file, `fragments.access[${i}]`, `${needed} must be more than level ${i}'s ${access[i - 1]}`);
    if (needed > required) report(file, `fragments.access[${i}]`, `${needed} is more than the ${required} fragments the core needs`);
  });
  const cores = [];
  for (const [id, room] of rooms) {
    (room?.exits ?? []).forEach((exit, i) => {
      if (exit.access > access.length) {
        report(`rooms/${id}.json`, `exits[${i}].access`, `level ${exit.access} can't be reached: world.json gives ${access.length} access level${access.length === 1 ? '' : 's'}`);
      }
    });
    for (const object of room?.objects ?? []) if (objectTypes[object.type]?.kind === 'core') cores.push(`${id}.${object.id}`);
  }
  if (cores.length > 1) report(file, 'fragments', `the world has ${cores.length} cores (${cores.join(', ')}); it needs one at most`);
}
