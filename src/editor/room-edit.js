/**
 * One room being edited (room editor, D56): the room data, the edits the
 * editor's tools make to it, undo and redo, and whether it changed since
 * it was last saved. Plain logic, no browser, so tests can drive it.
 */
import { validateData } from '../data/validate.js';
import { Boxes } from './boxes.js';
import { formatJson } from './format-json.js';

/** Order of a room file's keys when it is written back (as in data/rooms/). */
const KEY_ORDER = ['$schema', 'schemaVersion', 'id', 'name', 'biome', 'size', 'spawn', 'reset', 'exits', 'blocks', 'holes', 'objects', 'enemies'];

/** Undo steps kept per room. */
const UNDO_LIMIT = 200;

const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export class RoomEdit {
  /** @param {object} data room file contents */
  constructor(data) {
    this.load(data);
    /** Text of the room as last saved (or loaded), to tell unsaved changes. */
    this.savedText = this.text();
    /** Room texts before each edit, newest last. */
    this.undoStack = [];
    this.redoStack = [];
    /** Text when the edit in progress began (see begin()), or null. */
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

  /** Are there changes since the last save? */
  get dirty() {
    return this.text() !== this.savedText;
  }

  /** The room was saved as it is now. */
  markSaved() {
    this.savedText = this.text();
  }

  // --- Undo -------------------------------------------------------------

  /**
   * Start an edit that may take many steps (a mouse stroke painting cells):
   * all of it is undone at once. Pair with end().
   */
  begin() {
    if (this.pending === null) this.pending = this.text();
  }

  /** Finish the edit begun with begin(); record an undo step if anything changed. */
  end() {
    if (this.pending === null) return;
    const before = this.pending;
    this.pending = null;
    if (before === this.text()) return;
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
    to.push(this.text());
    this.load(JSON.parse(from.pop()));
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
    if (here?.kind === 'object' && here.item.type === type && JSON.stringify(pick(here.item, extra)) === JSON.stringify(extra)) return false;
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

  /** Go back to the room as last saved (one undo step). */
  revert() {
    if (!this.dirty) return false;
    return this.edit(() => {
      this.load(JSON.parse(this.savedText));
      return true;
    });
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

/** The fields of `item` named in `keys` (an object whose keys are used). */
function pick(item, keys) {
  return Object.fromEntries(Object.keys(keys).map((key) => [key, item[key]]));
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
