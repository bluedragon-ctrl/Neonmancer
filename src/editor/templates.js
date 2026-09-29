/**
 * The room editor's enemy templates (D58, D79): saving the enemy settings
 * as a new template, moving them into their template, renaming and
 * deleting one, all in defs.json. Functions of the Editor (editor.js); each
 * change is one undo step of the edited room.
 */
import { resolveEnemyTemplates } from '../data/room-data.js';

/**
 * Save the enemy settings as a new template in defs.json, built on the
 * template they are of (D58, D79); the picked enemy becomes one of it,
 * and so do new ones. One undo step of the room.
 * @param {import('./editor.js').Editor} editor
 * @param {string} name the template's id
 */
export function saveTemplate(editor, name) {
  const { template, overrides } = editor.enemySettings;
  let problem = null;
  templateChange(editor, () => {
    problem = editor.defs.addTemplate(name, template, overrides);
    return !problem && useTemplate(editor, name);
  });
  editor.status = problem ?? `Template ${name} (built on ${template}) added to defs.json; Save writes it.`;
  if (!problem) editor.panel.templateInput.value = '';
  editor.refresh();
}

/**
 * Move the enemy's own settings into its template: every enemy of it
 * changes, in every room, and so do the templates built on it.
 * @param {import('./editor.js').Editor} editor
 */
export function updateTemplate(editor) {
  const { template, overrides } = editor.enemySettings;
  let done = false;
  templateChange(editor, () => (done = editor.defs.updateTemplate(template, overrides) && useTemplate(editor, template)));
  if (done) editor.status = `Template ${template} updated; this changes ${reach(editor, template)}. Save writes defs.json.`;
  editor.refresh();
}

/**
 * What a change of `template` reaches: the rooms with enemies of it, and the templates built on it.
 * @param {import('./editor.js').Editor} editor
 */
function reach(editor, template) {
  const rooms = roomsUsing(editor, template);
  const children = editor.defs.builtOn(template);
  return [
    `every ${template}${rooms.length > 0 ? ` (${rooms.join(', ')})` : ''}`,
    children.length > 0 && `the templates built on it (${children.join(', ')})`,
  ].filter(Boolean).join(' and ');
}

/**
 * Give the template of the enemy settings another id; the room's enemies of it follow, and templates built on it.
 * @param {import('./editor.js').Editor} editor
 */
export function renameTemplate(editor, name) {
  const { template } = editor.enemySettings;
  const elsewhere = roomsUsing(editor, template).filter((room) => room !== editor.edit.id);
  if (elsewhere.length > 0) {
    editor.status = `${template} is used in ${elsewhere.join(', ')}: only a template no other room uses can be renamed.`;
    return editor.refresh();
  }
  let problem = null;
  templateChange(editor, () => {
    problem = editor.defs.renameTemplate(template, name);
    if (problem) return false;
    applyEnemyTemplates(editor);
    for (const enemy of (editor.edit.data.enemies ?? []).filter((e) => e.template === template)) {
      const settings = { template: name, overrides: enemy.overrides ?? {} };
      const id = editor.edit.setEnemy(enemy.id, settings, editor.walksPath(settings));
      if (id && editor.selected?.id === enemy.id) editor.selected = { kind: 'item', id };
    }
    if (editor.enemy.template === template) editor.enemy.template = name;
    return true;
  });
  editor.status = problem ?? `Template ${template} renamed ${name}. Save writes defs.json.`;
  if (!problem) editor.panel.templateInput.value = '';
  editor.refresh();
}

/**
 * Remove the template of the enemy settings from defs.json, if no enemy is of it and no template built on it.
 * @param {import('./editor.js').Editor} editor
 */
export function deleteTemplate(editor) {
  const { template } = editor.enemySettings;
  const rooms = roomsUsing(editor, template);
  if (rooms.length > 0) {
    editor.status = `${template} is used in ${rooms.join(', ')}: change or remove those enemies first.`;
    return editor.refresh();
  }
  const parent = editor.defs.enemies[template]?.extends;
  let problem = null;
  templateChange(editor, () => {
    if ((problem = editor.defs.deleteTemplate(template))) return false;
    editor.enemy = { template: parent ?? Object.keys(editor.defs.enemies)[0], overrides: {} };
    applyEnemyTemplates(editor);
    return true;
  });
  editor.status = problem ?? `Template ${template} deleted. Save writes defs.json.`;
  editor.refresh();
}

/**
 * A change of the enemy templates, one undo step of the room (with what
 * it does to the room's enemies).
 * @param {import('./editor.js').Editor} editor
 * @param {() => boolean} change
 */
function templateChange(editor, change) {
  editor.change(() => editor.edit.edit(change));
}

/**
 * Rooms with enemies of `template`.
 * @param {import('./editor.js').Editor} editor
 */
function roomsUsing(editor, template) {
  return editor.roomIds().filter((id) => (editor.roomData(id).enemies ?? []).some((enemy) => enemy.template === template));
}

/**
 * The templates changed: the picked enemy (and new ones) take template
 * `template` with no overrides of their own.
 * @param {import('./editor.js').Editor} editor
 * @returns {true}
 */
function useTemplate(editor, template) {
  applyEnemyTemplates(editor);
  editor.enemy = { template, overrides: {} };
  const enemy = editor.selectedEnemy;
  if (enemy) {
    const id = editor.edit.setEnemy(enemy.id, editor.enemy, editor.walksPath(editor.enemy));
    if (id) editor.selected = { kind: 'item', id };
  }
  return true;
}

/**
 * Hand the edited templates (filled in) to the game and the panel.
 * @param {import('./editor.js').Editor} editor
 */
export function applyEnemyTemplates(editor) {
  const templates = editor.defs.enemies;
  editor.enemyTemplates = resolveEnemyTemplates(templates);
  editor.game.content.enemyTemplates = editor.enemyTemplates;
  editor.panel.setEnemyTemplates(editor.enemyTemplates, templates);
  editor.defsApplied = editor.defs.text();
  // New enemies of a template that is gone (undo, delete) are of the first one.
  if (!editor.enemyTemplates[editor.enemy.template]) editor.enemy = { template: Object.keys(editor.enemyTemplates)[0], overrides: {} };
}
