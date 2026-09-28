/**
 * Small helpers for reading room data, shared by the validator and the room
 * builder so both interpret the data the same way.
 */

/** Values used when an exit leaves them out (same as the schema defaults). */
export const EXIT_DEFAULTS = { width: 2, y: 0, height: 2 };

/**
 * Values used when a path leaves them out (same as the schema defaults):
 * speed in units per second, pause in seconds at the ends (D46).
 */
export const PATH_DEFAULTS = { mode: 'pingpong', speed: 2, pause: 0 };

/** @param {object} exit exit from a room file */
export function withExitDefaults(exit) {
  return { ...EXIT_DEFAULTS, ...exit };
}

/**
 * Every cell a block entry fills: just `at`, or the box from `at` to `to`
 * (inclusive).
 * @param {{ at: number[], to?: number[] }} block
 * @returns {number[][]}
 */
export function blockCells({ at, to = at }) {
  const cells = [];
  for (let x = at[0]; x <= to[0]; x++)
    for (let y = at[1]; y <= to[1]; y++) for (let z = at[2]; z <= to[2]; z++) cells.push([x, y, z]);
  return cells;
}

/**
 * Length of the room side an exit is on (the axis `at` counts along).
 * @param {string} side '-x' | '+x' | '-z' | '+z'
 * @param {number[]} size room size [x, y, z]
 */
export function sideLength(side, [w, , d]) {
  return side.endsWith('x') ? d : w;
}

/** The side a connected exit must be on. */
export const OPPOSITE_SIDE = { '-x': '+x', '+x': '-x', '-z': '+z', '+z': '-z' };

/**
 * Is the side a back side (−x or −z, where the walls are)? Leaving through
 * it moves towards negative coordinates.
 * @param {string} side '-x' | '+x' | '-z' | '+z'
 */
export function isBackSide(side) {
  return side.startsWith('-');
}

/**
 * Key of a grid cell [x, y, z] or floor tile [x, z] in a Set or Map.
 * @param {number[]} coords
 */
export function cellKey(coords) {
  return coords.join(',');
}

/**
 * Axes of a side: `cross` is the axis the side faces along (0 = x, 2 = z),
 * `along` the axis `at` counts along.
 * @param {string} side '-x' | '+x' | '-z' | '+z'
 */
export function sideAxes(side) {
  return side.endsWith('x') ? { cross: 0, along: 2 } : { cross: 2, along: 0 };
}

/**
 * Cells of an exit opening (defaults applied): `outside` is the row just
 * beyond the side (left open in the boundary), `inside` the first row in
 * the room (must stay free so the player can pass).
 * @param {{ side: string, at: number, width: number, y: number, height: number }} exit
 * @param {number[]} size room size [x, y, z]
 * @returns {{ outside: number[][], inside: number[][] }} cells as [x, y, z]
 */
export function exitCells({ side, at, width, y, height }, size) {
  const { cross, along } = sideAxes(side);
  const last = size[cross] - 1;
  const [outer, inner] = isBackSide(side) ? [-1, 0] : [last + 1, last];
  const outside = [];
  const inside = [];
  for (let i = at; i < at + width; i++) {
    for (let cy = y; cy < y + height; cy++) {
      const cell = [0, cy, 0];
      cell[along] = i;
      cell[cross] = outer;
      outside.push([...cell]);
      cell[cross] = inner;
      inside.push(cell);
    }
  }
  return { outside, inside };
}

/**
 * Optional look of an object type, so types differ by more than color
 * (readable in grayscale and for color-blind players). The first value of
 * each list is the default.
 */
export const OBJECT_STYLES = {
  edges: ['solid', 'dashed'],
  mark: ['none', 'inset', 'cross', 'brackets', 'bits'],
  faces: ['dark', 'tinted'],
};

/** Style defaults: the first value of each OBJECT_STYLES list, plus the tint. */
export const OBJECT_STYLE_DEFAULTS = {
  ...Object.fromEntries(Object.entries(OBJECT_STYLES).map(([key, values]) => [key, values[0]])),
  /** With tinted faces: share of the object color in the top face (0–1); sides get less. */
  tint: 0.1,
};

