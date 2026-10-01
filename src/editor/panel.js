/**
 * The room editor's side panel (D56, D57): room settings, height layer,
 * tools and their fields, undo/redo/save and the validation errors. Plain
 * DOM; it only shows state and reports changes to the editor
 * (src/editor/editor.js). A tool, so its text is written here, not in
 * strings.json (like the debug readout).
 */
import { isFunctionKey } from '../core/input.js';
import { LORE_LIMITS } from '../data/lore.js';
import { EXIT_DEFAULTS, PATH_DEFAULTS, withEnemyDefaults } from '../data/room-data.js';

/**
 * The editor's tools, in panel order; `key` is the digit that picks it.
 * Left click places, right click erases.
 */
export const TOOLS = [
  { id: 'block', label: 'Block', key: '1' },
  { id: 'hole', label: 'Hole', key: '2' },
  { id: 'object', label: 'Object', key: '3' },
  { id: 'enemy', label: 'Enemy', key: '4' },
  { id: 'path', label: 'Path', key: '5' },
  { id: 'exit', label: 'Exit', key: '6' },
  { id: 'spawn', label: 'Spawn', key: '7' },
  { id: 'reset', label: 'Reset', key: '8' },
  { id: 'shrine', label: 'Shrine', key: '9' },
];

/**
 * What an enemy template does, in a few words for the Enemy tool (D119):
 * `bug · patrol · touch · hostile · 2 hits · speed 3 · bouncy`.
 * @param {object} template filled in (resolveEnemyTemplates())
 */
export function templateText(template) {
  const values = withEnemyDefaults(template);
  const attack = values.attack === 'bolt' && values.boltPattern === 'cross' ? 'bolt ×4' : values.attack;
  return [
    values.look,
    values.movement,
    attack,
    values.hostility,
    `${values.integrity} hit${values.integrity === 1 ? '' : 's'}`,
    `speed ${values.speed}`,
    values.bounce && 'bouncy',
    values.solid && 'solid',
    !values.pausable && 'unpausable',
  ]
    .filter(Boolean)
    .join(' · ');
}

const HELP = [
  'Left click: place / pick · Right click: erase',
  `Wheel or PgUp/PgDn: layer · ${TOOLS[0].key}–${TOOLS.at(-1).key}: tool`,
  'Esc: drop the selection · Del: remove it',
  'Ctrl+Z / Ctrl+Y: undo / redo · Ctrl+S: save',
  'F2: play the room · F3: debug',
];

/** What a tool's fields say while nothing is picked, and while something is. */
const HINTS = {
  enemy: ['New enemies are of this template. Click an enemy to pick it.', (id) => `${id} picked: a template picked here is its new one, and new enemies'.`],
  path: ['Click a platform or an enemy to pick it.', (id) => `Path of ${id}: click cells to add points, right click takes the last one off.`],
  exit: ['Click an edge cell to open an exit there, or an exit to pick it.', (id) => `Editing exit ${id}.`],
};

/**
 * A block type in a few words for the type list: what it does
 * (`hurts 1`, `lethal`, `collapsing, regrows 3 s`) or its look.
 * @param {{ look?: string, kind?: string, damage?: number, lethal?: boolean, regrow?: number }} type
 */
export function blockTypeText(type) {
  if (type.kind) return type.regrow ? `${type.kind}, regrows ${type.regrow} s` : type.kind;
  const does = [type.damage && `hurts ${type.damage}`, type.lethal && 'lethal'].filter(Boolean);
  return does.join(', ') || type.look;
}

/** An element with a class and optional text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** An option of a select. */
function option(value, label) {
  return Object.assign(el('option', '', label), { value });
}

/** A select with these [value, label] options. */
function select(options) {
  const node = el('select');
  node.append(...options.map(([value, label]) => option(value, label)));
  return node;
}

/** A number field; blank means the default (placeholder). */
function numberInput({ min, step, placeholder = '' }) {
  return Object.assign(el('input'), { type: 'number', min: String(min), step: String(step), placeholder });
}

/** A number field's value, or undefined when blank. */
function numberValue(input) {
  return Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : undefined;
}

/**
 * A text as typed in the panel (D118): the title field (blank: none) and one
 * line per row of the box, trailing spaces and empty rows at the end dropped.
 * @param {string} title
 * @param {string} body
 * @returns {{ title?: string, lines: string[] }}
 */
