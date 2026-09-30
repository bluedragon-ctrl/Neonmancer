/**
 * lore.json while the room editor changes its screen texts (D118): add a
 * text, or change one (every screen showing it changes). Room undo steps
 * that change a text take it along (room-edit.js). Plain logic, no browser.
 */
import { DATA_SCHEMA_VERSION } from '../core/version.js';
import { loreProblem } from '../data/lore.js';
import { applyEntryChange } from './defs-edit.js';
import { formatJson } from './format-json.js';
import { ID_PATTERN } from './room-edit.js';

/** lore.json before its first text. */
const EMPTY = { $schema: '../schemas/lore.schema.json', schemaVersion: DATA_SCHEMA_VERSION, texts: {} };

export class LoreEdit {
  /** @param {object} [data] lore.json contents; none yet: an empty file */
  constructor(data) {
    this.data = structuredClone(data ?? EMPTY);
    /** Text of the file as last saved (or loaded; '' when there is no file yet), to tell unsaved changes. */
    this.savedText = data ? this.text() : '';
  }

  /** @returns {Record<string, { title?: string, lines: string[] }>} texts by id */
  get texts() {
    return this.data.texts;
  }

  toData() {
    return structuredClone(this.data);
  }

  text() {
    return formatJson(this.data);
  }

  /** Changed since saved; a file not written yet only once it has a text. */
  get dirty() {
    return this.savedText === '' ? Object.keys(this.texts).length > 0 : this.text() !== this.savedText;
  }

  markSaved() {
    this.savedText = this.text();
  }

  /**
   * Make the text changes that turned text() `from` into `to` again (undo,
   * redo), keeping any other change made since (another room's).
   */
  applyChange(from, to) {
    this.data.texts = applyEntryChange(from, to, 'texts', this.texts);
  }

  /**
   * Why `id` can't be a new text id, or null.
   * @param {string} id
   */
  idProblem(id) {
    if (!ID_PATTERN.test(id)) return 'Text id: lowercase letters, digits and _, starting with a letter.';
    if (this.texts[id]) return `Text id: "${id}" is taken.`;
    return null;
  }

  /**
   * Add a text.
   * @param {string} id
   * @param {{ title?: string, lines: string[] }} text
   * @returns {string|null} why not, or null when added
   */
  addText(id, text) {
    const problem = this.idProblem(id) ?? loreProblem(text);
    if (problem) return problem;
    this.data.texts[id] = entry(text);
    return null;
  }

  /**
   * Change a text: every screen showing it shows the new one.
   * @param {string} id
   * @param {{ title?: string, lines: string[] }} text
   * @returns {string|null} why not, or null when changed (or already so)
   */
  updateText(id, text) {
    if (!this.texts[id]) return `No text "${id}".`;
    const problem = loreProblem(text);
    if (problem) return problem;
    this.data.texts[id] = entry(text);
    return null;
  }
}

/** A text as lore.json writes it: no title key when it has none. */
function entry({ title, lines }) {
  return { ...(title && { title }), lines: [...lines] };
}
