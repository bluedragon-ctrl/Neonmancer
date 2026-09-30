/**
 * The room editor's screen texts (D118): picking a screen's text from
 * lore.json, writing a new one for it, changing one. Functions of the
 * Editor (editor.js); each change is one undo step of the edited room,
 * lore.json's part included.
 */
import { TEXT_LOOKS } from '../data/lore.js';

/**
 * The picked object if it is a screen (a decoration that shows a text), or null.
 * @param {import('./editor.js').Editor} editor
 */
export function pickedScreen(editor) {
  const item = editor.selectedItem;
  const type = item && editor.objectTypes[item.type];
  return type?.kind === 'deco' && TEXT_LOOKS.includes(item.overrides?.look ?? type.look) ? item : null;
}

/**
 * Show text `id` of lore.json on the picked screen, or none (null).
 * @param {import('./editor.js').Editor} editor
 * @param {string|null} id
 */
export function setScreenText(editor, id) {
  const screen = pickedScreen(editor);
  if (!screen) return;
  editor.change(() => editor.edit.setText(screen.id, id));
  editor.status = id ? `${screen.id} shows ${id}.` : `${screen.id} shows no text.`;
  editor.refresh();
}

/**
 * Add a text to lore.json and show it on the picked screen.
 * @param {import('./editor.js').Editor} editor
 * @param {string} id
 * @param {{ title?: string, lines: string[] }} text
 */
export function newText(editor, id, text) {
  const screen = pickedScreen(editor);
  if (!screen) return;
  let problem = null;
  editor.change(() => editor.edit.edit(() => !(problem = editor.lore.addText(id, text)) && editor.edit.setText(screen.id, id)));
  editor.status = problem ?? `Text ${id} added to lore.json; ${screen.id} shows it. Save writes it.`;
  if (!problem) editor.panel.textIdInput.value = '';
  editor.refresh();
}

/**
 * Change the picked screen's text in lore.json: every screen showing it changes.
 * @param {import('./editor.js').Editor} editor
 * @param {{ title?: string, lines: string[] }} text
 */
export function updateText(editor, text) {
  const id = pickedScreen(editor)?.text;
  if (!id) return;
  let problem = null;
  const before = editor.lore.text();
  editor.change(() => editor.edit.edit(() => !(problem = editor.lore.updateText(id, text)) && editor.lore.text() !== before));
  const users = textUsers(editor, id);
  editor.status = problem ?? (editor.lore.text() === before ? `${id} is like this already.` : `Text ${id} changed${users.length > 1 ? ` for ${users.join(', ')}` : ''}. Save writes lore.json.`);
  editor.refresh();
}

/**
 * The screens showing text `id`, in every room: "room.screen".
 * @param {import('./editor.js').Editor} editor
 * @param {string} id
 * @returns {string[]}
 */
export function textUsers(editor, id) {
  return editor.roomIds().flatMap((room) =>
    (editor.roomData(room).objects ?? []).filter((object) => object.text === id).map((object) => `${room}.${object.id}`),
  );
}
