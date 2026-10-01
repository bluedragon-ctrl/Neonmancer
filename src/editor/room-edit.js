/**
 * One room being edited (room editor, D56, D57): the room data, the edits
 * the editor's tools make to it, undo and redo, and whether it changed since
 * it was last saved. The room's exit connections live in world.json
 * (WorldEdit); its undo steps take them along, and the screen texts in
 * lore.json (LoreEdit) of the steps that changed them. Plain logic, no
 * browser, so tests can drive it.
 */
import { MAX_ROOM_FOOTPRINT, ROOM_HEIGHT } from '../core/rules.js';
import { DATA_SCHEMA_VERSION } from '../core/version.js';
import { DECO_FACES, EXIT_DEFAULTS, sideLength, withExitDefaults } from '../data/room-data.js';
import { Boxes } from './boxes.js';
import { formatJson } from './format-json.js';
import { idProblem } from './ids.js';

/** Kinds of things standing in cells, and the room list each is kept in. */
const ITEM_LISTS = [
  ['object', 'objects'],
  ['enemy', 'enemies'],
  ['pickup', 'pickups'],
];

/** The room list of each kind of item: `objects` for 'object'. */
const LIST_OF = Object.fromEntries(ITEM_LISTS);

/** Order of a room file's keys when it is written back (as in data/rooms/). */
const KEY_ORDER = ['$schema', 'schemaVersion', 'id', 'name', 'authored', 'biome', 'size', 'spawn', 'reset', 'exits', 'blocks', 'holes', 'shrine', 'objects', 'enemies', 'pickups'];

/** Files several rooms share, whose changes a room's undo step takes along: lore.json. */
const SHARED = ['lore'];

/** Undo steps kept per room. */
const UNDO_LIMIT = 200;

const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Exit names by side, as the rooms use them (north is the -z side). */
export const SIDE_NAMES = { '-z': 'north', '+x': 'east', '+z': 'south', '-x': 'west' };

/** Size of a new room. */
const NEW_ROOM_SIZE = [12, 4, 12];

export class RoomEdit {
  /**
   * @param {object} data room file contents
   * @param {object} [options]
   * @param {import('./world-edit.js').WorldEdit} [options.world] world.json being edited (exit connections)
   * @param {import('./lore-edit.js').LoreEdit} [options.lore] lore.json being edited (screen texts, D118)
   * @param {boolean} [options.fresh] a new room, not saved yet
   */
  constructor(data, { world = null, lore = null, fresh = false } = {}) {
    this.world = world;
    this.lore = lore;
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
    /** text() until the next change. */
    this.cachedText = null;
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
    return roomFileData({ ...this.data, blocks: this.blocks.list(), holes: this.holes.list() });
  }

  /** The room file's text (see format-json.js). */
  text() {
    this.cachedText ??= formatJson(this.toData());
    return this.cachedText;
  }

  /** Are there changes since the last save (a new room always has)? */
  get dirty() {
    return this.fresh || this.text() !== this.savedText;
  }

  /**
   * The room was saved.
   * @param {string} [text] the text written (edits made since stay unsaved); default: as it is now
   */
  markSaved(text = this.text()) {
    this.savedText = text;
    this.fresh = false;
  }

  /** The room, its connections and the screen texts, for undo. */
  snapshot() {
    return { room: this.text(), links: JSON.stringify(this.world?.linksOf(this.id) ?? []), lore: this.lore?.text() ?? null };
  }

