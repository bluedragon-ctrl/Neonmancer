/**
 * Small helpers for reading room data, shared by the validator and the room
 * builder so both interpret the data the same way.
 */

/** Values used when an exit leaves them out (same as the schema defaults). */
export const EXIT_DEFAULTS = { width: 2, y: 0, height: 2 };

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
 * Optional look of an object type, so types differ by more than color
 * (readable in grayscale and for color-blind players). The first value of
 * each list is the default.
 */
export const OBJECT_STYLES = {
  edges: ['solid', 'dashed'],
  mark: ['none', 'inset', 'cross', 'brackets'],
  faces: ['dark', 'tinted'],
};

/** Style defaults: the first value of each OBJECT_STYLES list, plus the tint. */
export const OBJECT_STYLE_DEFAULTS = {
  ...Object.fromEntries(Object.entries(OBJECT_STYLES).map(([key, values]) => [key, values[0]])),
  /** With tinted faces: share of the object color in the top face (0–1); sides get less. */
  tint: 0.1,
};
