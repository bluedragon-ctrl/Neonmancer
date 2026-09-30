/**
 * The enemy templates as the monster editor edits them (D119): every
 * template in defs.json `enemies`, where each of its values comes from (its
 * own, a template it builds on, or the game's default), new templates,
 * renames that the rooms' enemies follow, deletes, undo and redo. An enemy
 * is all its template, so this is where enemies are tuned. Plain logic, no
 * browser, so tests can drive it.
 */
import { freeColor, templateColorClashes } from '../data/colors.js';
import { ENEMY_DEFAULTS, ENEMY_REQUIRED, resolveEnemyTemplates, templateChain, withEnemyDefaults } from '../data/room-data.js';
import { validateData } from '../data/validate.js';
import { idProblem } from './ids.js';

/**
 * The template fields in the editor's order, grouped: its body, how it
 * moves, how it notices the wizard, how it attacks, how it takes hits and
 * what the wizard can do with it (every field of defs.schema.json's
 * enemyTemplate but `extends`).
 */
export const FIELD_GROUPS = [
  ['Body', ['look', 'color']],
  ['Moves', ['movement', 'speed', 'chaseSpeed', 'memory']],
  ['Notices', ['hostility', 'aggroRange']],
  ['Attack', ['attack', 'damage', 'attackRange', 'attackCharge', 'attackCooldown', 'attackColor', 'boltSpeed', 'boltPattern', 'boltBounces']],
  ['Takes', ['integrity', 'bounce', 'solid', 'pausable']],
];

/** Every field, in FIELD_GROUPS order. */
export const FIELDS = FIELD_GROUPS.flatMap(([, fields]) => fields);

/** Fields whose default follows another field (withEnemyDefaults()). */
const DERIVED = { chaseSpeed: 'speed', attackColor: 'color' };

/** Undo steps kept. */
const UNDO_LIMIT = 200;

const roomId = (file) => file.slice('rooms/'.length, -'.json'.length);

export class MonsterEdit {
  /**
   * @param {Record<string, any>} files every data file, keyed like data/
   *   (defs.json and the rooms, the rest for validation)
   */
  constructor(files) {
    this.load(files);
  }

  /** Take `files` as they are on disk now: nothing to undo, nothing unsaved. */
  load(files) {
    /** The files as last saved (or loaded). */
    this.files = files;
    this.defs = structuredClone(files['defs.json']);
    this.defs.enemies ??= {};
    /** Rooms by id (only their enemies change here, when a template is renamed). */
    this.rooms = new Map(
      Object.entries(files)
        .filter(([file]) => file.startsWith('rooms/'))
        .map(([file, room]) => [roomId(file), structuredClone(room)]),
    );
    this.savedState = this.snapshot();
    this.undoStack = [];
    this.redoStack = [];
  }

  /** @returns {Record<string, object>} templates by id, as written */
  get templates() {
    return this.defs.enemies;
  }

  /** Template ids, in defs.json order. */
  get ids() {
    return Object.keys(this.templates);
  }

  /**
   * A template's values filled in, defaults included (as an enemy of it gets them).
   * @param {string} id
   */
  values(id) {
    return withEnemyDefaults(resolveEnemyTemplates(this.templates)[id] ?? {});
  }

  /**
   * One field of a template and where its value comes from: `own`, the id
   * of a template it builds on, `default` (the game's), or null (missing:
   * a required value no template in the chain sets).
   * @param {string} id
   * @param {string} key
   * @returns {{ value: any, source: string|null }}
   */
  field(id, key) {
    const { chain } = templateChain(this.templates, id);
    for (const at of chain) {
      if (key in this.templates[at]) return { value: this.templates[at][key], source: at === id ? 'own' : at };
    }
    if (key in ENEMY_DEFAULTS || key in DERIVED) return { value: this.values(id)[key], source: 'default' };
    return { value: undefined, source: null };
  }

  /** Templates that extend `id` directly. */
  builtOn(id) {
    return this.ids.filter((other) => this.templates[other].extends === id);
  }

