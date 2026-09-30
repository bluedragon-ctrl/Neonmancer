/**
 * defs.json while the room editor changes its enemy templates (D58, D79):
 * every entry of `enemies` is one, with all its values or `extends` another
 * with only the values it changes. Room undo steps that change a template
 * take it along (room-edit.js). Plain logic, no browser.
 */
import { FileEdit, applyEntryChange } from './file-edit.js';
import { idProblem } from './ids.js';

export class DefsEdit extends FileEdit {
  /** @returns {Record<string, object>} enemy templates by id, as written */
  get enemies() {
    return this.data.enemies ?? {};
  }

  /**
   * Make the template changes that turned text() `from` into `to` again
   * (undo, redo), keeping any other change made since (another room's).
   * @param {string} from
   * @param {string} to
   */
  applyChange(from, to) {
    this.data.enemies = applyEntryChange(from, to, 'enemies', this.enemies);
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
    return idProblem('Template name', name, Object.keys(this.enemies));
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