export function typedText(title, body) {
  const trimmed = body.replace(/\s+$/, '');
  const lines = trimmed === '' ? [] : trimmed.split('\n').map((line) => line.trimEnd());
  return { ...(title.trim() && { title: title.trim() }), lines };
}

/** A text's first line, cut short, for the list of texts. */
const preview = (text) => {
  const first = text.title ?? text.lines[0] ?? '';
  return first.length > 24 ? `${first.slice(0, 23)}…` : first;
};

export class EditorPanel {
  /**
   * @param {HTMLElement} root the stage (the panel scales with --u)
   * @param {object} options
   * @param {Record<string, { look?: string, kind?: string }>} options.blockTypes block types the Block tool places (resolved, D60)
   * @param {Record<string, { kind: string, color: string }>} options.objectTypes object types that can be placed
   * @param {Record<string, object>} options.enemyTemplates enemy templates (defs.json, filled in)
   * @param {Record<string, { name: string }>} options.biomes
   * @param {boolean} options.canSave the dev server can save; a build only exports
   * @param {Record<string, Function>} options.on callbacks: room(id), newRoom(id), tool(id), blockType(id), objectType(id),
   *   enemyTemplate(id),
   *   screenText(id|null), newText(id, text), updateText(text),
   *   path(field, value), clearPath(), exit(field, value), layer(step), cut(on), discard(), error(text), name(text),
   *   authored(on), biome(id), size([x, y, z]), undo(), redo(), save(), revert()
   */
  constructor(root, { blockTypes, objectTypes, enemyTemplates, biomes, canSave, on }) {
    this.canSave = canSave;
    this.on = on;
    this.hints = {};
    this.element = el('div', 'editor-panel');
    this.element.hidden = true;
    // Keep clicks and the wheel on the panel from reaching the game canvas.
    this.element.addEventListener('contextmenu', (e) => e.preventDefault());

    const title = el('div', 'editor-title', 'ROOM EDITOR');
    this.roomLabel = el('div', 'editor-room');
    /** What is in the cell under the mouse. */
    this.hoverLine = el('div', 'editor-hover');
    this.status = el('div', 'editor-status');
    this.errors = el('ul', 'editor-errors');
    const help = el('div', 'editor-help');
    for (const line of HELP) help.append(el('div', '', line));

    this.element.append(
      title,
      this.roomLabel,
      this.roomGroup(biomes),
      this.layerRow(),
      this.hoverLine,
      this.toolRow(),
      ...this.typeGroups(blockTypes, objectTypes),
      this.enemyGroup(enemyTemplates),
      this.pathGroup(),
      this.exitGroup(),
      this.actionRow(canSave),
      this.status,
      this.errors,
      help,
    );
    root.append(this.element);
    this.releaseKeyboard();
  }

  /** The room: which one, a new one, its name, biome and size. */
  roomGroup(biomes) {
    const { on } = this;
    this.roomSelect = el('select');
    this.roomSelect.addEventListener('change', () => on.room(this.roomSelect.value));
    this.newRoomInput = Object.assign(el('input'), { type: 'text', placeholder: 'new_room_id' });
    const newRoomButton = el('button', 'editor-small', 'New');
    const createRoom = () => {
      const id = this.newRoomInput.value.trim();
      if (id) on.newRoom(id);
    };
    newRoomButton.addEventListener('click', createRoom);
    this.newRoomInput.addEventListener('keydown', (e) => e.key === 'Enter' && createRoom());
    const newRoomRow = el('div', 'editor-row');
    newRoomRow.append(el('span', 'editor-label', 'New room'), this.newRoomInput, newRoomButton);

    this.nameInput = Object.assign(el('input'), { type: 'text' });
    this.nameInput.addEventListener('change', () => on.name(this.nameInput.value.trim()));
    // A real game room (D90): development steps leave it alone.
    this.authoredInput = Object.assign(el('input'), { type: 'checkbox', title: 'A real game room: development steps never change it or attach rooms to it (D90)' });
    this.authoredInput.addEventListener('change', () => on.authored(this.authoredInput.checked));
    const authored = el('label', 'editor-check');
    authored.append(this.authoredInput, ' real game room');
    this.biomeSelect = select(Object.entries(biomes).map(([id, biome]) => [id, biome.name]));
    this.biomeSelect.addEventListener('change', () => on.biome(this.biomeSelect.value));
    // A size takes effect as soon as a field is committed (Enter, or leaving it).
    this.sizeInputs = ['x', 'y', 'z'].map(() => Object.assign(el('input', 'editor-size'), { type: 'number', min: '1', step: '1' }));
    for (const input of this.sizeInputs) {
      input.addEventListener('change', () => {
        // Let go first, so a refused size snaps back to the room's own.
        input.blur();
        on.size(this.sizeInputs.map((field) => Number(field.value)));
      });
    }
    const sizeRow = el('div', 'editor-row');
    sizeRow.append(el('span', 'editor-label', 'Size'), ...this.sizeInputs);
    // A new room that was never saved can be thrown away.
    this.discardButton = el('button', 'editor-action', 'Discard new room');
    this.discardButton.addEventListener('click', () => on.discard());
    const group = el('div', 'editor-group');
    group.append(this.row('Room', this.roomSelect), newRoomRow, this.row('Name', this.nameInput), this.row('Authored', authored), this.row('Biome', this.biomeSelect), sizeRow, this.discardButton);
    return group;
  }