  /**
   * The enemies of a template, in every room: "room.enemy".
   * @param {string} id
   */
  usage(id) {
    return [...this.rooms].flatMap(([room, data]) => (data.enemies ?? []).filter((enemy) => enemy.template === id).map((enemy) => `${room}.${enemy.id}`));
  }

  /** Pairs of templates too alike in color (D119). */
  clashes() {
    return templateColorClashes(this.templates);
  }

  /** Validation errors of the data with the edits in (the color rule is clashes()). */
  errors() {
    return validateData(this.editedFiles());
  }

  /** Every data file with the edits in. */
  editedFiles() {
    const files = { ...this.files, 'defs.json': this.defs };
    for (const [id, room] of this.rooms) files[`rooms/${id}.json`] = room;
    return files;
  }

  // --- Edits (each one undo step) -------------------------------------------

  /**
   * Set a field of a template, or clear it (`undefined`): it then takes the
   * value of the template it builds on, or the default.
   * @param {string} id
   * @param {string} key
   * @param {any} value
   * @returns {boolean} whether anything changed
   */
  setField(id, key, value) {
    const template = this.templates[id];
    if (!template || template[key] === value || (value === undefined && !(key in template))) return false;
    return this.step(() => {
      if (value === undefined) delete template[key];
      else template[key] = value;
      return true;
    });
  }

  /**
   * Let a template build on another (`extends`), or on none (null), without
   * changing what it does: building on one drops its own values that the
   * new base has too; building on none writes down every value it took.
   * @param {string} id
   * @param {string|null} base
   * @returns {string|null} why not, or null (done, or nothing to do)
   */
  setBase(id, base) {
    const template = this.templates[id];
    if (!template || (template.extends ?? null) === base) return null;
    if (base !== null && !this.templates[base]) return `${base} is not a template.`;
    if (base !== null && templateChain({ ...this.templates, [id]: { ...template, extends: base } }, id).loop) {
      return `${base} builds on ${id}: that would be a loop.`;
    }
    const resolved = resolveEnemyTemplates(this.templates)[id];
    const baseValues = base === null ? {} : resolveEnemyTemplates(this.templates)[base];
    const own = {};
    for (const key of [...FIELDS, ...Object.keys(resolved)]) {
      if (key === 'extends' || key in own || resolved[key] === undefined) continue;
      if (base === null ? true : JSON.stringify(baseValues[key]) !== JSON.stringify(resolved[key])) own[key] = resolved[key];
    }
    this.step(() => {
      this.defs.enemies = replaceEntry(this.templates, id, id, { ...(base !== null && { extends: base }), ...own });
      return true;
    });
    return null;
  }

  /**
   * Add a template: one built on `from` (a variant, only its own color
   * written), or a copy of all of `from`'s values (`copy`), or, with no
   * `from`, a copy of the first template. It gets a color of its own.
   * @param {string} name
   * @param {{ from?: string, copy?: boolean }} [options]
   * @returns {string|null} why not, or null when added
   */
  add(name, { from = this.ids[0], copy = false } = {}) {
    const problem = idProblem('Template name', name, this.ids);
    if (problem) return problem;
    if (!this.templates[from]) return `${from} is not a template.`;
    const color = freeColor(Object.values(resolveEnemyTemplates(this.templates)).map((t) => t.color).filter(Boolean));
    const { extends: _, ...values } = resolveEnemyTemplates(this.templates)[from];
    const template = copy ? { ...values, color } : { extends: from, color };
    this.step(() => {
      this.templates[name] = template;
      return true;
    });
    return null;
  }

