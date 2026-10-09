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

/**
 * The conditions of an exit's `requires` list (D151) as the fields the rest
 * of the code reads: `locked` and `switches` (a switch lock: the listed
 * switch ids, or every switch in the room for "*") and `access` (the level
 * he needs, D101). One entry per switch; the exit opens when all hold.
 * @param {({ switch: string } | { access: number })[]} [requires]
 * @returns {{ locked?: true, switches?: string[], access?: number }}
 */
export function expandRequires(requires = []) {
  const out = {};
  for (const need of requires) {
    if ('access' in need) out.access = need.access;
    else if (need.switch === '*') out.locked = true;
    else {
      out.locked = true;
      (out.switches ??= []).push(need.switch);
    }
  }
  return out;
}

/**
 * The inverse of expandRequires(): the `requires` list for a switch lock
 * (`locked`, with its `switches` or every switch in the room) and an access
 * level, `undefined` when the exit asks for nothing.
 * @param {{ locked?: boolean, switches?: string[], access?: number }} fields
 */
export function requiresOf({ locked, switches, access }) {
  const requires = [];
  if (locked) requires.push(...(switches?.length > 0 ? switches.map((id) => ({ switch: id })) : [{ switch: '*' }]));
  if (access) requires.push({ access });
  return requires.length > 0 ? requires : undefined;
}

/**
 * An exit from a room file with its defaults and its `requires` list
 * expanded into `locked`, `switches` and `access` (see expandRequires());
 * everything but the room files reads exits in this shape.
 * @param {object} exit exit from a room file
 */
export function withExitDefaults(exit) {
  const { requires, ...rest } = exit;
  return { ...EXIT_DEFAULTS, ...rest, ...(requires && expandRequires(requires)) };
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
  faces: ['dark', 'tinted', 'hazard', 'glass'],
  shape: ['cube', 'spiked'],
  vents: ['none', 'aurora'],
};

/** Style defaults: the first value of each OBJECT_STYLES list, plus the tint. */
export const OBJECT_STYLE_DEFAULTS = {
  // (Vents, D199, are a look only a few objects have: no default, the view reads "none".)
  ...Object.fromEntries(Object.entries(OBJECT_STYLES).filter(([key]) => key !== 'vents').map(([key, values]) => [key, values[0]])),
  /** With tinted faces: share of the object color in the top face (0–1); sides get less. */
  tint: 0.1,
};

/**
 * Decorations (kind "deco", D117): each look's size in cells [x, y, z]; it
 * fills them all as a fixed body. The look itself is drawn by
 * render/deco-view.js.
 */
export const DECO_LOOKS = {
  data_pillar: { size: [1, 3, 1] },
  screen: { size: [1, 1, 1] },
  memory_stack: { size: [1, 1, 1] },
};

/** The ways a decoration can face: the two sides the camera sees (D115); the first is the default. */
export const DECO_FACES = ['+z', '+x'];

/**
 * An object type with its defaults filled in: the style defaults, and a
 * decoration's face. Room objects override any of it.
 * @param {object} type object type from defs.json
 */
export function withObjectDefaults(type) {
  return { ...OBJECT_STYLE_DEFAULTS, ...(type.kind === 'deco' && { face: DECO_FACES[0] }), ...type };
}

/**
 * Values an enemy template's fields can take (the first is listed first in the
 * schema too). Enemies are universal (D78): any look, movement and attack
 * combine. look: its body (render/entity-view.js ENEMY_MODELS); movement:
 * a behavior module (ai/behaviors.js); attack: how it hurts (touch: touching
 * it; burst, arc and bolt: charged attacks, CHARGED_ATTACKS; none: never);
 * hostility: hostile hurts, peaceful never does, provoked turns hostile once
 * a spell, a discharge or a bolt hits it; boltPattern: a bolt attack's
 * shots, one aimed at the wizard or four along the grid axes (D81).
 */
export const ENEMY_OPTIONS = {
  look: ['bug', 'virus', 'sentinel', 'cron', 'worm', 'crawler', 'warden', 'daemon', 'golem', 'wyrm', 'phish', 'overclock', 'pixie'],
  movement: ['patrol', 'stationary', 'chase'],
  attack: ['touch', 'burst', 'arc', 'bolt', 'none'],
  hostility: ['hostile', 'peaceful', 'provoked'],
  boltPattern: ['aimed', 'cross'],
};

/**
 * The discharge attacks (D78): charged lightning all round it (burst) or
 * one bolt of lightning aimed at the wizard (arc).
 */
export const DISCHARGES = ['burst', 'arc'];

/**
 * The charged attacks (D78, D80): the discharges and the bolt, a slow shot
 * flying at the wizard (entities/bolt.js). Seeing him within attackRange,
 * the enemy stops, charges for attackCharge, fires and cools down for
 * attackCooldown; attackColor colors the lightning or the shot.
 */
export const CHARGED_ATTACKS = [...DISCHARGES, 'bolt'];