  /** The height layer being edited, and hiding what is above it. */
  layerRow() {
    const { on } = this;
    this.layerLabel = el('span', 'editor-value');
    const down = el('button', 'editor-small', '−');
    const up = el('button', 'editor-small', '+');
    down.addEventListener('click', () => on.layer(-1));
    up.addEventListener('click', () => on.layer(1));
    this.cutInput = Object.assign(el('input'), { type: 'checkbox' });
    this.cutInput.addEventListener('change', () => on.cut(this.cutInput.checked));
    const cut = el('label', 'editor-check');
    cut.append(this.cutInput, ' hide above');
    const layer = el('div', 'editor-row editor-layer');
    layer.append(el('span', 'editor-label', 'Layer'), down, this.layerLabel, up, cut);
    return layer;
  }

  /** A button per tool. */
  toolRow() {
    const { on } = this;
    this.toolButtons = new Map();
    const tools = el('div', 'editor-tools');
    for (const tool of TOOLS) {
      const button = el('button', 'editor-tool');
      button.append(el('span', 'editor-key', tool.key), ` ${tool.label}`);
      button.addEventListener('click', () => on.tool(tool.id));
      this.toolButtons.set(tool.id, button);
      tools.append(button);
    }
    return tools;
  }

  /** Fields of the Block and Object tools, shown only while picked. */
  typeGroups(blockTypes, objectTypes) {
    const { on } = this;
    this.blockSelect = select(Object.entries(blockTypes).map(([id, type]) => [id, `${id} (${blockTypeText(type)})`]));
    this.blockSelect.addEventListener('change', () => on.blockType(this.blockSelect.value));
    this.blockRows = el('div', 'editor-group');
    this.blockRows.append(this.row('Type', this.blockSelect));
    this.objectSelect = select(Object.entries(objectTypes).map(([id, type]) => [id, `${id} (${type.kind})`]));
    this.objectSelect.addEventListener('change', () => on.objectType(this.objectSelect.value));
    this.objectRows = el('div', 'editor-group');
    this.objectRows.append(this.row('Object', this.objectSelect), this.textGroup());
    return [this.blockRows, this.objectRows];
  }

