/**
 * One room being edited (room editor, D56, D57): the room data, the edits
 * the editor's tools make to it, undo and redo, and whether it changed since
 * it was last saved. The room's exit connections live in world.json
 * (WorldEdit); its undo steps take them along. Plain logic, no browser, so
 * tests can drive it.
 */
import { MAX_ROOM_FOOTPRINT } from '../core/rules.js';
import { DATA_SCHEMA_VERSION } from '../core/version.js';
import { EXIT_DEFAULTS, sideLength, withExitDefaults } from '../data/room-data.js';
import { validateData } from '../data/validate.js';
import { Boxes } from './boxes.js';
import { formatJson } from './format-json.js';

/** Order of a room file's keys when it is written back (as in data/rooms/). */
const KEY_ORDER = ['$schema', 'schemaVersion', 'id', 'name', 'biome', 'size', 'spawn', 'reset', 'exits', 'blocks', 'holes', 'objects', 'enemies'];

/** Undo steps kept per room. */
const UNDO_LIMIT = 200;

const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Exit names by side, as the rooms use them (north is the -z side). */
export const SIDE_NAMES = { '-z': 'north', '+x': 'east', '+z': 'south', '-x': 'west' };

/** Room ids and exit ids (common.schema.json). */
export const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Size of a new room. */
const NEW_ROOM_SIZE = [12, 4, 12];

export class RoomEdit {
  /**
   * @param {object} data room file contents
   * @param {object} [options]
   * @param {import('./world-edit.js').WorldEdit} [options.world] world.json being edited (exit connections)
   * @param {boolean} [options.fresh] a new room, not saved yet
   */
  constructor(data, { world = null, fresh = false } = {}) {
    this.world = world;
    this.fresh = fresh;
    this.load(data);
    /** Text of the room as last saved (or loaded), to tell unsaved changes. */
    this.savedText = this.text();
    /** States (snapshot()) before each edit, newest last. */
    this.undoStack = [];
    this.redoStack = [];
    /** State when the edit in progress began (see begin()), or null. */
    this.pending = null;
  }

  /** Take `data` as the current state (a fresh copy). */
  load(data) {
    this.data = structuredClone(data);
    this.blocks = new Boxes(data.blocks ?? [], { dims: 3, defaultType: 'block' });
    this.holes = new Boxes(data.holes ?? [], { dims: 2, defaultType: 'hole' });
  }

  get id() {
    return this.data.id;
  }

  get size() {
    return this.data.size;
  }

  /** The room data as it would be saved: blocks and holes written back, keys in file order, empty lists left out. */
  toData() {
    const data = { ...this.data, blocks: this.blocks.list(), holes: this.holes.list() };
    const out = {};
    for (const key of [...KEY_ORDER, ...Object.keys(data)]) {
      if (key in out || data[key] === undefined) continue;
      if (Array.isArray(data[key]) && data[key].length === 0 && key !== 'size') continue;
      out[key] = structuredClone(data[key]);
    }
    return out;
  }

  /** The room file's text (see format-json.js). */
  text() {
    return formatJson(this.toData());
  }

  /** Are there changes since the last save (a new room always has)? */
  get dirty() {
    return this.fresh || this.text() !== this.savedText;
  }

  /** The room was saved as it is now. */
  markSaved() {
    this.savedText = this.text();
    this.fresh = false;
  }

  /** The room and its connections, for undo. */
  snapshot() {
    return JSON.stringify({ room: this.text(), links: this.world?.linksOf(this.id) ?? [] });
  }

  /** Go back to a snapshot(). */
  restore(snapshot) {
    const { room, links } = JSON.parse(snapshot);
    this.load(JSON.parse(room));
    this.world?.setLinks(this.id, links);
  }

  // --- Undo -------------------------------------------------------------

  /**
   * Start an edit that may take many steps (a mouse stroke painting cells):
   * all of it is undone at once. Pair with end().
   */
  begin() {
    if (this.pending === null) this.pending = this.snapshot();
  }

