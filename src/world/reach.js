/**
 * Reachability of one room (D131; plain logic, no browser): where the
 * wizard can get with the abilities he has, and so which exits and pickups
 * he can reach. The world level (reach-world.js) chains rooms with it.
 *
 * It works on whole cells, not on physics: a standing cell is a cell with
 * two free cells above it and a solid floor under it; from one the wizard
 * walks to the four neighbours, steps off ledges, jumps up one block or
 * over a one-tile gap, and with abilities does more (see MOVES). The
 * numbers come from the tuning tables (`PLAYER`, `WARP`) and the design
 * checklist (docs/design.md); keep them in step.
 *
 * Pushable crates are searched as a puzzle: every position the crates can
 * be pushed (or pulled, or cut and pasted) into is a configuration, each
 * with its own flood; a configuration is the crates plus the holes they
 * plugged. The search is cut off at MAX_CONFIGS configurations. A room
 * resets on death, so what he can reach in any configuration counts, but
 * what needs two things at once (a locked exit open and the way to it)
 * is judged inside one configuration.
 *
 * Switches (D140): a locked exit or a gate is powered in a configuration
 * when its switches can all be on: a target with Zap, a plate with a crate
 * on it or a spell that puts a body there, a timed plate also under the
 * wizard himself (he runs on while it counts down), a socket (D194) with
 * its hole plugged by a crate (or a compiled or pasted crate beside it).
 * A gate that can be both closed and open there counts as both: never in
 * the way, and floor to stand on.
 *
 * Pause (D85, D155): a frozen enemy is a 1×1×1 block he can stand on, so
 * with the spell every cell a pausable (non-boss) enemy walks counts as
 * floor along its whole path, like a platform's (optimistic). He pushes it
 * like a crate (D154, D166): from where he stands, level, into a free
 * cell; it falls off a ledge and pops on a hole, hazard or void. Every cell
 * it can be pushed to is floor too and weight for a plate there; as a step
 * one enemy may count in several cells at once (optimistic, like the
 * timing), but it holds one plate at most.
 *
 * What it knows nothing about, on purpose: enemies and their fire (combat
 * is a different check), timing (collapsing blocks, platforms waiting,
 * spell durations, how long a timed switch stays on), energy, and which
 * way he faces. Moving platforms
 * count as floor along their whole path and crates compiled by a spell
 * last as long as needed. So it errs towards "reachable": a verdict of
 * unreachable is a real problem, a verdict of reachable is not a promise.
 */
import { DECO_LOOKS, exitCells } from '../data/room-data.js';
import { Grid } from './grid.js';
import { pathCells } from './path.js';

/** The abilities the search knows how to use: spells by id, the double jump by its upgrade id. */
export const ABILITIES = ['double_jump', 'zap', 'scan', 'pull', 'compile', 'fork', 'cut_paste', 'blink', 'warp', 'pause'];

/**
 * Jump tuning in cells, from PLAYER (apex 1.2 above take-off, ~1.65 units of
 * air travel): a single jump clears one block and a one-tile gap; the
 * double jump (D95) adds a second jump at any time, so twice the height
 * and twice the gap.
 */
export const JUMP = {
  up: 1,
  gap: 1,
  doubleUp: 2,
  doubleGap: 2,
};

/** How far Blink goes, from defs.json; the search takes the spell's `range` from its `spells` when given. */
const BLINK_RANGE = 3;

/** Most crate configurations searched in one room. */
export const MAX_CONFIGS = 2000;