  /**
   * Fields of a picked screen (D118): the text of lore.json it shows, that
   * text to change (every screen showing it changes), or a new one.
   */
  textGroup() {
    const { on } = this;
    this.textRows = el('div', 'editor-group');
    this.textHint = el('div', 'editor-hint');
    this.textSelect = el('select');
    this.textSelect.title = 'The text of data/lore.json the wizard\'s terminal shows when he comes near this screen';
    this.textSelect.addEventListener('change', () => on.screenText(this.textSelect.value || null));
    this.textTitle = Object.assign(el('input'), { type: 'text', placeholder: 'title (optional)', maxLength: LORE_LIMITS.titleLength });
    this.textBody = Object.assign(el('textarea', 'editor-text'), {
      rows: LORE_LIMITS.lines,
      placeholder: `up to ${LORE_LIMITS.lines} lines of ${LORE_LIMITS.lineLength} characters`,
      spellcheck: false,
    });
    this.textUsers = el('div', 'editor-hint');
    const typed = () => typedText(this.textTitle.value, this.textBody.value);
    this.updateTextButton = el('button', 'editor-action');
    this.updateTextButton.addEventListener('click', () => on.updateText(typed()));
    this.textIdInput = Object.assign(el('input'), { type: 'text', placeholder: 'new_text_id' });
    const addText = () => this.textIdInput.value.trim() && on.newText(this.textIdInput.value.trim(), typed());
    const newButton = el('button', 'editor-small', 'New');
    newButton.title = 'Add the text above to lore.json under this id; this screen shows it';
    newButton.addEventListener('click', addText);
    this.textIdInput.addEventListener('keydown', (e) => e.key === 'Enter' && addText());
    const newRow = el('div', 'editor-row');
    newRow.append(el('span', 'editor-label', 'New text'), this.textIdInput, newButton);
    this.textRows.append(this.textHint, this.row('Text', this.textSelect), this.row('Title', this.textTitle), this.textBody, this.textUsers, this.updateTextButton, newRow);
    return this.textRows;
  }

  /**
   * Fields of the Enemy tool: the template of new enemies and of the picked
   * one, and what it does. Templates are made in defs.json (D119).
   */
  enemyGroup(enemyTemplates) {
    const { on } = this;
    this.enemyTemplate = el('select');
    this.enemyTemplate.title = 'The enemy template (defs.json): everything about the enemy but its cell and path (D119)';
    this.enemyTemplate.addEventListener('change', () => on.enemyTemplate(this.enemyTemplate.value));
    this.enemyText = el('div', 'editor-hint');
    // Templates are tuned in the monster editor (dev server only, D119).
    this.monsterLink = Object.assign(el('a', 'editor-link', 'Edit in the monster editor'), { target: 'neonmancer-monsters', hidden: !this.canSave });
    // A boss drops one of the room's permanent pickups (D104, D135).
    this.enemyDrop = el('select');
    this.enemyDrop.title = "The room pickup this boss holds until it is beaten (D104); while it is found, the boss stays away";
    this.enemyDrop.addEventListener('change', () => on.enemyDrop(this.enemyDrop.value));
    this.enemyDropRow = this.row('Drops', this.enemyDrop);
    this.enemyRows = this.group('enemy');
    this.enemyRows.append(this.row('Template', this.enemyTemplate), this.enemyDropRow, this.enemyText, this.monsterLink);
    this.setEnemyTemplates(enemyTemplates);
    return this.enemyRows;
  }

  /** Fields of the Path tool. */
  pathGroup() {
    const { on } = this;
    this.pathMode = select([['pingpong', 'there and back'], ['loop', 'loop']]);
    this.pathMode.addEventListener('change', () => on.path('mode', this.pathMode.value === PATH_DEFAULTS.mode ? undefined : this.pathMode.value));
    this.pathSpeed = numberInput({ min: 0.1, step: 0.5 });
    this.pathSpeed.addEventListener('change', () => on.path('speed', numberValue(this.pathSpeed)));
    this.pathPause = numberInput({ min: 0, step: 0.1, placeholder: String(PATH_DEFAULTS.pause) });
    this.pathPause.addEventListener('change', () => on.path('pause', numberValue(this.pathPause)));
    this.clearPath = el('button', 'editor-action', 'Clear path');
    this.clearPath.addEventListener('click', () => on.clearPath());
    this.pathRows = this.group('path');
    this.pathRows.append(this.row('Mode', this.pathMode), this.row('Speed', this.pathSpeed), this.row('Pause (s)', this.pathPause), this.clearPath);
    return this.pathRows;
  }