  /**
   * Give a template another id, keeping its place in defs.json; the
   * templates built on it and the enemies of it, in every room, follow.
   * @returns {string|null} why not, or null when renamed
   */
  rename(from, to) {
    if (!this.templates[from]) return `${from} is not a template.`;
    const problem = idProblem('Template name', to, this.ids);
    if (problem) return problem;
    this.step(() => {
      const renamed = replaceEntry(this.templates, from, to, this.templates[from]);
      for (const template of Object.values(renamed)) if (template.extends === from) template.extends = to;
      this.defs.enemies = renamed;
      for (const room of this.rooms.values()) {
        for (const enemy of room.enemies ?? []) if (enemy.template === from) enemy.template = to;
      }
      return true;
    });
    return null;
  }

  /**
   * Remove a template no enemy uses and no template builds on.
   * @returns {string|null} why not, or null when removed
   */
  remove(id) {
    if (!this.templates[id]) return `${id} is not a template.`;
    const users = this.usage(id);
    if (users.length > 0) return `${id} is used by ${users.join(', ')}: give them another template first (room editor).`;
    const children = this.builtOn(id);
    if (children.length > 0) return `${children.join(', ')} ${children.length === 1 ? 'builds' : 'build'} on ${id}: change or remove ${children.length === 1 ? 'it' : 'them'} first.`;
    this.step(() => {
      delete this.templates[id];
      return true;
    });
    return null;
  }

  // --- Undo and saving ----------------------------------------------------

  /** The templates and the rooms' enemies, as text. */
  snapshot() {
    return JSON.stringify({ enemies: this.templates, rooms: Object.fromEntries([...this.rooms].map(([id, room]) => [id, room.enemies ?? null])) });
  }

  /** @param {string} state from snapshot() */
  restore(state) {
    const { enemies, rooms } = JSON.parse(state);
    this.defs.enemies = enemies;
    for (const [id, list] of Object.entries(rooms)) {
      const room = this.rooms.get(id);
      if (!room) continue;
      if (list === null) delete room.enemies;
      else room.enemies = list;
    }
  }

  /**
   * Run an edit as one undo step.
   * @param {() => boolean} change
   * @returns {boolean} whether it changed anything
   */
  step(change) {
    const before = this.snapshot();
    if (!change() || this.snapshot() === before) return false;
    this.undoStack.push(before);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }

  /** @returns {boolean} whether there was anything to undo */
  undo() {
    return this.travel(this.undoStack, this.redoStack);
  }

  /** @returns {boolean} whether there was anything to redo */
  redo() {
    return this.travel(this.redoStack, this.undoStack);
  }

  travel(from, to) {
    if (from.length === 0) return false;
    to.push(this.snapshot());
    this.restore(from.pop());
    return true;
  }

  /** Are there edits not saved yet? */
  get dirty() {
    return this.snapshot() !== this.savedState;
  }

  /**
   * What a save sends: defs.json, and the rooms whose enemies a rename changed.
   * @returns {{ defs: object, rooms: object[], state: string }} `state`: pass it to markSaved()
   */
  changes() {
    const rooms = [...this.rooms]
      .filter(([id, room]) => JSON.stringify(room.enemies) !== JSON.stringify(this.files[`rooms/${id}.json`]?.enemies))
      .map(([, room]) => structuredClone(room));
    return { defs: structuredClone(this.defs), rooms, state: this.snapshot() };
  }

  /**
   * A save went through: what it sent is on disk (edits made since stay unsaved).
   * @param {{ defs: object, rooms: object[], state: string }} sent from changes()
   */
  markSaved({ defs, rooms, state }) {
    this.files = { ...this.files, 'defs.json': defs, ...Object.fromEntries(rooms.map((room) => [`rooms/${room.id}.json`, room])) };
    this.savedState = state;
  }

  /** Does the template miss a required value (none in its chain)? */
  missing(id) {
    return ENEMY_REQUIRED.filter((key) => this.field(id, key).source === null);
  }
}

/**
 * A copy of `map` with the entry `from` replaced by `to` → `value`, in the same place.
 * @param {Record<string, object>} map
 */
function replaceEntry(map, from, to, value) {
  return Object.fromEntries(Object.entries(map).map(([key, entry]) => (key === from ? [to, value] : [key, entry])));
}