  /** Finish the edit begun with begin(); record an undo step if anything changed. */
  end() {
    if (this.pending === null) return;
    const before = this.pending;
    this.pending = null;
    if (before === this.snapshot()) return;
    this.undoStack.push(before);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  /**
   * Run one edit as one undo step (unless a begin() is already open).
   * @template T
   * @param {() => T} change
   * @returns {T}
   */
  edit(change) {
    const outer = this.pending !== null;
    this.begin();
    const result = change();
    if (!outer) this.end();
    return result;
  }

  /** @returns {boolean} whether there was anything to undo */
  undo() {
    return this.step(this.undoStack, this.redoStack);
  }

  /** @returns {boolean} whether there was anything to redo */
  redo() {
    return this.step(this.redoStack, this.undoStack);
  }

  step(from, to) {
    if (this.pending !== null || from.length === 0) return false;
    to.push(this.snapshot());
    this.restore(from.pop());
    return true;
  }

  // --- What is where ----------------------------------------------------

  /**
   * What fills a cell: an object or enemy standing there (its `at`), or a
   * static block.
   * @param {number[]} cell [x, y, z]
   * @returns {{ kind: 'object'|'enemy', item: object } | { kind: 'block', type: string } | null}
   */
  at(cell) {
    const object = (this.data.objects ?? []).find((item) => sameCell(item.at, cell));
    if (object) return { kind: 'object', item: object };
    const enemy = (this.data.enemies ?? []).find((item) => sameCell(item.at, cell));
    if (enemy) return { kind: 'enemy', item: enemy };
    const type = this.blocks.get(cell);
    return type ? { kind: 'block', type } : null;
  }

  /** Is the floor tile [x, z] a hole? */
  isHole(tile) {
    return this.holes.get(tile) !== null;
  }

  /** Is the cell inside the room? */
  inside([x, y, z]) {
    const [w, h, d] = this.size;
    return x >= 0 && y >= 0 && z >= 0 && x < w && y < h && z < d;
  }

  // --- Edits (each one undo step unless inside begin()/end()) -------------

  /**
   * Put a static block of `type` in a cell, replacing whatever was there.
   * @param {number[]} cell
   * @param {'block'|'hazard'|'void'} type
   * @returns {boolean} whether anything changed
   */
  placeBlock(cell, type) {
    if (!this.inside(cell)) return false;
    return this.edit(() => {
      const here = this.at(cell);
      if (here?.kind === 'block' && here.type === type) return false;
      this.remove(cell);
      return this.blocks.set(cell, type);
    });
  }

  /**
   * Put a new object of `type` in a cell, replacing whatever was there. Its
   * id is the type name with the first free number (`crate_1`).
   * @param {number[]} cell
   * @param {string} type object type id (defs.json)
   * @param {object} [extra] more fields for the room object, e.g. `{ regrow: 3 }`
   * @returns {boolean} whether anything changed
   */
  placeObject(cell, type, extra = {}) {
    if (!this.inside(cell)) return false;
    const here = this.at(cell);
    if (here?.kind === 'object' && here.item.type === type && sameFields(settings(here.item), extra)) return false;
    return this.edit(() => {
      this.remove(cell);
      this.data.objects = [...(this.data.objects ?? []), { id: this.freeId(type), type, at: [...cell], ...structuredClone(extra) }];
      return true;
    });
  }

  /**
   * Empty a cell: the object or enemy standing there, else the block.
   * @returns {boolean} whether anything changed
   */
  erase(cell) {
    return this.edit(() => this.remove(cell));
  }

  /** Make the floor tile [x, z] a hole (true) or floor again (false). */
  setHole(tile, hole) {
    const [w, , d] = this.size;
    if (tile[0] < 0 || tile[1] < 0 || tile[0] >= w || tile[1] >= d) return false;
    return this.edit(() => this.holes.set(tile, hole ? 'hole' : null));
  }

  /**
   * Move the start point (spawn) or the respawn point (reset); `null` for
   * reset removes it, so it falls back to spawn.
   * @param {'spawn'|'reset'} key
   * @param {number[]|null} point feet center
   */
  setPoint(key, point) {
    const now = this.data[key];
    if (point === null ? now === undefined : now && sameCell(now, point)) return false;
    return this.edit(() => {
      if (point === null) delete this.data[key];
      else this.data[key] = [...point];
      return true;
    });
  }

  /** @param {string} name */
  setName(name) {
    if (name === this.data.name) return false;
    return this.edit(() => {
      this.data.name = name;
      return true;
    });
  }

  /** @param {string} biome biome id */
  setBiome(biome) {
    if (biome === this.data.biome) return false;
    return this.edit(() => {
      this.data.biome = biome;
      return true;
    });
  }

  /**
   * Change the room size; blocks, holes, objects and enemies that end up
   * outside are dropped (exits, spawn and reset are left to validation).
   * @param {number[]} size [x, y, z]
   */
  resize(size) {
    if (sameCell(size, this.size)) return false;
    return this.edit(() => {
      this.data.size = [...size];
      this.blocks.clip(size);
      this.holes.clip([size[0], size[2]]);
      for (const key of ['objects', 'enemies']) {
        if (this.data[key]) this.data[key] = this.data[key].filter((item) => this.inside(item.at));
      }
      return true;
    });
  }

  /** Go back to the room and its connections as last saved (one undo step); a new room starts over. */
  revert() {
    const links = this.world?.savedLinksOf(this.id) ?? [];
    const now = this.world?.linksOf(this.id) ?? [];
    if (this.text() === this.savedText && JSON.stringify(now) === JSON.stringify(links)) return false;
    return this.edit(() => {
      this.load(JSON.parse(this.savedText));
      this.world?.setLinks(this.id, links);
      return true;
    });
  }

  // --- Enemies and paths --------------------------------------------------

  /**
   * The object or enemy with this id, or null.
   * @param {string} id
   */
  item(id) {
    return [...(this.data.objects ?? []), ...(this.data.enemies ?? [])].find((item) => item.id === id) ?? null;
  }

  /**
   * Put a new enemy of `type` in a cell, replacing a block or object there
   * (not an enemy: the editor picks that one instead). Its id is the type
   * name with the first free number (`bug_1`).
   * @param {number[]} cell
   * @param {string} type enemy type id (defs.json)
   * @param {object} [overrides] values that replace the type's
   * @returns {string|null} the new enemy's id, or null if nothing changed
   */
  placeEnemy(cell, type, overrides = {}) {
    if (!this.inside(cell) || this.at(cell)?.kind === 'enemy') return null;
    const id = this.freeId(type);
    this.edit(() => {
      this.remove(cell);
      const enemy = { id, type, at: [...cell] };
      if (Object.keys(overrides).length > 0) enemy.overrides = structuredClone(overrides);
      this.data.enemies = [...(this.data.enemies ?? []), enemy];
    });
    return id;
  }

  /**
   * Change fields of an object or enemy: `undefined` removes a field, new
   * fields go at the end (the written order stays).
   * @param {string} id
   * @param {object} fields
   * @returns {boolean} whether anything changed
   */
  updateItem(id, fields) {
    const item = this.item(id);
    if (!item) return false;
    const next = withFields(item, fields);
    if (JSON.stringify(next) === JSON.stringify(item)) return false;
    return this.edit(() => {
      for (const key of ['objects', 'enemies']) {
        if (this.data[key]) this.data[key] = this.data[key].map((other) => (other === item ? next : other));
      }
      return true;
    });
  }

  /**
   * Extend the path of a platform or enemy to `cell`, adding corners so
   * every leg runs along one axis (x first, then z, then y).
   * @param {string} id
   * @param {number[]} cell
   * @returns {boolean} whether anything changed
   */
  addWaypoint(id, cell) {
    const item = this.item(id);
    if (!item || !this.inside(cell)) return false;
    const points = item.path?.points ?? [];
    const corner = [...(points.at(-1) ?? item.at)];
    const added = [];
    for (const axis of [0, 2, 1]) {
      if (corner[axis] === cell[axis]) continue;
      corner[axis] = cell[axis];
      added.push([...corner]);
    }
    if (added.length === 0) return false;
    return this.updateItem(id, { path: withFields(item.path ?? {}, { points: [...points, ...added] }) });
  }

  /** Take the last point off a path; the last one takes the whole path with it. */
  removeWaypoint(id) {
    const path = this.item(id)?.path;
    if (!path) return false;
    const points = path.points.slice(0, -1);
    return this.updateItem(id, { path: points.length > 0 ? withFields(path, { points }) : undefined });
  }

  /**
   * Set a path's mode, speed or pause (`undefined`: the default).
   * @param {string} id
   * @param {{ mode?: string, speed?: number, pause?: number }} options
   */
  setPathOptions(id, options) {
    const path = this.item(id)?.path;
    return !!path && this.updateItem(id, { path: withFields(path, options) });
  }

  // --- Exits ------------------------------------------------------------

  /** @returns {object[]} the room's exits (as written) */
  get exits() {
    return this.data.exits ?? [];
  }

  /**
   * The exit in `side` whose opening takes in the edge cell `cell`, or null.
   * @param {string} side
   * @param {number[]} cell [x, y, z]
   */
  exitAt(side, cell) {
    const along = side[1] === 'x' ? cell[2] : cell[0];
    return (
      this.exits.find((exit) => {
        const { at, width, y, height } = withExitDefaults(exit);
        return exit.side === side && along >= at && along < at + width && cell[1] >= y && cell[1] < y + height;
      }) ?? null
    );
  }

  /**
   * Open a new exit in `side` at the edge cell `cell` (its floor level is
   * the cell's height), shifted back to fit if it would run past the side.
   * Its id is the side's name (`north`, then `north_2`...).
   * @param {string} side '-x', '+x', '-z' or '+z'
   * @param {number[]} cell
   * @param {{ width?: number, height?: number }} [shape]
   * @returns {string|null} the new exit's id, or null if another exit is in the way
   */
  placeExit(side, cell, { width = EXIT_DEFAULTS.width, height = EXIT_DEFAULTS.height } = {}) {
    const length = sideLength(side, this.size);
    const at = Math.max(0, Math.min(side[1] === 'x' ? cell[2] : cell[0], length - width));
    const exit = exitFields({ id: this.freeExitId(side), side, at, width, y: cell[1], height });
    const clash = this.exits.some((other) => other.side === side && overlaps(withExitDefaults(other), withExitDefaults(exit)));
    if (clash) return null;
    this.edit(() => {
      this.data.exits = [...this.exits, exit];
    });
    return exit.id;
  }

  /**
   * Change an exit's id, width, height or floor level; its connection
   * follows a new id.
   * @param {string} id
   * @param {{ id?: string, width?: number, height?: number, y?: number }} fields
   * @returns {boolean} whether anything changed
   */
  updateExit(id, fields) {
    const exit = this.exits.find((e) => e.id === id);
    if (!exit) return false;
    const next = exitFields({ ...withExitDefaults(exit), ...fields });
    if (JSON.stringify(next) === JSON.stringify(exit)) return false;
    return this.edit(() => {
      this.data.exits = this.exits.map((e) => (e === exit ? next : e));
      if (next.id !== id) this.world?.rename(`${this.id}.${id}`, `${this.id}.${next.id}`);
      return true;
    });
  }

  /** Remove an exit and its connection. */
  removeExit(id) {
    if (!this.exits.some((e) => e.id === id)) return false;
    return this.edit(() => {
      this.data.exits = this.exits.filter((e) => e.id !== id);
      this.world?.disconnect(`${this.id}.${id}`);
      return true;
    });
  }

  /**
   * Connect an exit to another room's exit ("room.exit"), or disconnect it (null).
   * @returns {boolean} whether anything changed
   */
  linkExit(id, to) {
    if (!this.world) return false;
    const ref = `${this.id}.${id}`;
    if (this.world.partner(ref) === to) return false;
    return this.edit(() => (to ? this.world.connect(ref, to) : this.world.disconnect(ref)));
  }

  /** `north`, `north_2`...: the first id for an exit in that side the room doesn't use. */
  freeExitId(side) {
    const ids = new Set(this.exits.map((exit) => exit.id));
    const name = SIDE_NAMES[side];
    let id = name;
    for (let n = 2; ids.has(id); n++) id = `${name}_${n}`;
    return id;
  }

  /** Remove what fills a cell (no undo step of its own). */
  remove(cell) {
    const here = this.at(cell);
    if (!here) return false;
    if (here.kind === 'block') return this.blocks.set(cell, null);
    const key = here.kind === 'object' ? 'objects' : 'enemies';
    this.data[key] = this.data[key].filter((item) => item !== here.item);
    return true;
  }

  /** `type_1`, `type_2`...: the first id no object or enemy of the room has. */
  freeId(type) {
    const ids = new Set([...(this.data.objects ?? []), ...(this.data.enemies ?? [])].map((item) => item.id));
    let n = 1;
    while (ids.has(`${type}_${n}`)) n++;
    return `${type}_${n}`;
  }
}

/**
 * A copy of `item` with `fields` set: `undefined` removes a field, existing
 * fields keep their place and new ones go at the end.
 */
function withFields(item, fields) {
  const out = { ...item };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete out[key];
    else out[key] = structuredClone(value);
  }
  return out;
}