  /** Fields of the Exit tool. */
  exitGroup() {
    const { on } = this;
    this.exitId = Object.assign(el('input'), { type: 'text' });
    this.exitId.addEventListener('change', () => this.exitId.value.trim() && on.exit('id', this.exitId.value.trim()));
    this.exitWidth = numberInput({ min: 1, step: 1 });
    this.exitWidth.addEventListener('change', () => on.exit('width', numberValue(this.exitWidth) ?? EXIT_DEFAULTS.width));
    this.exitHeight = numberInput({ min: 2, step: 1 });
    this.exitHeight.addEventListener('change', () => on.exit('height', numberValue(this.exitHeight) ?? EXIT_DEFAULTS.height));
    // Where a picked exit is: along its side, and its floor level.
    this.exitAt = numberInput({ min: 0, step: 1 });
    this.exitAt.addEventListener('change', () => numberValue(this.exitAt) !== undefined && on.exit('at', numberValue(this.exitAt)));
    this.exitY = numberInput({ min: 0, step: 1 });
    this.exitY.addEventListener('change', () => on.exit('y', numberValue(this.exitY) ?? EXIT_DEFAULTS.y));
    this.exitAtRow = this.row('Position', this.exitAt);
    this.exitYRow = this.row('Floor (y)', this.exitY);
    this.exitLink = el('select');
    this.exitLink.addEventListener('change', () => on.exit('link', this.exitLink.value || null));
    this.exitIdRow = this.row('Id', this.exitId);
    this.exitLinkRow = this.row('Leads to', this.exitLink);
    // Locked (D75): open only while every switch in the room is on.
    this.exitLocked = Object.assign(el('input'), { type: 'checkbox', title: 'Open only while every switch (target, plate) in the room is on' });
    this.exitLocked.addEventListener('change', () => on.exit('locked', this.exitLocked.checked));
    this.exitLockedRow = this.row('Locked', this.exitLocked);
    this.exitAccess = numberInput({ min: 0, step: 1 });
    this.exitAccess.title = 'Access level it asks for (D101): closed until the core raised his level this high; 0 for none';
    this.exitAccess.addEventListener('change', () => on.exit('access', numberValue(this.exitAccess) ?? 0));
    this.exitAccessRow = this.row('Access level', this.exitAccess);
    // Hidden (D128): wall until a scan reveals it.
    this.exitHidden = Object.assign(el('input'), { type: 'checkbox', title: 'Solid wall until a scan reaches it (D128)' });
    this.exitHidden.addEventListener('change', () => on.exit('hidden', this.exitHidden.checked));
    this.exitHiddenRow = this.row('Hidden', this.exitHidden);
    this.exitRows = this.group('exit');
    this.exitRows.append(
      this.exitIdRow,
      this.exitAtRow,
      this.exitYRow,
      this.row('Width', this.exitWidth),
      this.row('Height', this.exitHeight),
      this.exitLinkRow,
      this.exitLockedRow,
      this.exitAccessRow,
      this.exitHiddenRow,
    );
    return this.exitRows;
  }

  /** Undo, redo, save (or export) and revert. */
  actionRow(canSave) {
    const { on } = this;
    const actions = el('div', 'editor-actions');
    this.buttons = {};
    for (const [id, label] of [['undo', 'Undo'], ['redo', 'Redo'], ['save', canSave ? 'Save' : 'Export'], ['revert', 'Revert']]) {
      this.buttons[id] = el('button', 'editor-action', label);
      this.buttons[id].addEventListener('click', () => on[id]());
      actions.append(this.buttons[id]);
    }
    return actions;
  }

  /**
   * Controls let go of the keyboard once used, so the editor's keys (the
   * digits pick a tool) don't end up typed into a list or a field.
   */
  releaseKeyboard() {
    this.element.addEventListener('change', (e) => e.target.blur());
    this.element.addEventListener('click', (e) => {
      if (e.target.closest('button')) e.target.closest('button').blur();
    });
    // Function keys (F2 plays the room) commit the field first.
    this.element.addEventListener('keydown', (e) => {
      // Enter makes a new line in a text box (D118).
      const enter = e.key === 'Enter' && e.target.tagName !== 'TEXTAREA';
      if (e.key === 'Escape' || enter || isFunctionKey(e.code)) e.target.blur();
    });
  }

  /** A labeled row. */
  row(label, control) {
    const row = el('div', 'editor-row');
    row.append(el('span', 'editor-label', label), control);
    return row;
  }

  /** A group of a tool's fields, starting with its hint line. */
  group(tool) {
    const group = el('div', 'editor-group');
    this.hints[tool] = el('div', 'editor-hint');
    group.append(this.hints[tool]);
    return group;
  }