/** The four ways along the grid axes: [dx, dz]. */
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * @typedef {object} RoomReach
 * @property {Set<string>} pickups ids of the pickups he can touch
 * @property {Record<string, boolean>} exits by exit id: can he stand in its opening and is it open to him
 *   (a locked one needs its switches on in some configuration, a hidden one a scan; the access level is the world's business)
 * @property {boolean} core can he touch the core (when the room has one)
 * @property {Set<string>} stands cells he can stand on, "x,y,z" (all configurations)
 * @property {boolean} deadStart no start cell was safe to stand on (all of them hole, hazard or void)
 * @property {number} configs crate configurations searched
 * @property {boolean} truncated the search stopped at MAX_CONFIGS
 */

export class RoomModel {
  /**
   * @param {object} room runtime room (world/room.js buildRoom)
   * @param {Set<string>} abilities
   * @param {{ scanRange?: number, blinkRange?: number }} [tuning]
   */
  constructor(room, abilities, { scanRange = 6, blinkRange = BLINK_RANGE } = {}) {
    this.room = room;
    this.abilities = abilities;
    this.scanRange = scanRange;
    this.blinkRange = blinkRange;
    [this.w, this.h, this.d] = room.size;
    const doubleJump = abilities.has('double_jump');
    this.up = doubleJump ? JUMP.doubleUp : JUMP.up;
    this.gap = doubleJump ? JUMP.doubleGap : JUMP.gap;

    // A scan derezzes every fake block (optimistically: wherever he stands).
    const blocks = {};
    for (const [id, cells] of Object.entries(room.blocks)) if (!(abilities.has('scan') && room.blockTypes[id].fake)) blocks[id] = cells;
    this.grid = new Grid({ size: room.size, blocks, blockTypes: room.blockTypes, holes: room.holes });
    /** The grid as a crate sees it: a crate stream's cells are open (D198). */
    this.crateGrid = this.grid.forBody('crate');

    /** Cell indices of fixed bodies: they block, and he can stand on them. */
    this.bodies = new Set();
    /** Cell indices a moving platform passes: floor to stand on, never in the way (optimistic). */
    this.floors = new Set();
    /** The room's switches: targets, plates and sockets (D194). */
    this.switches = [];
    /** Gates (D140): cell index, startsGone (a bridge) and the switch ids that power it (null: all). */
    this.gates = [];
    /** Gate cells closed in the configuration searched now (setGates()). */
    this.gateSolid = new Set();
    /** Gate cells that can be closed or open there: floor, never in the way. */
    this.gateFloor = new Set();
    this.core = null;
    this.crates = [];
    /** Cells a pausable enemy can be frozen in (with Pause): steps, and weight for a plate; by cell index, which enemies (by number). */
    this.frozenCells = new Map();
    // Pause: the cells a pausable enemy can be frozen in are steps.
    if (abilities.has('pause'))
      (room.enemies ?? []).forEach((enemy, n) => {
        if (enemy.pausable === false || enemy.boss) return;
        for (const [px, py, pz] of enemy.path ? pathCells(enemy.at, enemy.path) : [enemy.at]) {
          const i = this.index(px, py, pz);
          this.floors.add(i);
          if (!this.frozenCells.has(i)) this.frozenCells.set(i, new Set());
          this.frozenCells.get(i).add(n);
        }
      });
    for (const object of room.objects) {
      const [x, y, z] = object.at;
      if (object.kind === 'pushable') this.crates.push(this.index(x, y, z));
      else if (object.kind === 'platform') for (const [px, py, pz] of pathCells(object.at, object.path)) this.floors.add(this.index(px, py, pz));
      else if (object.kind === 'plate' || object.kind === 'socket') this.switches.push(object);
      else if (object.kind === 'gate' && (object.trigger ?? 'switch') === 'switch') this.gates.push({ index: this.index(x, y, z), startsGone: object.start === 'gone', switches: object.switches ?? null });
      else if (object.kind === 'target') {
        this.switches.push(object);
        this.bodies.add(this.index(x, y, z));
      } else if (object.kind === 'core') {
        this.core = object;
        for (let dy = 0; dy < 2; dy++) this.bodies.add(this.index(x, y + dy, z));
      } else if (object.kind === 'deco') {
        const [sx, sy, sz] = DECO_LOOKS[object.look]?.size ?? [1, 1, 1];
        for (let dx = 0; dx < sx; dx++)
          for (let dy = 0; dy < sy; dy++) for (let dz = 0; dz < sz; dz++) this.bodies.add(this.index(x + dx, y + dy, z + dz));
      } else if (object.kind === 'gate') this.bodies.add(this.index(x, y, z)); // a step gate (collapsing block): timing is not checked
    }
    /** Floors and frozen cells before any push (spreadFrozen() adds to them per configuration). */
    this.baseFloors = new Set(this.floors);
    this.baseFrozen = this.frozenCells;
  }

  /** Forget the pushes of frozen enemies worked out for another configuration. */
  resetFrozen() {
    this.floors = new Set(this.baseFloors);
    this.frozenCells = new Map([...this.baseFrozen].map(([i, enemies]) => [i, new Set(enemies)]));
  }

  /**
   * Push frozen enemies (D166): from a cell he stands on, level, into a free
   * cell beyond; it falls and pops on a hole, hazard or void. Each cell it
   * comes to rest in is a frozen cell and floor.
   * @returns {boolean} whether any cell was added
   */
  spreadFrozen(cfg, stands) {
    let changed = false;
    const queue = [...this.frozenCells.keys()];
    while (queue.length > 0) {
      const from = queue.pop();
      const [x, y, z] = this.cell(from);
      for (const [dx, dz] of DIRS) {
        if (!this.grid.isInside(x - dx, z - dz) || !stands.has(this.index(x - dx, y, z - dz))) continue;
        const tx = x + dx;
        const tz = z + dz;
        if (!this.grid.isInside(tx, tz) || this.blockedCrate(tx, y, tz, cfg)) continue;
        let ty = y;
        let under = this.below(tx, ty, tz, cfg, true);
        while (under === 'air') under = this.below(tx, --ty, tz, cfg, true);
        if (under === 'hole' || under === 'bad') continue;
        const i = this.index(tx, ty, tz);
        if (!this.frozenCells.has(i)) this.frozenCells.set(i, new Set());
        const there = this.frozenCells.get(i);
        const before = there.size;
        for (const n of this.frozenCells.get(from)) there.add(n);
        if (there.size === before) continue;
        this.floors.add(i);
        queue.push(i);
        changed = true;
      }
    }
    return changed;
  }

  /** Index of a cell inside the room (y up to the room's height). */
  index(x, y, z) {
    return (y * this.d + z) * this.w + x;
  }

  /** [x, y, z] of an index. */
  cell(index) {
    const x = index % this.w;
    const rest = (index - x) / this.w;
    const z = rest % this.d;
    return [x, (rest - z) / this.d, z];
  }

  /** Is the cell blocked for his body: a block, a fixed body or a crate (cells above the room are open). */
  blocked(x, y, z, cfg) {
    return this.blockedIn(this.grid, x, y, z, cfg);
  }

  /** Is the cell blocked for a crate (or a frozen enemy pushed like one): the same, but a crate stream is open (D198)? */
  blockedCrate(x, y, z, cfg) {
    return this.blockedIn(this.crateGrid, x, y, z, cfg);
  }

  blockedIn(grid, x, y, z, cfg) {
    if (y < 0 || !grid.isInside(x, z)) return true;
    if (y >= this.h) return false;
    const i = this.index(x, y, z);
    return grid.isSolid(x, y, z) || this.bodies.has(i) || this.gateSolid.has(i) || cfg.crateSet.has(i);
  }

  /**
   * What is under the feet at the cell: 'floor' | 'solid' | 'air' | 'hole'
   * (a pit: death) | 'bad' (hazard or void on top: he can't land there).
   * @param {boolean} [crate] for a crate (or a frozen enemy), which falls through a crate stream (D198)
   */
  below(x, y, z, cfg, crate = false) {
    const grid = crate ? this.crateGrid : this.grid;
    if (y === 0) return this.grid.isHole(x, z) && !cfg.plugged.has(z * this.w + x) ? 'hole' : 'floor';
    if (y > this.h) return 'air';
    if (grid.isSolid(x, y - 1, z)) {
      const type = grid.typeAt(x, y - 1, z);
      return type.damage > 0 || type.lethal ? 'bad' : 'solid';
    }
    const index = this.index(x, y - 1, z);
    if (this.bodies.has(index) || cfg.crateSet.has(index) || this.floors.has(index) || this.gateSolid.has(index) || this.gateFloor.has(index)) return 'solid';
    return 'air';
  }

  /** Room for his body: two free cells. */
  clear(x, y, z, cfg) {
    return !this.blocked(x, y, z, cfg) && !this.blocked(x, y + 1, z, cfg);
  }

  /**
   * Where he stands after being put in the column at height y and falling:
   * the cell's y, or -1 when there is no room or he would land on a hole,
   * hazard or void.
   */
  landing(x, y, z, cfg) {
    if (!this.clear(x, y, z, cfg)) return -1;
    for (;;) {
      const under = this.below(x, y, z, cfg);
      if (under === 'solid' || under === 'floor') return y;
      if (under !== 'air') return -1;
      y--;
    }
  }

  /**
   * Where a crate put in the cell ends up: its cell, or null when it plugs
   * a hole (the tile index is returned as `plug`).
   * @returns {{ cell: number } | { plug: number }}
   */
  settle(x, y, z, cfg) {
    for (;;) {
      const under = this.below(x, y, z, cfg, true);
      if (under === 'hole') return { plug: z * this.w + x };
      if (under !== 'air') return { cell: this.index(x, y, z) };
      y--;
    }
  }

  /** How many cells ahead the box moves level through open space, at most `limit`. */
  sweep(x, y, z, [dx, dz], limit, cfg) {
    let n = 0;
    while (n < limit && this.clear(x + dx * (n + 1), y, z + dz * (n + 1), cfg)) n++;
    return n;
  }

  /**
   * Flood the cells he can stand on from the start cells.
   * @returns {Set<number>} cell indices
   */
  flood(starts, cfg) {
    const stands = new Set();
    const queue = [];
    const add = (x, y, z) => {
      if (y < 0 || y >= this.h) return;
      const i = this.index(x, y, z);
      if (stands.has(i)) return;
      stands.add(i);
      queue.push([x, y, z]);
    };
    const land = (x, y, z) => {
      if (!this.grid.isInside(x, z)) return;
      // A frozen enemy or a platform may not be there: he lands on it, or falls past it.
      for (let ly = this.landing(x, y, z, cfg); ly >= 0; ly = this.landing(x, ly - 1, z, cfg)) {
        add(x, ly, z);
        if (ly === 0 || !this.floors.has(this.index(x, ly - 1, z)) || this.blocked(x, ly - 1, z, cfg)) break;
      }
    };
    for (const [x, y, z] of starts) land(x, y, z);

    const { up, gap, abilities } = this;
    while (queue.length > 0) {
      const [x, y, z] = queue.pop();
      for (const dir of DIRS) {
        const [dx, dz] = dir;
        const nx = x + dx;
        const nz = z + dz;
        // Walk on or step off a ledge.
        land(nx, y, nz);
        // Jump up: the cell is a block (or a body) he can stand on top of.
        for (let climb = 1; climb <= up; climb++) {
          // Headroom for the rise, then the landing cell on top of what he climbs.
          let free = true;
          for (let dy = 2; dy <= climb + 1; dy++) free &&= !this.blocked(x, y + dy, z, cfg);
          if (!free) break;
          if (this.grid.isInside(nx, nz) && this.landing(nx, y + climb, nz, cfg) === y + climb) add(nx, y + climb, nz);
        }
        // Jump a gap: the cells over it are free; he lands level or lower.
        for (let width = 1; width <= gap; width++) {
          let over = true;
          for (let k = 1; k <= width; k++) for (let dy = 0; dy <= (up > 1 ? 3 : 2); dy++) over &&= !this.blocked(x + dx * k, y + dy, z + dz * k, cfg);
          if (!over) break;
          const lx = x + dx * (width + 1);
          const lz = z + dz * (width + 1);
          land(lx, y, lz);
          // With a double jump, one block up as well over a one-tile gap.
          if (up > 1 && width === 1 && this.landing(lx, y + 1, lz, cfg) === y + 1 && !this.blocked(x, y + 2, z, cfg)) add(lx, y + 1, lz);
        }
        // Blink and Warp: level through open space, as far as it goes.
        for (const [spell, limit] of [['blink', this.blinkRange], ['warp', Infinity]]) {
          if (!abilities.has(spell)) continue;
          const n = this.sweep(x, y, z, dir, limit, cfg);
          if (n > 0) land(x + dx * n, y, z + dz * n);
        }
        // Compile: a crate in the free cell in front; he steps up on it, or walks over the hole it plugs.
        if (abilities.has('compile') && this.grid.isInside(nx, nz) && !this.blockedCrate(nx, y, nz, cfg)) {
          const rest = this.settle(nx, y, nz, cfg);
          const top = rest.plug !== undefined ? 0 : this.cell(rest.cell)[1] + 1;
          const lift = top - y;
          if (top < this.h && lift <= up && this.clear(nx, top, nz, cfg)) {
            let free = true;
            for (let dy = 2; dy <= lift + 1; dy++) free &&= !this.blocked(x, y + dy, z, cfg);
            if (free) add(nx, top, nz);
          }
        }
      }
    }
    return stands;
  }

  /** A fresh configuration: the crates and the plugged hole tiles. */
  config(crates, plugged) {
    return { crates, plugged, crateSet: new Set(crates), key: `${[...crates].sort((a, b) => a - b)}|${[...plugged].sort((a, b) => a - b)}` };
  }

  /**
   * Configurations one push, pull or cut and paste away.
   * @param {object} cfg
   * @param {Set<number>} stands what he can stand on in `cfg`
   */
  successors(cfg, stands) {
    const out = [];
    const { abilities } = this;
    const move = (from, x, y, z) => {
      // The crate `from` leaves; a crate put in (x, y, z) falls from there.
      const crates = cfg.crates.filter((c) => c !== from);
      const probe = this.config(crates, cfg.plugged);
      const rest = this.settle(x, y, z, probe);
      if (rest.plug !== undefined) out.push(this.config(crates, new Set([...cfg.plugged, rest.plug])));
      else out.push(this.config([...crates, rest.cell], cfg.plugged));
    };
    const loose = (c) => {
      const [x, y, z] = this.cell(c);
      return !cfg.crateSet.has(this.index(x, y + 1, z));
    };
    for (const c of cfg.crates) {
      const [x, y, z] = this.cell(c);
      if (!loose(c)) continue;
      for (const [dx, dz] of DIRS) {
        // Push: he stands behind it, level, and the cell beyond is free.
        const px = x - dx;
        const pz = z - dz;
        if (this.grid.isInside(px, pz) && stands.has(this.index(px, y, pz)) && !this.blockedCrate(x + dx, y, z + dz, cfg)) move(c, x + dx, y, z + dz);
        // Pull: he stands in line up to `range` cells away, level, and the cell towards him is free.
        if (abilities.has('pull')) {
          const tx = x - dx;
          const tz = z - dz;
          if (this.grid.isInside(tx, tz) && !this.blockedCrate(tx, y, tz, cfg)) {
            for (let k = 2; k <= 6; k++) {
              const sx = x - dx * k;
              const sz = z - dz * k;
              if (!this.grid.isInside(sx, sz) || this.blocked(sx, y, sz, cfg)) break;
              if (stands.has(this.index(sx, y, sz))) {
                // The cells between must be open (a block or crate in line stops the beam).
                let open = true;
                for (let j = 1; j < k; j++) open &&= !this.blockedCrate(x - dx * j, y, z - dz * j, cfg);
                if (open) move(c, tx, y, tz);
                break;
              }
            }
          }
        }
      }
      // Cut and paste: take it from the cell in front of him and put it in another free cell in front of him.
      if (abilities.has('cut_paste')) {
        const front = DIRS.some(([dx, dz]) => stands.has(this.index(x - dx, y, z - dz)));
        if (front) {
          const crates = cfg.crates.filter((o) => o !== c);
          const probe = this.config(crates, cfg.plugged);
          for (const s of stands) {
            const [sx, sy, sz] = this.cell(s);
            for (const [dx, dz] of DIRS) {
              const fx = sx + dx;
              const fz = sz + dz;
              if (this.grid.isInside(fx, fz) && !this.blockedCrate(fx, sy, fz, probe) && !(fx === x && fz === z && sy === y)) move(c, fx, sy, fz);
            }
          }
        }
      }
    }
    return out;
  }

  /** The switches linked to `ids` (D140), or every switch in the room. */
  linked(ids) {
    return ids ? this.switches.filter((object) => ids.includes(object.id)) : this.switches;
  }

  /**
   * Can the switches `ids` (every switch of the room by default) all be on
   * at once in a configuration: a plate by a crate on it (or a spell that
   * puts a body there, or the wizard on a timed one), a target by a Zap bolt?
   * @param {string[]|null} ids
   */
  canPower(ids, cfg, stands) {
    const { abilities } = this;
    const linked = this.linked(ids);
    if (linked.length === 0) return false;
    /**
     * Plates only a frozen enemy or the Fork decoy can hold: what can be
     * there, each one on one plate at most (one decoy at a time, D129).
     */
    const byFrozen = [];
    for (const object of linked) {
      if (object.kind === 'target') {
        if (!abilities.has('zap')) return false;
        continue;
      }
      const [x, y, z] = object.at;
      const beside = DIRS.some(([dx, dz]) => stands.has(this.index(x - dx, y, z - dz)));
      // A socket (D194): a crate fills its hole (pushed in, or a compiled or pasted one beside it).
      if (object.kind === 'socket') {
        if (cfg.plugged.has(z * this.w + x)) continue;
        if ((abilities.has('compile') || (abilities.has('cut_paste') && cfg.crates.length > 0)) && beside) continue;
        return false;
      }
      if (cfg.crateSet.has(this.index(x, y, z))) continue;
      if (object.timer && stands.has(this.index(x, y, z))) continue;
      const placed = (abilities.has('compile') || (abilities.has('cut_paste') && cfg.crates.length > 0)) && beside;
      if (placed) continue;
      // A frozen enemy on it: on its path or pushed there (D154, D166); or the decoy.
      const holders = [...(this.frozenCells.get(this.index(x, y, z)) ?? [])];
      if (abilities.has('fork') && beside) holders.push('decoy');
      if (holders.length === 0) return false;
      byFrozen.push(holders);
    }
    return assignable(byFrozen);
  }

  /** Are the switches `ids` all on whatever he does: plates under crates, filled sockets (targets he can always switch off). */
  forcedOn(ids, cfg) {
    const linked = this.linked(ids);
    const on = ({ kind, at: [x, y, z] }) =>
      kind === 'socket' ? cfg.plugged.has(z * this.w + x) : kind === 'plate' && cfg.crateSet.has(this.index(x, y, z));
    return linked.length > 0 && linked.every(on);
  }

  /**
   * Work out the gates for a configuration (D140): closed, open, or either
   * (floor that is never in the way).
   * @returns {boolean} whether any changed
   */
  setGates(cfg, stands) {
    const solid = new Set();
    const floor = new Set();
    for (const gate of this.gates) {
      const on = this.canPower(gate.switches, cfg, stands);
      const off = !this.forcedOn(gate.switches, cfg);
      const [closed, open] = gate.startsGone ? [on, off] : [off, on];
      if (closed && open) floor.add(gate.index);
      else if (closed) solid.add(gate.index);
    }
    const same = (a, b) => a.size === b.size && [...a].every((i) => b.has(i));
    const changed = !same(solid, this.gateSolid) || !same(floor, this.gateFloor);
    this.gateSolid = solid;
    this.gateFloor = floor;
    return changed;
  }
}

/**
 * Can each plate get an enemy of its own? `plates` lists, per plate, the
 * enemies that can hold it (a small backtracking match).
 * @param {Set<number>[]} plates
 */
function assignable(plates, used = new Set(), k = 0) {
  if (k === plates.length) return true;
  for (const n of plates[k]) {
    if (used.has(n)) continue;
    used.add(n);
    if (assignable(plates, used, k + 1)) return true;
    used.delete(n);
  }
  return false;
}

/**
 * How near a stand must be for a scan to reach a hidden exit (a square
 * wave of `range` cells from his feet, D128).
 */
function scanReaches(model, stands, exit) {
  const { side, at, width } = exit;
  const [cross, along] = side.endsWith('x') ? [0, 2] : [2, 0];
  const edge = side.startsWith('-') ? 0 : model.room.size[cross];
  const mid = at + width / 2;
  for (const s of stands) {
    const c = model.cell(s);
    if (Math.abs(c[cross] + 0.5 - edge) <= model.scanRange && Math.abs(c[along] + 0.5 - mid) <= model.scanRange + width / 2) return true;
  }
  return false;
}

/**
 * Start cells of the wizard in a room: the cells inside an exit's opening
 * at the exit's floor level (where he arrives).
 * @param {object} room runtime room
 * @param {string} exitId
 * @returns {number[][]} cells [x, y, z]
 */
export function arrivalCells(room, exitId) {
  const exit = room.exits.find((e) => e.id === exitId);
  return exit ? exitCells(exit, room.size).inside.filter((cell) => cell[1] === exit.y) : [];
}

/**
 * What the wizard can reach in a room.
 * @param {object} room runtime room (buildRoom)
 * @param {object} options
 * @param {Iterable<string>} options.abilities what he has (see ABILITIES)
 * @param {number[][]} options.starts cells he may start from [x, y, z]
 * @param {{ scanRange?: number, blinkRange?: number }} [options.tuning] spell ranges from defs.json
 * @returns {RoomReach}
 */
export function analyzeRoom(room, { abilities, starts, tuning }) {
  // (a configuration search stops as soon as everything is reached)
  const model = new RoomModel(room, new Set(abilities), tuning);
  const reach = { pickups: new Set(), exits: {}, core: false, stands: new Set(), deadStart: false, configs: 0, truncated: false };
  for (const exit of room.exits) reach.exits[exit.id] = false;

  const first = model.config(model.crates, new Set());
  const seen = new Set([first.key]);
  const todo = [first];
  const union = new Set();
  while (todo.length > 0) {
    const cfg = todo.pop();
    reach.configs++;
    const stands = standsIn(model, cfg, starts);
    if (reach.configs === 1 && stands.size === 0) reach.deadStart = true;
    for (const s of stands) union.add(s);
    collect(model, cfg, stands, reach);
    // Everything in the room is reached: no need to search further.
    if (reach.pickups.size === room.pickups.length && Object.values(reach.exits).every(Boolean) && (reach.core || !model.core)) break;
    for (const next of model.successors(cfg, stands)) {
      if (seen.has(next.key)) continue;
      if (seen.size >= MAX_CONFIGS) {
        reach.truncated = true;
        break;
      }
      seen.add(next.key);
      todo.push(next);
    }
  }
  reach.stands = new Set([...union].map((i) => model.cell(i).join(',')));
  return reach;
}

/**
 * The cells he can stand on in one configuration, with the gates and
 * frozen enemies worked out for it (left set on the model).
 * @param {RoomModel} model
 * @param {object} cfg a configuration (model.config)
 * @param {number[][]} starts
 * @returns {Set<number>} cell indices
 */
export function standsIn(model, cfg, starts) {
  // Gates follow what he can switch from where he stands, which can open more of the room (D140).
  model.resetFrozen();
  model.setGates(cfg, new Set());
  let stands = model.flood(starts, cfg);
  // Gates and pushed frozen enemies open more of the room, which may open more again.
  for (let round = 0; round < 8; round++) {
    const gates = model.setGates(cfg, stands);
    const frozen = model.spreadFrozen(cfg, stands);
    if (!gates && !frozen) break;
    stands = model.flood(starts, cfg);
  }
  return stands;
}

/** Fill `reach` with what the wizard touches in one configuration (call standsIn() first). */
export function collect(model, cfg, stands, reach) {
  const { room, abilities } = model;
  const standAt = (x, y, z) => stands.has(model.index(x, y, z));
  // A pickup: in the cell he stands in or the one above, or higher with a jump.
  for (const pickup of room.pickups) {
    if (reach.pickups.has(pickup.id)) continue;
    const [x, y, z] = pickup.at;
    if (!model.grid.isInside(x, z) || model.blocked(x, y, z, cfg)) continue;
    const jump = abilities.has('double_jump') ? 3 : 2;
    for (let lift = 0; lift <= jump; lift++) {
      const base = y - lift;
      if (base < 0 || !standAt(x, base, z)) continue;
      let free = true;
      for (let dy = 1; dy <= lift; dy++) free &&= !model.blocked(x, base + dy, z, cfg);
      if (free) {
        reach.pickups.add(pickup.id);
        break;
      }
    }
  }
  // The core: he walks up to it.
  if (model.core && !reach.core) {
    const [x, y, z] = model.core.at;
    reach.core = DIRS.some(([dx, dz]) => [-1, 0, 1].some((dy) => standAt(x + dx, y + dy, z + dz)));
  }
  // Exits: stand in the opening; locked ones need their switches on in this configuration.
  for (const exit of room.exits) {
    if (reach.exits[exit.id]) continue;
    if (exit.locked && !model.canPower(exit.switches ?? null, cfg, stands)) continue;
    if (exit.hidden && !(abilities.has('scan') && scanReaches(model, stands, exit))) continue;
    if (arrivalCells(room, exit.id).some(([x, y, z]) => standAt(x, y, z))) reach.exits[exit.id] = true;
  }
}