/**
 * Enemy template fields that may be left out: aggro range (units), bounce (a
 * trampoline top), solid (blocks, carries and shoves the wizard), pausable
 * (Pause freezes it, D85), memory
 * (seconds a chaser searches after losing sight of him), a charged attack's
 * range (units), charge and cooldown (seconds), and a bolt attack's speed
 * (units per second), pattern and bounces (D81), and its hitbox height
 * (units; a boss may stand up to two cubes high, D134). chaseSpeed and attackColor
 * default to the enemy's speed and color (withEnemyDefaults()).
 */
export const ENEMY_DEFAULTS = {
  aggroRange: 0,
  bounce: false,
  solid: false,
  pausable: true,
  memory: 1.5,
  attackRange: 1.2,
  attackCharge: 0.4,
  attackCooldown: 1.5,
  boltSpeed: 4,
  boltPattern: 'aimed',
  boltBounces: 0,
  height: 0.6,
};

/**
 * Bosses (D104, D134, D135): a template with a `boss` block. Its phases
 * start as its integrity drops (`from`: the share of its integrity at or
 * below which one starts; the first has 1) and change how it fights: any
 * of BOSS_PHASE_FIELDS, `teleport` (seconds between jumps to another cell
 * of its arena) among them. `armor: "plate"`: spells only hurt it while it
 * stands on a floor plate (D75). Pause never freezes a boss, Pull never
 * drags one; a room gives it the pickup it drops (`drop`).
 */
export const BOSS_PHASE_FIELDS = [
  'movement',
  'attack',
  'boltPattern',
  'speed',
  'chaseSpeed',
  'aggroRange',
  'attackRange',
  'attackCharge',
  'attackCooldown',
  'boltSpeed',
  'boltBounces',
  'damage',
  'teleport',
];

/** What a boss's armor can be (D135): none, or open only on a floor plate. */
export const BOSS_ARMOR = ['none', 'plate'];

/** Integrity of an ordinary enemy at most; only a boss takes more (D135). */
export const ENEMY_MAX_INTEGRITY = 15;

/**
 * Its values in each of its phases: the template's (filled in), then the
 * phase's own; a template without a `boss` block has one phase.
 * @param {object} values an enemy's values, filled in (withEnemyDefaults())
 * @returns {object[]}
 */
export function bossPhases(values) {
  const phases = values.boss?.phases ?? [{ from: 1 }];
  return phases.map(({ from, ...own }) => ({ ...values, ...own }));
}

/** Enemy template fields every template needs, its own or from the ones it extends (as in the schema). */
export const ENEMY_REQUIRED = ['look', 'movement', 'attack', 'hostility', 'integrity', 'damage', 'speed', 'color'];

/**
 * An enemy's values with every default filled in: ENEMY_DEFAULTS, then
 * `values` (a template, filled in from the ones it extends), then chaseSpeed
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
 * Enemy templates filled in (D58, D79): one with `extends` takes the values
 * of the template it builds on (filled in the same way, down the chain),
 * then its own. A loop or an unknown template ends the chain (validation
 * reports both).
 * @param {Record<string, object>} templates defs.json `enemies`
 * @returns {Record<string, object>} every template with all its values (no `extends`)
 */
export function resolveEnemyTemplates(templates) {
  const out = {};
  const resolve = (id, seen) => {
    if (out[id]) return out[id];
    const { extends: parent, ...own } = templates[id];
    seen.add(id);
    const inherited = parent && templates[parent] && !seen.has(parent) ? resolve(parent, seen) : {};
    return (out[id] = { ...inherited, ...own });
  };
  for (const id of Object.keys(templates)) resolve(id, new Set());
  return out;
}

/**
 * The chain of templates `id` builds on: itself, what it extends, and so
 * on, as far as it goes (it stops before an unknown template or a loop).
 * @param {Record<string, object>} templates defs.json `enemies`
 * @param {string} id
 * @returns {{ chain: string[], loop: boolean, unknown: string|null }}
 */
export function templateChain(templates, id) {
  const chain = [];
  for (let at = id; at !== undefined; at = templates[at].extends) {
    if (chain.includes(at)) return { chain, loop: true, unknown: null };
    if (!templates[at]) return { chain, loop: false, unknown: at };
    chain.push(at);
  }
  return { chain, loop: false, unknown: null };
}

/**
 * Block types (D60) with variants filled in from their base type: each
 * gets its `id`, the base's values, then its own. `static` tells blocks
 * that live in the room grid (a look) from those that run as room objects
 * (a kind: a gate, collapsing ones too, D141).
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

/**
 * Object types (D145) with variants filled in from their base type: the
 * base's values, then the variant's own (one level, like block types).
 * @param {Record<string, object>} types defs.json `objects`
 * @returns {Record<string, { kind: string, color?: string }>}
 */
export function resolveObjectTypes(types) {
  const out = {};
  for (const [id, { extends: base, ...own }] of Object.entries(types)) {
    const { extends: _, ...baseValues } = (base && types[base]) || {};
    out[id] = { ...baseValues, ...own };
  }
  return out;
}

/** Values only static block types take, and only object kinds take (D60). */
export const STATIC_BLOCK_VALUES = ['look', 'damage', 'lethal', 'fake', 'seeThrough', 'passes'];
export const KIND_BLOCK_VALUES = ['kind', 'trigger', 'start', 'regrow', 'edges', 'mark', 'faces', 'tint'];

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