/** An exit as written in a room file: the schema's key order, defaults left out. */
function exitFields({ id, side, at, width, y, height }) {
  const exit = { id, side, at };
  if (width !== EXIT_DEFAULTS.width) exit.width = width;
  if (y !== EXIT_DEFAULTS.y) exit.y = y;
  if (height !== EXIT_DEFAULTS.height) exit.height = height;
  return exit;
}

/** Do two exits in one side share an opening cell? (defaults applied) */
function overlaps(a, b) {
  return a.at < b.at + b.width && b.at < a.at + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** A room object's own settings: every field but its id, type and cell (e.g. `regrow`). */
function settings({ id, type, at, ...rest }) {
  return rest;
}

/** Do two objects have the same fields with the same values, in any key order? */
function sameFields(a, b) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

/**
 * Check a room as edited against the rest of the game data, the way the
 * game checks it at load time.
 * @param {Record<string, any>} files every data file, keyed like data/ (the room's own included)
 * @param {object} room edited room data
 * @returns {string[]} error messages; empty when it is valid
 */
export function roomErrors(files, room) {
  return validateData({ ...files, [`rooms/${room.id}.json`]: room });
}

/**
 * A new, empty room: 12x4x12, the wizard starting in the middle.
 * @param {string} id
 * @param {string} biome biome id
 */
export function newRoom(id, biome) {
  const [w, , d] = NEW_ROOM_SIZE;
  const name = id
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
  return {
    $schema: '../../schemas/room.schema.json',
    schemaVersion: DATA_SCHEMA_VERSION,
    id,
    name,
    biome,
    size: [...NEW_ROOM_SIZE],
    spawn: [w / 2 + 0.5, 0, d / 2 + 0.5],
  };
}

/**
 * Why `id` can't be a new room's id, or null.
 * @param {string} id
 * @param {Iterable<string>} taken ids of the rooms there are
 */
export function roomIdProblem(id, taken) {
  if (!ID_PATTERN.test(id)) return 'Room id: lowercase letters, digits and _, starting with a letter.';
  if (new Set(taken).has(id)) return `Room id: "${id}" is taken.`;
  return null;
}

/**
 * Why a room size can't be used, or null: the limits of the room schema
 * and the camera (CLAUDE.md §4).
 * @param {number[]} size [x, y, z]
 */
export function sizeProblem([w, h, d]) {
  if (![w, h, d].every(Number.isInteger)) return 'Size: whole numbers only.';
  if (h < 2 || h > 6) return 'Size: height is 2 to 6.';
  if (w < 1 || d < 1) return 'Size: width and depth are at least 1.';
  if (w + d > MAX_ROOM_FOOTPRINT) return `Size: width + depth is at most ${MAX_ROOM_FOOTPRINT}.`;
  return null;
}
