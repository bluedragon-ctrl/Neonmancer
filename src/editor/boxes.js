/**
 * Box entries of room data (`blocks`, `holes`: `{ at, to }`) edited cell by
 * cell. Entries nobody touched are kept as they were, in their order, so a
 * saved room's diff shows only what changed; an entry with an edited cell
 * falls apart into loose cells, and loose cells are merged into as few
 * boxes as a greedy pass finds when the list is written back.
 */
import { cellKey } from '../data/room-data.js';

/** Axes a merged box grows along, in order: x, then z, then y (tiles: x, then z). */
const GROW_ORDER = { 3: [0, 2, 1], 2: [0, 1] };

/** Cells from `lo` to `hi` (inclusive), in 2 or 3 dimensions. */
export function boxCells(lo, hi) {
  const cells = [[]];
  lo.forEach((from, axis) => {
    const next = [];
    for (const cell of cells) for (let v = from; v <= hi[axis]; v++) next.push([...cell, v]);
    cells.splice(0, cells.length, ...next);
  });
  return cells;
}

export class Boxes {
  /**
   * @param {{ at: number[], to?: number[], type?: string }[]} entries from room data
   * @param {object} options
   * @param {number} options.dims 3 for blocks [x, y, z], 2 for hole tiles [x, z]
   * @param {string} options.defaultType type of an entry without "type"
   *   (written without it): "block" for blocks; holes have only "hole"
   */
  constructor(entries, { dims, defaultType }) {
    this.dims = dims;
    this.defaultType = defaultType;
    /** Untouched entries: { entry, type, keys }. */
    this.entries = entries.map((entry) => ({
      entry: structuredClone(entry),
      type: entry.type ?? defaultType,
      keys: new Set(boxCells(entry.at, entry.to ?? entry.at).map(cellKey)),
    }));
    /** Loose cells: key → { cell, type }. */
    this.loose = new Map();
  }

  /** Type at a cell ("block", "hazard", "void", or "hole"), or null. */
  get(cell) {
    const key = cellKey(cell);
    if (this.loose.has(key)) return this.loose.get(key).type;
    return this.entries.find(({ keys }) => keys.has(key))?.type ?? null;
  }

  /**
   * Fill a cell with `type`, or empty it (null).
   * @returns {boolean} whether anything changed
   */
  set(cell, type) {
    if (this.get(cell) === type) return false;
    const key = cellKey(cell);
    this.dissolve((keys) => keys.has(key));
    if (type === null) this.loose.delete(key);
    else this.loose.set(key, { cell: [...cell], type });
    return true;
  }

  /**
   * Drop every cell outside `limits` (exclusive upper bounds, per axis).
   * @returns {boolean} whether anything was dropped
   */
  clip(limits) {
    const outside = (cell) => cell.some((v, axis) => v >= limits[axis]);
    const had = this.cells().length;
    this.dissolve((keys, entry) => outside(entry.to ?? entry.at));
    for (const [key, { cell }] of this.loose) if (outside(cell)) this.loose.delete(key);
    return this.cells().length !== had;
  }

  /** Every filled cell: { cell, type }. */
  cells() {
    const all = [...this.loose.values()];
    for (const { entry, type } of this.entries) {
      for (const cell of boxCells(entry.at, entry.to ?? entry.at)) all.push({ cell, type });
    }
    return all;
  }

  /** Break the entries matching `test` into loose cells. */
  dissolve(test) {
    this.entries = this.entries.filter(({ entry, type, keys }) => {
      if (!test(keys, entry)) return true;
      for (const cell of boxCells(entry.at, entry.to ?? entry.at)) this.loose.set(cellKey(cell), { cell, type });
      return false;
    });
  }

  /** The entries for room data: the untouched ones, then the loose cells merged into boxes. */
  list() {
    return [...this.entries.map(({ entry }) => structuredClone(entry)), ...this.merged()];
  }

  /** Loose cells merged greedily into boxes, per type. */
  merged() {
    const grow = GROW_ORDER[this.dims];
    // Visit cells in the reverse of the grow order (y, z, x), so each box starts at its low corner.
    const order = [...grow].reverse();
    const cells = [...this.loose.values()].sort((a, b) => {
      for (const axis of order) if (a.cell[axis] !== b.cell[axis]) return a.cell[axis] - b.cell[axis];
      return 0;
    });
    const used = new Set();
    const free = (cell, type) => !used.has(cellKey(cell)) && this.loose.get(cellKey(cell))?.type === type;
    const out = [];
    for (const { cell, type } of cells) {
      if (used.has(cellKey(cell))) continue;
      const hi = [...cell];
      for (const axis of grow) {
        for (;;) {
          const lo = [...cell];
          lo[axis] = hi[axis] + 1;
          const next = [...hi];
          next[axis] = hi[axis] + 1;
          if (!boxCells(lo, next).every((c) => free(c, type))) break;
          hi[axis]++;
        }
      }
      for (const c of boxCells(cell, hi)) used.add(cellKey(c));
      out.push({
        ...(type !== this.defaultType && { type }),
        at: [...cell],
        ...(hi.some((v, axis) => v !== cell[axis]) && { to: hi }),
      });
    }
    return out;
  }
}