  /**
   * Go back to an undo or redo step: the room and its connections, and the
   * text changes of the step if it made any (`lore`, from `loreAfter`).
   */
  restore(state) {
    this.load(JSON.parse(state.room));
    this.world?.setLinks(this.id, JSON.parse(state.links));
    for (const key of SHARED) if (state[key] !== null) this[key]?.applyChange(state[`${key}After`], state[key]);
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
    const now = this.snapshot();
    if (before.room === now.room && before.links === now.links && SHARED.every((key) => before[key] === now[key])) return;
    // Only a step that changed the texts takes those changes back (other rooms' stay).
    for (const key of SHARED) {
      if (before[key] === now[key]) before[key] = null;
      else before[`${key}After`] = now[key];
    }
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
    this.cachedText = null;
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
    const target = from.pop();
    // The way back of this step: its text changes turned round.
    const now = this.snapshot();
    for (const key of SHARED) {
      now[key] = target[key] === null ? null : target[`${key}After`];
      now[`${key}After`] = target[key];
    }
    to.push(now);
    this.restore(target);
    return true;
  }

  // --- What is where ----------------------------------------------------

  /**
   * What fills a cell: an object, enemy or pickup standing there (its `at`),
   * or a static block.
   * @param {number[]} cell [x, y, z]
   * @returns {{ kind: 'object'|'enemy'|'pickup', item: object } | { kind: 'block', type: string } | null}
   */
  at(cell) {
    for (const [kind, key] of ITEM_LISTS) {
      const item = (this.data[key] ?? []).find((other) => sameCell(other.at, cell));
      if (item) return { kind, item };
    }
    const type = this.blocks.get(cell);
    return type ? { kind: 'block', type } : null;
  }

