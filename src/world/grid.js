/**
 * Occupancy grid of a runtime room: what fills each unit cell, and which
 * floor tiles are holes.
 *
 * Solid are static block cells and everything outside the room's side
 * walls and below the floor, except the openings of exits (the row of
 * cells just beyond the side, so the wizard can walk through). Above the
 * room height is open (a jump at the top of a 6-high room must not bump
 * into nothing).
 * Only blocks that never move or change live in the grid (static block
 * types, D60). Pushables, moving platforms and collapsing blocks are room
 * objects that collide as bodies (see physics/collision.js, D40).
 *
 * Collision asks isSolid() many times per tick, so cells are one flat typed
 * array covering the room plus a one-cell ring around its sides (where exit
 * openings are), not string-keyed sets. Each cell holds a code: 0 empty,
 * 1 the room's edge (outside the sides, below the floor), from 2 on a
 * static block type; typeAt() gives the type with its properties (damage,
 * lethal), so game rules ask about properties, never type names (D60).
 * A see-through type (a fence, D167) is solid to bodies but lets bolts
 * and sight through (blocksSight()).
 * A type with `passes` (the crate stream, D198) is solid to every kind of
 * body but those it names: forBody() gives the grid as a kind of body sees
 * it. isSolid() itself is the wizard's and the active enemies' view.
 */
import { exitCells } from '../data/room-data.js';

/** Cell codes that aren't a block type from the room's data. */
export const CELL = { empty: 0, edge: 1 };

/** What typeAt() returns beyond the room's sides and below its floor: solid, nothing else. */
export const EDGE_TYPE = Object.freeze({ id: 'edge', static: true, look: 'plain' });

export class Grid {
  /**
   * @param {object} room runtime room (see world/room.js)
   * @param {number[]} room.size [x, y, z]
   * @param {Record<string, number[][]>} room.blocks static block cells [x, y, z], by block type
   * @param {Record<string, object>} room.blockTypes block types (resolved), by id
   * @param {number[][]} room.holes hole tiles [x, z]
   * @param {object[]} [room.exits] exits with defaults applied
   */
  constructor({ size, blocks, blockTypes, holes, exits = [] }) {
    this.size = size;
    [this.w, this.h, this.d] = size;
    const { w, h, d } = this;

    /** Block type of each cell code: [empty, edge, ...the room's static types]. */
    this.types = [null, EDGE_TYPE];
    /** Cell codes, for x in −1..w, y in 0..h−1, z in −1..d (see index()). */
    this.cells = new Uint8Array((w + 2) * h * (d + 2));
    for (let y = 0; y < h; y++) {
      for (let x = -1; x <= w; x++) {
        for (let z = -1; z <= d; z++) if (!this.isInside(x, z)) this.cells[this.index(x, y, z)] = CELL.edge;
      }
    }
    for (const exit of exits) {
      for (const [x, y, z] of exitCells(exit, size).outside) if (y >= 0 && y < h) this.cells[this.index(x, y, z)] = CELL.empty;
    }
    for (const [id, list] of Object.entries(blocks)) {
      const code = this.types.push(blockTypes[id]) - 1;
      for (const [x, y, z] of list) {
        if (!this.isInside(x, z) || y < 0 || y >= h) continue;
        this.cells[this.index(x, y, z)] = code;
        // A field that only some bodies pass has no top to stand on or climb
        // over: for the rest it reaches up to the ceiling (D198).
        if (blockTypes[id].passes) for (let above = y + 1; above < h; above++) this.cells[this.index(x, above, z)] ||= code;
      }
    }
    /** The grid as each kind of body sees it, made when first asked for (forBody()). */
    this.views = new Map();

    /** Floor tiles: 1 where there is a hole, index z * w + x. */
    this.holes = new Uint8Array(w * d);
    for (const [x, z] of holes) if (this.isInside(x, z)) this.holes[z * w + x] = 1;
  }

  /** Index into `cells` of a cell within the room or its ring. */
  index(x, y, z) {
    return (y * (this.d + 2) + z + 1) * (this.w + 2) + x + 1;
  }

  /**
   * What fills the cell with integer coordinates [x, y, z]: a cell code
   * (CELL.empty, CELL.edge, or a block type's). Below the floor and beyond
   * the sides (except exit openings) is the edge.
   */
  cellAt(x, y, z) {
    if (y < 0 || x < -1 || z < -1 || x > this.w || z > this.d) return CELL.edge;
    if (y >= this.h) return this.isInside(x, z) ? CELL.empty : CELL.edge;
    return this.cells[this.index(x, y, z)];
  }

  /**
   * The block type filling the cell [x, y, z] (integers), with its
   * properties (damage, lethal...): EDGE_TYPE outside the room, null if empty.
   */
  typeAt(x, y, z) {
    return this.types[this.cellAt(x, y, z)];
  }

  /** Is the cell with integer coordinates [x, y, z] solid? */
  isSolid(x, y, z) {
    return this.cellAt(x, y, z) !== CELL.empty;
  }

  /**
   * Does the cell [x, y, z] (integers) stop bolts and sight: solid, and not
   * a see-through block type (a fence, D167)?
   */
  blocksSight(x, y, z) {
    const code = this.cellAt(x, y, z);
    return code !== CELL.empty && !this.types[code].seeThrough;
  }

  /**
   * The grid as a kind of body sees it: the same cells, but those of a type
   * that `passes` the kind are open. Kinds: 'wizard' (also the decoy and
   * active enemies, who have the grid as it is) and 'crate' (crates and
   * frozen enemies, which push like crates). Pass it where the collision
   * functions take a grid.
   * @param {'wizard'|'crate'} kind
   * @returns {Grid}
   */
  forBody(kind) {
    if (!this.types.some((type) => type?.passes?.includes(kind))) return this;
    let view = this.views.get(kind);
    if (!view) {
      const open = this.types.map((type) => Boolean(type?.passes?.includes(kind)));
      view = Object.create(this);
      view.isSolid = (x, y, z) => {
        const code = this.cellAt(x, y, z);
        return code !== CELL.empty && !open[code];
      };
      this.views.set(kind, view);
    }
    return view;
  }

  /** Is the column [x, z] (integers) inside the room's sides? */
  isInside(x, z) {
    return x >= 0 && z >= 0 && x < this.w && z < this.d;
  }

  /** Is the floor tile containing the point (x, z) a hole? */
  isHole(x, z) {
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    return this.isInside(tx, tz) && this.holes[tz * this.w + tx] === 1;
  }

  /**
   * Open or close an exit's opening (a locked exit, D75): closed, its row
   * of cells beyond the side is solid like the rest of the room's edge.
   * @param {object} exit exit with defaults applied
   * @param {boolean} open
   */
  setOpening(exit, open) {
    for (const [x, y, z] of exitCells(exit, this.size).outside) {
      if (y >= 0 && y < this.h) this.cells[this.index(x, y, z)] = open ? CELL.empty : CELL.edge;
    }
  }

  /** The static block in the cell [x, y, z] is gone (a fake block a scan revealed, D128): empty. */
  clearCell(x, y, z) {
    if (this.isInside(x, z) && y >= 0 && y < this.h) this.cells[this.index(x, y, z)] = CELL.empty;
  }

  /** A block dropped into the hole tile [x, z]: it is floor from now on (D18). */
  fillHole(x, z) {
    if (this.isInside(x, z)) this.holes[z * this.w + x] = 0;
  }

  /** The block plugging the hole tile [x, z] is gone (a compiled crate derezzed, D125): a hole again. */
  openHole(x, z) {
    if (this.isInside(x, z)) this.holes[z * this.w + x] = 1;
  }
}
