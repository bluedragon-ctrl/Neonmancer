/**
 * Monster editor (CLAUDE.md §9, D119): the enemy templates in defs.json,
 * where enemies are tuned (an enemy is all its template). The list on the
 * left: every template with its color, what it builds on and how many
 * enemies use it; new variants and copies, rename (the rooms' enemies
 * follow) and delete. The form on the right: every field, grouped, from
 * defs.schema.json (its limits and descriptions), each showing where its
 * value comes from (its own, a template it builds on, or the default) and
 * cleared with ×. In between, a live preview with the game's models
 * (monster-preview.js). Templates too alike in color are flagged.
 *
 * Save sends defs.json (and rooms a rename changed) to the dev server,
 * which checks everything first. Open /tools/monster-editor.html in the
 * dev server (`#template` picks one); it is not part of the build.
 */
import '../src/style.css';
import './monster-editor.css';
import defsSchema from '../schemas/defs.schema.json';
import { DATA_FILES, DEV_SERVER } from '../src/data/bundle.js';
import { FIELD_GROUPS, MonsterEdit } from '../src/editor/monster-edit.js';
import { DATA_SAVED_EVENT, saveFiles } from '../src/editor/save.js';
import { HOLO_TIME } from '../src/render/holo.js';
import { Renderer } from '../src/render/renderer.js';
import { MonsterPreview } from './monster-preview.js';

/** The schema of a template field: enum, type, limits, description. */
const PROPS = defsSchema.$defs.enemyTemplate.properties;
/** Window the game opens in from here (as from the world map tool): one tab, reused. */
const GAME_WINDOW = 'neonmancer-game';

const listEl = document.getElementById('list');
const formEl = document.getElementById('form');

const edit = DEV_SERVER ? new MonsterEdit(DATA_FILES) : null;
const state = {
  selected: null,
  status: '',
  statusKind: '',
  saving: false,
  /** Another page saved data files while this one had unsaved edits. */
  stale: false,
  /** Until then, a save announced is this page's own. */
  quietUntil: 0,
  /** The name typed for a new template or a rename. */
  name: '',
};

/** An element with a class, text and attributes. */
function html(tag, className = '', text, attrs = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  for (const [key, value] of Object.entries(attrs)) el[key] = value;
  return el;
}

function setStatus(text, kind = '') {
  state.status = text;
  state.statusKind = kind;
}

/** Pick a template. */
function select(id) {
  state.selected = id;
  render();
}

/**
 * Show how an edit went: why it couldn't be done (a string), or `done`
 * and, if given, the template to pick next (a new or renamed one).
 */
function attempt(problem, done, next) {
  if (problem) setStatus(problem, 'bad');
  else {
    setStatus(done, 'ok');
    state.name = '';
    if (next) state.selected = next;
  }
  render();
}

// --- The list ------------------------------------------------------------------