  /**
   * What is in a cell, in words, for the panel: `3, 1, 4: crate_1 (crate)`;
   * `tile 3, 4: hole` for a floor tile (`floor, shrine` for the backup
   * shrine's). An exit there is named too.
   * @param {number[]} cell [x, y, z]
   * @param {{ tile?: boolean }} [options] describe the floor tile [x, z]
   */
  describe(cell, { tile = false } = {}) {
    const [x, y, z] = cell;
    if (tile) {
      const shrine = this.data.shrine?.[0] === x && this.data.shrine[1] === z ? ', shrine' : '';
      return `tile ${x}, ${z}: ${this.isHole([x, z]) ? 'hole' : 'floor'}${shrine}`;
    }
    const here = this.at(cell);
    const what = [];
    if (here?.kind === 'block') what.push(here.type === 'block' ? 'block' : `${here.type} block`);
    else if (here) what.push(`${here.item.id} (${here.item.template ?? here.item.type})`);
    const [w, , d] = this.size;
    const edges = { '-x': x === 0, '+x': x === w - 1, '-z': z === 0, '+z': z === d - 1 };
    for (const side of Object.keys(edges).filter((key) => edges[key])) {
      const exit = this.exitAt(side, cell);
      if (exit) what.push(`exit ${exit.id}`);
    }
    return `${x}, ${y}, ${z}: ${what.join(', ') || 'empty'}`;
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
   * Put a block of `type` in a cell, replacing whatever was there.
   * @param {number[]} cell
   * @param {string} type block type id (defs.json "blocks", D60)
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
   * id is the type name with the first free number (`crate_1`). An object of
   * the same type there stays as it is (a platform keeps its path).
   * @param {number[]} cell
   * @param {string} type object type id (defs.json)
   * @returns {boolean} whether anything changed
   */
  placeObject(cell, type) {
    return this.placeItem('objects', cell, type);
  }

  /**
   * Put a new pickup of `type` in a cell (D71), like placeObject(): its id
   * is `disk_zap_1`...
   * @param {number[]} cell
   * @param {string} type pickup type id (defs.json "pickups")
   * @returns {boolean} whether anything changed
   */
  placePickup(cell, type) {
    return this.placeItem('pickups', cell, type);
  }

  /** placeObject() and placePickup(), into room list `key`. */
  placeItem(key, cell, type) {
    if (!this.inside(cell)) return false;
    const here = this.at(cell);
    if (here && LIST_OF[here.kind] === key && here.item.type === type) return false;
    return this.edit(() => {
      this.remove(cell);
      this.data[key] = [...(this.data[key] ?? []), { id: this.freeId(type), type, at: [...cell] }];
      return true;
    });
  }

  /**
   * Empty a cell: the object, enemy or pickup standing there, else the block.
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
   * Move the backup shrine (D97) to a floor tile, or remove it (`null`);
   * a room has one at most.
   * @param {number[]|null} tile [x, z]
   */
  setShrine(tile) {
    const now = this.data.shrine;
    if (tile === null ? !now : now && now[0] === tile[0] && now[1] === tile[1]) return false;
    return this.edit(() => {
      if (tile === null) delete this.data.shrine;
      else this.data.shrine = [...tile];
      return true;
    });
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

  /**
   * Set a plain room field (a string, number or boolean; `undefined`
   * removes it) as one undo step.
   * @param {string} key
   * @param {string|number|boolean|undefined} value
   * @returns {boolean} whether anything changed
   */
  setField(key, value) {
    if (value === this.data[key]) return false;
    return this.edit(() => {
      if (value === undefined) delete this.data[key];
      else this.data[key] = value;
      return true;
    });
  }

  /** @param {string} name */
  setName(name) {
    return this.setField('name', name);
  }

  /**
   * Mark the room as the author's own (D90), or a test room again.
   * @param {boolean} on
   */
  setAuthored(on) {
    return this.setField('authored', on || undefined);
  }

  /** @param {string} biome biome id */
  setBiome(biome) {
    return this.setField('biome', biome);
  }

  /**
   * Change the room size: blocks, holes, objects and enemies that end up
   * outside are dropped, spawn and reset move inside (exits and paths are
   * left to validation).
   * @param {number[]} size [x, y, z]
   * @returns {{ dropped: string[], moved: string[] } | false} what was dropped
   *   ("3 blocks", item ids) and moved ("spawn"), or false if the size is the same
   */
  resize(size) {
    if (sameCell(size, this.size)) return false;
    const dropped = [];
    const moved = [];
    this.edit(() => {
      this.data.size = [...size];
      const count = (boxes) => boxes.cells().length;
      const [blocks, holes] = [count(this.blocks), count(this.holes)];
      this.blocks.clip(size);
      this.holes.clip([size[0], size[2]]);
      const lost = { block: blocks - count(this.blocks), hole: holes - count(this.holes) };
      for (const [what, n] of Object.entries(lost)) if (n > 0) dropped.push(`${n} ${what}${n > 1 ? 's' : ''}`);
      const shrine = this.data.shrine;
      if (shrine && (shrine[0] >= size[0] || shrine[1] >= size[2])) {
        delete this.data.shrine;
        dropped.push('the shrine');
      }
      for (const [, key] of ITEM_LISTS) {
        if (!this.data[key]) continue;
        dropped.push(...this.data[key].filter((item) => !this.inside(item.at)).map((item) => item.id));
        this.data[key] = this.data[key].filter((item) => this.inside(item.at));
      }
      const [w, h, d] = size;
      for (const key of ['spawn', 'reset']) {
        const point = this.data[key];
        if (!point) continue;
        // Feet center: in the middle of a cell at most, with the wizard's 2 cells of headroom.
        const inside = [Math.min(point[0], w - 0.5), Math.min(point[1], h - 2), Math.min(point[2], d - 0.5)];
        if (sameCell(inside, point)) continue;
        this.data[key] = inside;
        moved.push(key);
      }
      return true;
    });
    return { dropped, moved };
  }

  /** Are the room's connections (world.json) not the ones last saved? */
  get linksChanged() {
    if (!this.world) return false;
    return JSON.stringify(this.world.linksOf(this.id)) !== JSON.stringify(this.world.savedLinksOf(this.id));
  }

  /** Go back to the room and its connections as last saved (one undo step); a new room starts over. */
  revert() {
    if (this.text() === this.savedText && !this.linksChanged) return false;
    return this.edit(() => {
      this.load(JSON.parse(this.savedText));
      this.world?.setLinks(this.id, this.world.savedLinksOf(this.id));
      return true;
    });
  }

  // --- Enemies and paths --------------------------------------------------

  /**
   * The object or enemy with this id, or null.
   * @param {string} id
   */
  item(id) {
    return this.items().find((item) => item.id === id) ?? null;
  }

  /** Every object, enemy and pickup of the room (they share one id namespace). */
  items() {
    return ITEM_LISTS.flatMap(([, key]) => this.data[key] ?? []);
  }

  /**
   * Remove an object or enemy.
   * @param {string} id
   * @returns {boolean} whether it was there
   */
  removeItem(id) {
    const item = this.item(id);
    return !!item && this.erase(item.at);
  }

  /**
   * The id an object or enemy of `was` should have as one of `name`: one
   * the editor made (`bug_1`) follows the name (`virus_1`); one written by
   * hand stays.
   * @param {object} item
   * @param {string} was its type or template now
   * @param {string} name
   */
  idFor(item, was, name) {
    if (name === was || !new RegExp(`^${was}_\\d+$`).test(item.id)) return item.id;
    return this.freeId(name);
  }

  /**
   * Give an enemy another template; its id follows the template (idFor()),
   * a stationary one loses its path and one that is no boss its drop.
   * @param {string} id
   * @param {string} template enemy template id (defs.json "enemies")
   * @param {boolean} walksPath it may have a path with these settings (not stationary)
   * @param {boolean} [boss] the template is a boss's (D135): it keeps its drop
   * @returns {string|null} its id afterwards, or null if nothing changed
   */
  setEnemy(id, template, walksPath, boss = false) {
    const enemy = this.item(id);
    if (!enemy) return null;
    const next = this.idFor(enemy, enemy.template, template);
    const fields = { id: next, template, path: walksPath ? enemy.path : undefined, drop: boss ? enemy.drop : undefined };
    return this.updateItem(id, fields) ? next : null;
  }

  /**
   * Put a new enemy of `template` in a cell, replacing a block or object
   * there (not an enemy: the editor picks that one instead). Its id is the
   * template name with the first free number (`bug_1`).
   * @param {number[]} cell
   * @param {string} template enemy template id (defs.json "enemies", D79)
   * @returns {string|null} the new enemy's id, or null if nothing changed
   */
  placeEnemy(cell, template) {
    if (!this.inside(cell) || this.at(cell)?.kind === 'enemy') return null;
    const id = this.freeId(template);
    this.edit(() => {
      this.remove(cell);
      this.data.enemies = [...(this.data.enemies ?? []), { id, template, at: [...cell] }];
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
      for (const [, key] of ITEM_LISTS) {
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

  /**
   * Give a screen a text of lore.json (D118), or none (null).
   * @param {string} id the screen's id
   * @param {string|null} text
   * @returns {boolean} whether anything changed
   */
  /**
   * The pickup a boss drops (D104, D135): a pickup id of the room, or null
   * for none (validation asks for one).
   * @param {string} id the boss
   * @param {string|null} drop
   * @returns {boolean} whether anything changed
   */
  setDrop(id, drop) {
    return this.updateItem(id, { drop: drop ?? undefined });
  }

  setText(id, text) {
    return this.updateItem(id, { text: text ?? undefined });
  }

  /**
   * Link a gate or platform to switches of the room (D140): their ids, or
   * none (a gate then takes every switch, a platform always runs).
   * @param {string} id
   * @param {string[]} switches
   */
  setSwitches(id, switches) {
    return this.updateItem(id, { switches: switches.length > 0 ? switches : undefined });
  }

  /**
   * Turn a decoration (D117) to face the other seen side: +z (the default,
   * no override written) and +x take turns.
   * @param {string} id
   */
  turnObject(id) {
    const item = this.item(id);
    if (!item) return false;
    const face = (item.overrides?.face ?? DECO_FACES[0]) === DECO_FACES[0] ? DECO_FACES[1] : DECO_FACES[0];
    const overrides = withFields(item.overrides ?? {}, { face: face === DECO_FACES[0] ? undefined : face });
    return this.updateItem(id, { overrides: Object.keys(overrides).length > 0 ? overrides : undefined });
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
    const clash = this.exits.some((other) => other.side === side && exitsOverlap(withExitDefaults(other), withExitDefaults(exit)));
    if (clash) return null;
    this.edit(() => {
      this.data.exits = [...this.exits, exit];
    });
    return exit.id;
  }

  /**
   * Would the exit, changed by `fields`, share an opening cell with another
   * exit in its side?
   * @param {string} id
   * @param {object} fields
   */
  exitClashes(id, fields) {
    const exit = this.exits.find((e) => e.id === id);
    if (!exit) return false;
    const next = withExitDefaults({ ...exit, ...fields });
    return this.exits.some((other) => other !== exit && other.side === next.side && exitsOverlap(withExitDefaults(other), next));
  }

  /**
   * Change an exit's id, position along its side (`at`), width, height,
   * floor level, whether it is locked (D75) and by which switches (D140,
   * none: every switch), the access level it asks for (D101, 0 for none)
   * or whether it is hidden until a scan (D128); its connection follows a
   * new id.
   * @param {string} id
   * @param {{ id?: string, at?: number, width?: number, height?: number, y?: number, locked?: boolean, switches?: string[], access?: number, hidden?: boolean }} fields
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
    const key = LIST_OF[here.kind];
    this.data[key] = this.data[key].filter((item) => item !== here.item);
    return true;
  }

  /** `type_1`, `type_2`...: the first id no object, enemy or pickup of the room has. */
  freeId(type) {
    const ids = new Set(this.items().map((item) => item.id));
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
export function exitFields({ id, side, at, width, y, height, locked, switches, access, hidden }) {
  const exit = { id, side, at };
  if (width !== EXIT_DEFAULTS.width) exit.width = width;
  if (y !== EXIT_DEFAULTS.y) exit.y = y;
  if (height !== EXIT_DEFAULTS.height) exit.height = height;
  if (locked) exit.locked = true;
  // Only a locked exit is opened by switches (D140).
  if (locked && switches?.length > 0) exit.switches = [...switches];
  if (access) exit.access = access;
  if (hidden) exit.hidden = true;
  return exit;
}

/** Do two exits in one side share an opening cell? (defaults applied) */
export function exitsOverlap(a, b) {
  return a.at < b.at + b.width && b.at < a.at + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * A room as written back to its file (a copy): keys in the order the room
 * files use, empty lists left out.
 * @param {object} data room data
 */
export function roomFileData(data) {
  const out = {};
  for (const key of [...KEY_ORDER, ...Object.keys(data)]) {
    if (key in out || data[key] === undefined) continue;
    if (Array.isArray(data[key]) && data[key].length === 0 && key !== 'size') continue;
    out[key] = structuredClone(data[key]);
  }
  return out;
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
  return idProblem('Room id', id, taken);
}

/**
 * A line about a resize (RoomEdit.resize()).
 * @param {number[]} size
 * @param {{ dropped: string[], moved: string[] }} report
 */
export function resizeText(size, { dropped, moved }) {
  const parts = [`Size ${size.join('×')}`];
  if (dropped.length > 0) parts.push(`dropped ${dropped.join(', ')}`);
  if (moved.length > 0) parts.push(`moved ${moved.join(' and ')} inside`);
  return `${parts.join('; ')}.`;
}

/**
 * Why a room size can't be used, or null: the limits of the room schema
 * and the camera (CLAUDE.md §4).
 * @param {number[]} size [x, y, z]
 */
export function sizeProblem([w, h, d]) {
  if (![w, h, d].every(Number.isInteger)) return 'Size: whole numbers only.';
  if (h < ROOM_HEIGHT.min || h > ROOM_HEIGHT.max) return `Size: height is ${ROOM_HEIGHT.min} to ${ROOM_HEIGHT.max}.`;
  if (w < 1 || d < 1) return 'Size: width and depth are at least 1.';
  if (w + d > MAX_ROOM_FOOTPRINT) return `Size: width + depth is at most ${MAX_ROOM_FOOTPRINT}.`;
  return null;
}
