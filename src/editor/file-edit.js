/**
 * A data file several rooms share (world.json, defs.json, lore.json) while
 * the room editor changes it: the data, its text as last saved, and undo
 * of its entries among several rooms' steps. Plain logic, no browser.
 */
import { formatJson } from './format-json.js';

export class FileEdit {
  /** @param {object} data the file's contents */
  constructor(data) {
    this.data = structuredClone(data);
    /** Text as last saved (or loaded), to tell unsaved changes. */
    this.savedText = this.text();
  }

  toData() {
    return structuredClone(this.data);
  }

  /** The file's text (see format-json.js). */
  text() {
    return formatJson(this.data);
  }

  /** Are there changes since the last save? */
  get dirty() {
    return this.text() !== this.savedText;
  }

  /**
   * The file was saved.
   * @param {string} [text] the text written (edits made since stay unsaved); default: as it is now
   */
  markSaved(text = this.text()) {
    this.savedText = text;
  }
}

/**
 * Make the entry changes that turned file text `from` into `to` again in
 * `now` (the map under `key`), keeping entries changed since that weren't
 * part of it: undo and redo of a shared file (defs.json's templates,
 * lore.json's texts) among several rooms' steps.
 * @param {string} from
 * @param {string} to
 * @param {string} key
 * @param {Record<string, object>} now
 * @returns {Record<string, object>}
 */
export function applyEntryChange(from, to, key, now) {
  const [before, after] = [from, to].map((text) => JSON.parse(text)[key] ?? {});
  const changed = (id) => JSON.stringify(before[id]) !== JSON.stringify(after[id]);
  const out = {};
  for (const id of Object.keys(after)) {
    if (changed(id)) out[id] = after[id];
    else if (id in now) out[id] = now[id];
  }
  for (const id of Object.keys(now)) if (!(id in out) && !changed(id)) out[id] = now[id];
  return out;
}