function drawList() {
  const clashes = edit.clashes();
  const clashing = new Set(clashes.flatMap(({ a, b }) => [a, b]));
  const selected = state.selected;
  const list = html('div', 'templates');
  for (const id of edit.ids) {
    const values = edit.values(id);
    const button = html('button', `template${id === selected ? ' selected' : ''}`);
    const swatch = html('span', 'swatch');
    swatch.style.background = values.color ?? 'transparent';
    swatch.style.boxShadow = `0 0 6px ${values.color ?? 'transparent'}`;
    const base = edit.templates[id].extends;
    const users = edit.usage(id).length;
    button.append(swatch, html('span', clashing.has(id) ? 'clash' : '', id), html('span', 'sub', `${base ? `on ${base} · ` : ''}${users}×`));
    button.title = `${id}: ${users} ${users === 1 ? 'enemy' : 'enemies'} in the rooms${base ? `, built on ${base}` : ''}`;
    button.addEventListener('click', () => select(id));
    list.append(button);
  }

  const name = html('input', '', undefined, { type: 'text', placeholder: 'new_template_name', value: state.name });
  name.addEventListener('input', () => (state.name = name.value.trim()));
  const variant = html('button', 'action', 'Variant', { title: `A new template built on ${selected}: only what you change is its own` });
  variant.addEventListener('click', () => {
    const id = state.name;
    attempt(edit.add(id, { from: selected }), `${id}: a variant of ${selected}, in a color of its own.`, id);
  });
  const copy = html('button', 'action', 'Copy', { title: `A new template with all of ${selected}'s values, built on nothing` });
  copy.addEventListener('click', () => {
    const id = state.name;
    attempt(edit.add(id, { from: selected, copy: true }), `${id}: a copy of ${selected}, in a color of its own.`, id);
  });
  const rename = html('button', 'action', 'Rename', { title: `Give ${selected} this name: the enemies of it and the templates built on it follow` });
  rename.addEventListener('click', () => {
    const [from, to] = [selected, state.name];
    attempt(edit.rename(from, to), `${from} is ${to} now (its enemies follow).`, to);
  });
  const remove = html('button', 'action', 'Delete', { title: `Remove ${selected} (only one no enemy uses and no template builds on)` });
  remove.addEventListener('click', () => {
    const id = selected;
    attempt(edit.remove(id), `${id} deleted.`);
  });
  const nameRow = html('div', 'name-row');
  nameRow.append(name);

  const actions = html('div');
  const undo = html('button', 'action', 'Undo', { disabled: edit.undoStack.length === 0 });
  undo.addEventListener('click', () => undoRedo(() => edit.undo()));
  const redo = html('button', 'action', 'Redo', { disabled: edit.redoStack.length === 0 });
  redo.addEventListener('click', () => undoRedo(() => edit.redo()));
  const save = html('button', 'action', state.saving ? 'Saving…' : 'Save', { disabled: !edit.dirty || state.saving });
  save.addEventListener('click', saveChanges);
  actions.append(undo, redo, save);

  const errors = edit.errors();
  const problems = html('ul', 'errors');
  for (const error of errors) problems.append(html('li', '', error));
  for (const { a, b, gap } of clashes) problems.append(html('li', '', `${a} and ${b} look alike (color gap ${gap.toFixed(3)}): give one another color.`));

  const game = html('a', 'dim', 'Open the game (F2: room editor)', { href: '/', target: GAME_WINDOW });
  listEl.replaceChildren(
    html('h1', '', 'MONSTER EDITOR'),
    html('p', 'dim', 'An enemy is all its template (D119).'),
    list,
    html('h2', '', 'NEW / RENAME'),
    nameRow,
    variant,
    copy,
    rename,
    remove,
    html('h2', '', 'SAVE'),
    actions,
    html('p', `status ${state.statusKind}`, state.status),
    ...(state.stale ? [html('p', 'bad', 'Another page saved data files: save or reload to see them.')] : []),
    problems,
    game,
  );
}

/** Undo or redo, then show it. */
function undoRedo(step) {
  if (step()) setStatus('');
  render();
}

// --- The form ------------------------------------------------------------------

/** Where a value comes from, in words. */
function sourceText(source) {
  if (source === 'own') return 'own';
  if (source === 'default') return 'default';
  if (source === null) return 'missing';
  return `from ${source}`;
}