  /**
   * The enemy templates to pick from.
   * @param {Record<string, object>} templates enemy templates, filled in
   */
  setEnemyTemplates(templates) {
    this.enemyTemplates = templates;
    this.enemyTemplate.replaceChildren(...Object.keys(templates).map((id) => option(id, id)));
  }

  /** @param {string|null} text what is in the cell under the mouse, or null (none) */
  setHover(text) {
    this.hoverLine.textContent = text ?? '';
  }

  /** @param {boolean} shown */
  setShown(shown) {
    this.element.hidden = !shown;
  }

  /**
   * Show the editor's state.
   * @param {object} state
   * @param {import('./room-edit.js').RoomEdit} state.edit the room
   * @param {string[]} state.rooms ids of every room, to pick from
   * @param {string} state.tool
   * @param {string} state.blockType the Block tool's type
   * @param {string} state.objectType
   * @param {{ id: string|null, template: string, drop: string|null, drops: string[] }} state.enemy the picked enemy's template
   *   (with its id and, a boss, its drop and the room's permanent pickups it may drop), or new enemies'
   * @param {object|null} state.pathItem the platform or enemy whose path is edited
   * @param {boolean} state.pathItemIsEnemy it is an enemy (it walks at its template's speed, D119)
   * @param {{ id: string, text: string|null, texts: Record<string, { title?: string, lines: string[] }>, users: string[] }|null} state.screen
   *   the picked screen (D118): its text, every text, and the screens showing its text
   * @param {{ id: string|null, width: number, height: number, link: string|null, links: string[] }} state.exit
   *   the picked exit (id null: the settings for new ones) and the exits it can lead to
   * @param {number} state.layer
   * @param {boolean} state.cut what is above the layer is hidden
   * @param {{ file: string, errors: { error: string, text: string, target: boolean }[] }[]} state.errors
   *   by file; `target`: a click goes to it
   * @param {string} state.status a line about the last action
   * @param {boolean} state.unsaved there are unsaved edits (any room, or world.json)
   */
  show({ edit, rooms, tool, blockType, objectType, enemy, pathItem, pathItemIsEnemy, screen, exit, layer, cut, errors, status, unsaved }) {
    const data = edit.data;
    const changed = edit.dirty || edit.linksChanged;
    this.roomLabel.textContent = `${data.id}${changed ? ' • unsaved' : unsaved ? ' • other rooms unsaved' : ''}`;
    if (this.roomSelect.options.length !== rooms.length || rooms.some((id, i) => this.roomSelect.options[i].value !== id)) {
      this.roomSelect.replaceChildren(...rooms.map((id) => option(id, id)));
    }
    this.roomSelect.value = data.id;
    for (const [id, button] of this.toolButtons) button.classList.toggle('active', id === tool);

    this.blockRows.hidden = tool !== 'block';
    this.blockSelect.value = blockType;
    this.objectRows.hidden = tool !== 'object';
    this.objectSelect.value = objectType;
    this.showScreen(screen);

    this.enemyRows.hidden = tool !== 'enemy';
    this.pathRows.hidden = tool !== 'path';
    this.exitRows.hidden = tool !== 'exit';
    const picked = { enemy: enemy.id, path: pathItem?.id, exit: exit.id };
    for (const [key, [idle, busy]] of Object.entries(HINTS)) this.hints[key].textContent = picked[key] ? busy(picked[key]) : idle;

    this.enemyTemplate.value = enemy.template;
    const template = this.enemyTemplates[enemy.template];
    this.enemyText.textContent = template ? templateText(template) : '';
    this.enemyDropRow.hidden = !(enemy.id && template?.boss);
    if (!this.enemyDropRow.hidden) {
      const ids = ['', ...enemy.drops];
      if (this.enemyDrop.options.length !== ids.length || ids.some((id, i) => this.enemyDrop.options[i].value !== id)) {
        this.enemyDrop.replaceChildren(...ids.map((id) => option(id, id || '— none —')));
      }
      this.enemyDrop.value = enemy.drop ?? '';
    }
    this.monsterLink.href = `tools/monster-editor.html#${enemy.template}`;

    const path = pathItem?.path;
    for (const node of [this.pathMode, this.pathSpeed, this.pathPause, this.clearPath]) node.disabled = !path;
    // An enemy walks at its template's speed (D119).
    if (pathItemIsEnemy) this.pathSpeed.disabled = true;
    this.pathMode.value = path?.mode ?? PATH_DEFAULTS.mode;
    this.pathSpeed.placeholder = pathItemIsEnemy ? `template's (${this.enemyTemplates[pathItem.template]?.speed})` : String(PATH_DEFAULTS.speed);
    this.setNumber(this.pathSpeed, path?.speed);
    this.setNumber(this.pathPause, path?.pause);

    this.exitIdRow.hidden = this.exitLinkRow.hidden = this.exitAtRow.hidden = this.exitYRow.hidden = this.exitLockedRow.hidden = this.exitAccessRow.hidden = this.exitHiddenRow.hidden = !exit.id;
    this.exitLocked.checked = !!exit.locked;
    this.exitHidden.checked = !!exit.hidden;
    this.setNumber(this.exitAccess, exit.access ?? 0);
    this.setNumber(this.exitAt, exit.at);
    this.setNumber(this.exitY, exit.y);
    if (document.activeElement !== this.exitId) this.exitId.value = exit.id ?? '';
    this.setNumber(this.exitWidth, exit.width);
    this.setNumber(this.exitHeight, exit.height);
    this.exitLink.replaceChildren(...['', ...exit.links].map((ref) => option(ref, ref || '— not connected —')));
    this.exitLink.value = exit.link ?? '';

    this.layerLabel.textContent = `${layer} / ${data.size[1] - 1}`;
    this.cutInput.checked = cut;
    this.discardButton.hidden = !edit.fresh;
    // Don't overwrite a field while it is being typed in.
    if (document.activeElement !== this.nameInput) this.nameInput.value = data.name;
    this.authoredInput.checked = data.authored === true;
    this.biomeSelect.value = data.biome;
    this.sizeInputs.forEach((input, axis) => {
      if (document.activeElement !== input) input.value = String(data.size[axis]);
    });
    this.buttons.undo.disabled = edit.undoStack.length === 0;
    this.buttons.redo.disabled = edit.redoStack.length === 0;
    this.buttons.revert.disabled = !changed;
    this.buttons.save.disabled = this.canSave && !unsaved;
    this.status.textContent = status;
    this.errors.replaceChildren(
      ...errors.flatMap(({ file, errors: list }) => [
        ...(file ? [el('li', 'editor-error-file', file)] : []),
        ...list.map(({ error, text, target }) => {
          const item = el('li', target ? 'editor-error-link' : '', text);
          if (target) item.addEventListener('click', () => this.on.error(error));
          return item;
        }),
      ]),
    );
  }

