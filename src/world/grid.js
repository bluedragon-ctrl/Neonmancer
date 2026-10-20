/**
 * Occupancy grid of a runtime room: what fills each unit cell, and which
 * floor tiles are holes.
 *
 * Solid are static block cells and everything outside the room's side
 * walls and below the floor, except the openings of exits (the row of
 * cells just beyond the side, so the wizard can walk through). Above the
 * room height is open (a throw at the top of a 6-high room must not bump
 * into nothing).
 * Only blocks that never move or change live in the grid (static block
 * types, D60). Pushables, moving platforms and collapsing blocks are room
 * objects that collide as bodies (see physics/collision.js, D40).
 *
 * Collision asks isSolid() many times per tick, so cells are one flat typed
 * array covering the room plus a one-cell ring around its sides (where exit
 * openings are), not string-keyed sets. Each cell holds a code: 0 empty,
 * 1 the room's edge (outside the sides, below the floor), from 2 on a
 * static block type; typeAt() gives the type with its properties (fake,
 * seeThrough), so game rules ask about properties, never type names (D60).
 * A see-through type (a fence, D167) is solid to bodies but lets bolts
 * and sight through (blocksSight()).
 * A type with `passes` (the crate stream, D198; the bollard, D276) is solid
 * to every kind of body but those it names: forBody() gives the grid as a
 * kind of body sees it. isSolid() itself is the grid with every such type
 * solid.
 *
 * Two looks fill only part of their cell (D221), for movers that ask
 * span(): a stair is a slope rising across the cell the way of its
 * `rise`, a slab a thin walkway at the top of its cell, with room under
 * it. isSolid() still says the whole cell, so crates, enemies and the
 * reachability checker treat them as blocks.
 */
import { exitCells } from '../data/room-data.js';

/** Cell codes that aren't a block type from the room's data. */
export const CELL = { empty: 0, edge: 1 };

/**
 * How thick a slab is (D221): a single sheet of glass. Under one a cell up
 * the wizard (1.5 high) walks upright; he is taller than a tick's fall, so
 * he never drops through it.
 */
export const SLAB_HEIGHT = 0.04;

/** A stair's `rise` (the way it climbs, D221) as [axis, sign]. */
export const RISES = { '+x': [0, 1], '-x': [0, -1], '+z': [2, 1], '-z': [2, -1] };

/** What part of its cell a block type fills (D221): null for the whole cell. A stair's `step` is its rise as [dx, dz]. */
function shapeOf(type) {
  if (type?.look === 'stair') {
    const [axis, sign] = RISES[type.rise];
    return { rise: [axis, sign], step: axis === 0 ? [sign, 0] : [0, sign] };
  }
  if (type?.look === 'slab') return { bottom: 1 - SLAB_HEIGHT };
  return null;
}

/** What typeAt() returns beyond the room's sides and below its floor: solid, nothing else. */
export const EDGE_TYPE = Object.freeze({ id: 'edge', static: true, look: 'plain' });

/**
 * How far up a body is on a stair move (D230, Grid.stairStep()), `walked`
 * (0..1) of the way from its cell to the cell beyond the stair: going up
 * it climbs over the first half (onto the stair's cell) and walks level
 * onto the top in the second; going down the other way round. A whole
 * cell wide body (a crate) rests on the slope all the way.
 * @param {number} rise 1 up, −1 down
 * @param {number} walked
 * @returns {number} height above (up) or below (down) where it started
 */