/** The control for a field, reporting a new value (undefined: cleared) to `set`. */
function control(key, value, set) {
  const prop = PROPS[key];
  if (prop.enum || prop.type === 'boolean') {
    const options = prop.enum ?? [true, false];
    const el = html('select');
    el.append(...options.map((option) => html('option', '', option === true ? 'yes' : option === false ? 'no' : String(option), { value: String(option) })));
    el.value = String(value);
    el.addEventListener('change', () => set(options.find((option) => String(option) === el.value)));
    return el;
  }
  // A block of its own (a boss's, D135): edited as JSON; text that doesn't parse is kept out.
  if (prop.type === 'object') {
    const el = html('textarea', 'json', undefined, { rows: '8', spellcheck: 'false', placeholder: '{ "phases": [{ "from": 1 }] }' });
    el.value = value === undefined ? '' : JSON.stringify(value, null, 2);
    el.addEventListener('change', () => {
      const text = el.value.trim();
      if (!text) return set(undefined);
      try {
        set(JSON.parse(text));
      } catch {
        el.classList.add('bad');
      }
    });
    return el;
  }
  if (prop.$ref?.endsWith('/color')) {
    const pair = html('div', 'color-pair');
    const text = html('input', '', undefined, { type: 'text', value: value ?? '', placeholder: '#rrggbb' });
    const picker = html('input', '', undefined, { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#000000' });
    text.addEventListener('change', () => set(text.value.trim() || undefined));
    picker.addEventListener('change', () => set(picker.value));
    pair.append(text, picker);
    return pair;
  }
  const min = prop.minimum ?? prop.exclusiveMinimum;
  const el = html('input', '', undefined, {
    type: 'number',
    value: value ?? '',
    step: prop.type === 'integer' ? '1' : '0.1',
    ...(min !== undefined && { min: String(min) }),
    ...(prop.maximum !== undefined && { max: String(prop.maximum) }),
  });
  el.addEventListener('change', () => set(Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : undefined));
  return el;
}

function drawForm() {
  const id = state.selected;
  const template = edit.templates[id];
  const help = html('div', 'help', 'Point at a field for what it does.');
  const explain = (text) => (help.textContent = text);

  const base = html('select');
  base.append(html('option', '', '— nothing —', { value: '' }), ...edit.ids.filter((other) => other !== id).map((other) => html('option', '', other, { value: other })));
  base.value = template.extends ?? '';
  base.addEventListener('change', () => attempt(edit.setBase(id, base.value || null), base.value ? `${id} builds on ${base.value} (it does the same as before).` : `${id} builds on nothing (its values are all its own now).`));
  const baseRow = html('div', 'row');
  baseRow.append(html('label', '', 'Builds on'), base, html('span', 'source', ''), html('span'));
  baseRow.addEventListener('mouseenter', () => explain(PROPS.extends.description));

  const users = edit.usage(id);
  const children = edit.builtOn(id);
  const parts = [
    html('h1', '', id),
    html('p', 'used', users.length > 0 ? `Used by ${users.join(', ')}.` : 'No enemy uses it yet.'),
    ...(children.length > 0 ? [html('p', 'used', `Built on by ${children.join(', ')}: they change with it.`)] : []),
    baseRow,
  ];
  for (const [group, keys] of FIELD_GROUPS) {
    parts.push(html('h2', '', group.toUpperCase()));
    for (const key of keys) {
      const { value, source } = edit.field(id, key);
      const row = html('div', `row${source === 'own' ? '' : ' inherited'}${source === null ? ' missing' : ''}`);
      const set = (next) => {
        if (edit.setField(id, key, next)) setStatus('');
        render();
      };
      const clear = html('button', 'clear', source === 'own' ? '×' : '', { title: `Clear: take it from ${template.extends ?? 'the default'}` });
      if (source === 'own') clear.addEventListener('click', () => set(undefined));
      row.append(html('label', '', key), control(key, value, set), html('span', 'source', sourceText(source)), clear);
      row.addEventListener('mouseenter', () => explain(`${key}: ${PROPS[key].description ?? ''}`));
      row.addEventListener('focusin', () => explain(`${key}: ${PROPS[key].description ?? ''}`));
      parts.push(row);
    }
  }
  parts.push(help);
  formEl.replaceChildren(...parts);
}

// --- Drawing, saving, keys -------------------------------------------------

function render() {
  // The picked template may be gone (deleted, or a rename undone): pick the first.
  if (!edit.templates[state.selected]) state.selected = edit.ids[0];
  // In the address too, so a reload keeps it.
  if (location.hash.slice(1) !== state.selected) history.replaceState(null, '', `#${state.selected}`);
  drawList();
  drawForm();
  preview?.show(edit.values(state.selected));
}

async function saveChanges() {
  if (!edit.dirty || state.saving) return;
  state.saving = true;
  setStatus('Saving…');
  render();
  const sent = edit.changes();
  const result = await saveFiles({ defs: sent.defs, rooms: sent.rooms });
  state.saving = false;
  state.quietUntil = performance.now() + 1500;
  if (result.ok) {
    edit.markSaved(sent);
    setStatus(`Saved ${result.files.join(', ')}.`, 'ok');
  } else {
    setStatus(`Not saved: ${result.errors.join(' · ')}`, 'bad');
  }
  render();
}

// Another page (the room editor, the world map) saved: show the data as it
// is now, unless that would lose edits not saved yet.
import.meta.hot?.on(DATA_SAVED_EVENT, () => {
  if (state.saving || performance.now() < state.quietUntil) return;
  if (!edit.dirty) location.reload();
  else {
    state.stale = true;
    render();
  }
});

window.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
  if (!(e.ctrlKey || e.metaKey)) return;
  const action = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', s: 'save' }[e.key.toLowerCase()];
  if (!action || (typing && action !== 'save')) return;
  e.preventDefault();
  if (typing) e.target.blur();
  if (action === 'save') saveChanges();
  else undoRedo(() => edit[action]());
});

window.addEventListener('beforeunload', (event) => {
  if (edit?.dirty) event.preventDefault();
});

window.addEventListener('hashchange', () => select(decodeURIComponent(location.hash.slice(1))));

// --- Start -------------------------------------------------------------------

let preview = null;
if (!DEV_SERVER) {
  listEl.append(html('h1', '', 'MONSTER EDITOR'), html('p', '', 'The monster editor runs in the dev server only (npm run dev).'));
  formEl.hidden = true;
} else {
  const renderer = new Renderer(document.getElementById('app'));
  preview = new MonsterPreview(renderer);
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    HOLO_TIME.value = now / 1000;
    preview.update(dt, now / 1000);
    renderer.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  select(decodeURIComponent(location.hash.slice(1)));
}
