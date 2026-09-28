/**
 * defs.json while the room editor changes its enemy templates (D58, D78):
 * every entry of `enemies` is one, with all its values or `extends` another
 * with only the values it changes. Room undo steps that change a template
 * take it along (room-edit.js). Plain logic, no browser.
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

  /** @returns {Record<string, object>} enemy templates by id, as written */
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

  /** Templates that extend `id` directly. */
  builtOn(id) {
    return Object.keys(this.enemies).filter((other) => this.enemies[other].extends === id);
  }

  /**
   * Why `name` can't be a new template id, or null.
   * @param {string} name
   */
  nameProblem(name) {
    if (!ID_PATTERN.test(name)) return 'Template name: lowercase letters, digits and _, starting with a letter.';
    if (this.enemies[name]) return `Template name: "${name}" is taken.`;
    return null;
  }

  /**
   * Add a template built on `template`, with these values of its own.
   * @param {string} name
   * @param {string} template the template the settings are of
   * @param {object} overrides values that differ from it
   * @returns {string|null} why not, or null when added
   */
  addTemplate(name, template, overrides) {
    const problem = this.nameProblem(name);
    if (problem) return problem;
    this.data.enemies[name] = { extends: template, ...structuredClone(overrides) };
    return null;
  }

  /**
   * Move values into a template: every enemy of it changes, and every
   * template built on it that doesn't set them itself.
   * @returns {boolean} whether anything changed
   */
  updateTemplate(template, overrides) {
    if (!this.enemies[template] || Object.keys(overrides).length === 0) return false;
    this.data.enemies[template] = { ...this.enemies[template], ...structuredClone(overrides) };
    return true;
  }

  /**
   * Give a template another id, keeping its place in defs.json; templates
   * built on it follow.
   * @returns {string|null} why not, or null when renamed
   */
  renameTemplate(from, to) {
    if (!this.enemies[from]) return `${from} is not a template.`;
    const problem = this.nameProblem(to);
    if (problem) return problem;
    this.data.enemies = Object.fromEntries(
      Object.entries(this.enemies).map(([id, template]) => [
        id === from ? to : id,
        template.extends === from ? { ...template, extends: to } : template,
      ]),
    );
    return null;
  }

  /**
   * Remove a template no other template builds on.
   * @returns {string|null} why not, or null when deleted
   */
  deleteTemplate(template) {
    if (!this.enemies[template]) return `${template} is not a template.`;
    const children = this.builtOn(template);
    if (children.length > 0) return `${children.join(', ')} ${children.length === 1 ? 'is' : 'are'} built on ${template}: change or delete ${children.length === 1 ? 'it' : 'them'} first.`;
    delete this.data.enemies[template];
    return null;
  }
}
