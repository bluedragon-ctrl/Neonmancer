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
  const [outer, inner] = side.startsWith('-') ? [-1, 0] : [last + 1, last];
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
  mark: ['none', 'inset', 'cross', 'brackets'],
  faces: ['dark', 'tinted'],
};

/** Style defaults: the first value of each OBJECT_STYLES list, plus the tint. */
export const OBJECT_STYLE_DEFAULTS = {
  ...Object.fromEntries(Object.entries(OBJECT_STYLES).map(([key, values]) => [key, values[0]])),
  /** With tinted faces: share of the object color in the top face (0–1); sides get less. */
  tint: 0.1,
};

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