  /** The picked screen's text fields (D118), hidden while no screen is picked. */
  showScreen(screen) {
    this.textRows.hidden = !screen;
    if (!screen) {
      this.textShown = null;
      return;
    }
    const ids = Object.keys(screen.texts);
    this.textSelect.replaceChildren(option('', '— no text —'), ...ids.map((id) => option(id, `${id}: ${preview(screen.texts[id])}`)));
    this.textSelect.value = screen.text ?? '';
    this.textHint.textContent = `Screen ${screen.id}: the text the wizard reads when he comes near.`;
    const text = screen.text ? screen.texts[screen.text] : null;
    // Fill the fields when another screen or text is picked, or the text changed (undo); not while typing.
    const shown = `${screen.id}:${screen.text}:${JSON.stringify(text)}`;
    if (shown !== this.textShown) {
      this.textShown = shown;
      this.textTitle.value = text?.title ?? '';
      this.textBody.value = text?.lines.join('\n') ?? '';
    }
    this.textUsers.textContent = screen.users.length > 1 ? `Shown by ${screen.users.join(', ')}.` : '';
    this.updateTextButton.hidden = !screen.text;
    this.updateTextButton.textContent = `Update text ${screen.text}`;
    this.updateTextButton.title = `Write the fields into ${screen.text}: every screen showing it changes`;
  }

  /** Put a number in a field (blank for undefined), unless it is being typed in. */
  setNumber(input, value) {
    if (document.activeElement !== input) input.value = value === undefined ? '' : String(value);
  }
}
