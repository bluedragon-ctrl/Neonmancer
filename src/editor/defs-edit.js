/**
 * defs.json while the room editor changes its enemy templates (D58): enemy
 * types that `extends` a base type with only the values they change. Room
 * undo steps that change a template take it along (room-edit.js). Plain
 * logic, no browser.
 */
import { formatJson } from './format-json.js';
import { ID_PATTERN } from './room-edit.js';

export class DefsEdit {
  /** @param {object} data defs.json contents */
  constructor(data) {
    this.data = structuredClone(data);
    /** Text as last saved (or loaded), to tell unsaved changes. */
    this.savedText = this.text();
  }

  /** @returns {Record<string, object>} enemy types by id, as written */
  get enemies() {
    return this.data.enemies ?? {};
  }

  toData() {
    return structuredClone(this.data);
  }

  text() {
    return formatJson(this.data);
  }

  get dirty() {
    return this.text() !== this.savedText;
  }

  markSaved() {
    this.savedText = this.text();
  }

  /**
   * Make the template changes that turned text() `from` into `to` again
   * (undo, redo), keeping any other change made since (another room's).
   * @param {string} from
   * @param {string} to
   */
  applyChange(from, to) {
    const [before, after] = [from, to].map((text) => JSON.parse(text).enemies ?? {});
    const changed = (id) => JSON.stringify(before[id]) !== JSON.stringify(after[id]);
    const now = this.enemies;
    const out = {};
    for (const id of Object.keys(after)) {
      if (changed(id)) out[id] = after[id];
      else if (id in now) out[id] = now[id];
    }
    for (const id of Object.keys(now)) if (!(id in out) && !changed(id)) out[id] = now[id];
    this.data.enemies = out;
  }

  /** Is enemy type `type` a template (it extends a base type)? */
  isTemplate(type) {
    return !!this.enemies[type]?.extends;
  }

  /**
   * Why `name` can't be a new enemy type id, or null.
   * @param {string} name
   */
  nameProblem(name) {
    if (!ID_PATTERN.test(name)) return 'Template name: lowercase letters, digits and _, starting with a letter.';
    if (this.enemies[name]) return `Template name: "${name}" is taken.`;
    return null;
  }

  /**
   * Add a template of `type` with these values (a template of a template is
   * one more template of the same base).
   * @param {string} name
   * @param {string} type enemy type the settings are of
   * @param {object} overrides values that differ from `type`'s
   * @returns {string|null} why not, or null when added
   */
  addTemplate(name, type, overrides) {
    const problem = this.nameProblem(name);
    if (problem) return problem;
    const { extends: base, ...own } = this.enemies[type];
    this.data.enemies[name] = { extends: base ?? type, ...(base ? own : {}), ...structuredClone(overrides) };
    return null;
  }

  /**
   * Move values into a template: every enemy of it changes.
   * @returns {boolean} whether anything changed
   */
  updateTemplate(type, overrides) {
    if (!this.isTemplate(type) || Object.keys(overrides).length === 0) return false;
    this.data.enemies[type] = { ...this.enemies[type], ...structuredClone(overrides) };
    return true;
  }

  /**
   * Give a template another id, keeping its place in defs.json.
   * @returns {string|null} why not, or null when renamed
   */
  renameTemplate(from, to) {
    if (!this.isTemplate(from)) return `${from} is not a template.`;
    const problem = this.nameProblem(to);
    if (problem) return problem;
    this.data.enemies = Object.fromEntries(Object.entries(this.enemies).map(([id, type]) => [id === from ? to : id, type]));
    return null;
  }

  /** @returns {boolean} whether the template was there */
  deleteTemplate(type) {
    if (!this.isTemplate(type)) return false;
    delete this.data.enemies[type];
    return true;
  }
}