/**
 * Values an enemy type's fields can take (the first is listed first in the
 * schema too). Enemies are universal (D77): any look, movement and attack
 * combine. model: its look (render/entity-view.js ENEMY_MODELS); movement:
 * a behavior module (ai/behaviors.js); attack: how it hurts; hostility:
 * hostile hurts, peaceful never does, provoked turns hostile once a spell
 * hits it; attackShape: a discharge all round it (burst) or one bolt at the
 * wizard (arc).
 */
export const ENEMY_OPTIONS = {
  model: ['bug', 'virus', 'sentinel'],
  movement: ['patrol', 'stationary', 'chase'],
  attack: ['contact', 'none', 'discharge'],
  hostility: ['hostile', 'peaceful', 'provoked'],
  attackShape: ['burst', 'arc'],
};

/**
 * Enemy type fields that may be left out: aggro range (units), bounce (a
 * trampoline top), solid (blocks, carries and shoves the wizard), memory
 * (seconds a chaser searches after losing sight of him) and the discharge
 * attack's shape, range (units), charge and cooldown (seconds). chaseSpeed
 * and attackColor default to the enemy's speed and color (withEnemyDefaults()).
 */
export const ENEMY_DEFAULTS = {
  aggroRange: 0,
  bounce: false,
  solid: false,
  memory: 1.5,
  attackShape: 'burst',
  attackRange: 1.2,
  attackCharge: 0.4,
  attackCooldown: 1.5,
};

/** Enemy type fields a type needs (a template gets them from its base), as in the schema. */
export const ENEMY_REQUIRED = ['model', 'movement', 'attack', 'hostility', 'integrity', 'damage', 'speed', 'color'];

/**
 * An enemy's values with every default filled in: ENEMY_DEFAULTS, then
 * `values` (a type, or a type with a room's overrides), then chaseSpeed
 * and attackColor from its speed and color unless set.
 * @param {object} values
 */
export function withEnemyDefaults(values) {
  const out = { ...ENEMY_DEFAULTS, ...values };
  out.chaseSpeed ??= out.speed;
  out.attackColor ??= out.color;
  return out;
}

/**
 * Enemy types with templates filled in (D58): a type with `extends` (a
 * template, e.g. a tougher bug saved from the room editor) takes its base
 * type's values, then its own. One level: a base type has no `extends`.
 * @param {Record<string, object>} types defs.json `enemies`
 * @returns {Record<string, object>} every type with all its values (no `extends`)
 */
export function resolveEnemyTypes(types) {
  const out = {};
  for (const [id, { extends: base, ...own }] of Object.entries(types)) {
    const { extends: _, ...baseValues } = (base && types[base]) || {};
    out[id] = { ...baseValues, ...own };
  }
  return out;
}

/**
 * Block types (D60) with variants filled in from their base type: each
 * gets its `id`, the base's values, then its own. `static` tells blocks
 * that live in the room grid (a look) from those that run as room objects
 * (a kind, e.g. collapsing).
 * @param {Record<string, object>} types defs.json `blocks`
 * @returns {Record<string, { id: string, static: boolean, look?: string, kind?: string, color?: string, damage?: number, lethal?: boolean, regrow?: number }>}
 */
export function resolveBlockTypes(types) {
  const out = {};
  for (const [id, { extends: base, ...own }] of Object.entries(types)) {
    const { extends: _, ...baseValues } = (base && types[base]) || {};
    const type = { ...baseValues, ...own, id };
    out[id] = { ...type, static: type.kind === undefined };
  }
  return out;
}

/** Values only static block types take, and only object kinds take (D60). */
export const STATIC_BLOCK_VALUES = ['look', 'damage', 'lethal'];
export const KIND_BLOCK_VALUES = ['kind', 'regrow', 'edges', 'mark', 'faces', 'tint'];

/**
 * The base type of each enemy type: its own id, or a template's base (the
 * room editor names it next to a template).
 * @param {Record<string, object>} types defs.json `enemies`
 * @returns {Record<string, string>}
 */
export function enemyBases(types) {
  return Object.fromEntries(Object.entries(types).map(([id, type]) => [id, type.extends ?? id]));
}

/**
 * Every floor tile a hole entry covers: just `at`, or the rectangle from
 * `at` to `to` (inclusive).
 * @param {{ at: number[], to?: number[] }} hole
 * @returns {number[][]} tiles as [x, z]
 */
export function holeTiles({ at, to = at }) {
  const tiles = [];
  for (let x = at[0]; x <= to[0]; x++) for (let z = at[1]; z <= to[1]; z++) tiles.push([x, z]);
  return tiles;
}