export function stairHeight(rise, walked) {
  return rise > 0 ? Math.min(1, 2 * walked) : -Math.max(0, 2 * walked - 1);
}

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
    /** What part of its cell each cell code fills (D221): null for the whole cell. */
    this.shapes = this.types.map(shapeOf);
    /** Does any cell fill only part of itself (a stair or a slab)? Collision asks span() only then. */
    this.shaped = this.shapes.some(Boolean);
    /** The grid as each kind of body sees it, made when first asked for (forBody()). */
    this.views = new Map();

    /** Floor tiles: 1 where there is a hole, index z * w + x. */
    this.holes = new Uint8Array(w * d);
    /** Floor tiles a bridge's sheet covers while it is there (D224): 1 where one does. */
    this.covers = new Uint8Array(w * d);
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
   * properties (seeThrough, passes...): EDGE_TYPE outside the room, null if empty.
   */
  typeAt(x, y, z) {
    return this.types[this.cellAt(x, y, z)];
  }

  /** Is the cell with integer coordinates [x, y, z] solid? */
  isSolid(x, y, z) {
    return this.cellAt(x, y, z) !== CELL.empty;
  }

  /**
   * The heights [bottom, top] a solid cell [x, y, z] fills under `box`
   * (D221): the whole cell for a block; a slab only its top SLAB_HEIGHT; a
   * stair from its foot up to its slope's highest point under the box's
   * footprint, so a box standing on it rests on its front edge.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number[][]} box the mover's box (physics/collision.js bodyBox())
   * @returns {number[]}
   */
  span(x, y, z, box) {
    const shape = this.shapes[this.cellAt(x, y, z)];
    if (!shape) return [y, y + 1];
    if (shape.bottom !== undefined) return [y + shape.bottom, y + 1];
    const [axis, sign] = shape.rise;
    const start = axis === 0 ? x : z;
    const reach = sign > 0 ? box[axis][1] - start : start + 1 - box[axis][0];
    return [y, y + Math.min(1, Math.max(0, reach))];
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
   * that `passes` the kind are open. Kinds: 'wizard' (he, his decoy, his
   * Blink and Warp), 'enemy' (active enemies) and 'crate' (crates and
   * frozen enemies, which push like crates). Pass it where the collision
   * functions take a grid.
   * @param {'wizard'|'enemy'|'crate'} kind
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

  /**
   * The grid with every stair and slab a whole block (D230): what an enemy
   * stands on. Its box is narrower than a cell, so on a stair's slope it
   * would rest between whole heights; as a block it stands on the top.
   * Made when first asked for, on each view (forBody()) on its own.
   * @returns {Grid}
   */
  asBlocks() {
    if (!this.shaped) return this;
    if (!Object.hasOwn(this, 'blockView')) {
      this.blockView = Object.create(this);
      this.blockView.shaped = false;
    }
    return this.blockView;
  }

  /** The way the stair in the cell [x, y, z] rises, as [dx, dz], or null if no stair is there. */
  stairAt(x, y, z) {
    return this.shapes[this.cellAt(x, y, z)]?.step ?? null;
  }

  /**
   * Where a body a cell wide (a crate, an enemy) goes stepping from the
   * cell [x, y, z] along [dx, dz] (D230): into the next cell, level; or by
   * a stair, the way it rises from its foot or down it from its top, two
   * cells on and a block up or down (`rise`), passing over the stair's
   * cell (`via`, which must be free too). Null when the next cell is a
   * stair entered from its side or back, or a stair's top entered other
   * than down it: such a body never rests on a stair. Whether the cells
   * are free is the caller's to ask, of its own view of the grid.
   * Pushed or pulled (`climbs` false: crates, frozen enemies, Pull) a body
   * only goes down a stair: to it a stair's foot is a wall (D230).
   * @param {boolean} [climbs] can it go up a stair (an enemy walking)?
   * @returns {{ to: number[], via: number[]|null, rise: number }|null}
   */
  stairStep(x, y, z, dx, dz, climbs = true) {
    const nx = x + dx;
    const nz = z + dz;
    const up = this.stairAt(nx, y, nz);
    if (up) return climbs && up[0] === dx && up[1] === dz ? { to: [nx + dx, y + 1, nz + dz], via: [nx, y + 1, nz], rise: 1 } : null;
    const down = y > 0 ? this.stairAt(nx, y - 1, nz) : null;
    if (down) return down[0] === -dx && down[1] === -dz ? { to: [nx + dx, y - 1, nz + dz], via: [nx, y, nz], rise: -1 } : null;
    return { to: [nx, y, nz], via: null, rise: 0 };
  }

  /** Is the column [x, z] (integers) inside the room's sides? */
  isInside(x, z) {
    return x >= 0 && z >= 0 && x < this.w && z < this.d;
  }

  /** Is the floor tile containing the point (x, z) a hole? */
  isHole(x, z) {
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    return this.isInside(tx, tz) && this.holes[tz * this.w + tx] === 1 && this.covers[tz * this.w + tx] === 0;
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

  /**
   * A bridge's sheet over the tile [x, z] is there or gone (D224): while
   * there a hole under it is floor, after that a hole again (a crate that
   * plugged it meanwhile keeps it floor).
   * @param {boolean} on
   */
  coverHole(x, z, on) {
    if (this.isInside(x, z)) this.covers[z * this.w + x] = on ? 1 : 0;
  }
}
