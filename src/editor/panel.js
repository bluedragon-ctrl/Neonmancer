/**
 * The room editor's side panel (D56, D57): room settings, height layer,
 * tools and their fields, undo/redo/save and the validation errors. Plain
 * DOM; it only shows state and reports changes to the editor
 * (src/editor/editor.js). A tool, so its text is written here, not in
 * strings.json (like the debug readout).
 */
import { isFunctionKey } from '../core/input.js';
import { ENEMY_OPTIONS, EXIT_DEFAULTS, PATH_DEFAULTS } from '../data/room-data.js';

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
];

/** Enemy settings the panel sets as lists (overrides of the type's values); blank is the type's own. */
export const ENEMY_FIELDS = {
  movement: ENEMY_OPTIONS.movement,
  hostility: ENEMY_OPTIONS.hostility,
  bounce: [true, false],
  solid: [true, false],
};

/** Enemy settings typed in as numbers: [min, step] (the schema's limits are checked on validation). */
export const ENEMY_NUMBERS = { integrity: [1, 1], damage: [1, 1], speed: [0.5, 0.5] };

const HELP = [
  'Left click: place / pick · Right click: erase',
  'Wheel or PgUp/PgDn: layer · 1–8: tool',
  'Esc: drop the selection · Del: remove it',
  'Ctrl+Z / Ctrl+Y: undo / redo · Ctrl+S: save',
  'F2: play the room · F3: debug',
];

/** What a tool's fields say while nothing is picked, and while something is. */
const HINTS = {
  enemy: ['New enemies get these settings. Click an enemy to pick it.', (id) => `Editing ${id}; new enemies get the same.`],
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

const yesNo = (value) => (value === true ? 'yes' : value === false ? 'no' : String(value));

export class EditorPanel {
  /**
   * @param {HTMLElement} root the stage (the panel scales with --u)
   * @param {object} options
   * @param {Record<string, { look?: string, kind?: string }>} options.blockTypes block types the Block tool places (resolved, D60)
   * @param {Record<string, { kind: string, color: string }>} options.objectTypes object types that can be placed
   * @param {Record<string, object>} options.enemyTypes enemy types (defs.json)
   * @param {Record<string, { name: string }>} options.biomes
   * @param {boolean} options.canSave the dev server can save; a build only exports
   * @param {Record<string, Function>} options.on callbacks: room(id), newRoom(id), tool(id), blockType(id), objectType(id),
   *   enemy(field, value), saveTemplate(name), updateTemplate(), renameTemplate(name), deleteTemplate(),
   *   path(field, value), clearPath(), exit(field, value), layer(step), cut(on), discard(), error(text), name(text),
   *   biome(id), size([x, y, z]), undo(), redo(), save(), revert()
   */
  constructor(root, { blockTypes, objectTypes, enemyTypes, biomes, canSave, on }) {
    this.canSave = canSave;
    this.on = on;
    this.element = el('div', 'editor-panel');
    this.element.hidden = true;
    // Keep clicks and the wheel on the panel from reaching the game canvas.
    this.element.addEventListener('contextmenu', (e) => e.preventDefault());

    const title = el('div', 'editor-title', 'ROOM EDITOR');
    this.roomLabel = el('div', 'editor-room');

    // --- The room: which one, a new one, its name, biome and size
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
    const room = el('div', 'editor-group');
    room.append(this.row('Room', this.roomSelect), newRoomRow, this.row('Name', this.nameInput), this.row('Biome', this.biomeSelect), sizeRow, this.discardButton);

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
    /** What is in the cell under the mouse. */
    this.hoverLine = el('div', 'editor-hover');

    this.toolButtons = new Map();
    const tools = el('div', 'editor-tools');
    for (const tool of TOOLS) {
      const button = el('button', 'editor-tool');
      button.append(el('span', 'editor-key', tool.key), ` ${tool.label}`);
      button.addEventListener('click', () => on.tool(tool.id));
      this.toolButtons.set(tool.id, button);
      tools.append(button);
    }

    // --- Fields of the current tool, shown only while it is picked
    this.blockSelect = select(Object.entries(blockTypes).map(([id, type]) => [id, `${id} (${blockTypeText(type)})`]));
    this.blockSelect.addEventListener('change', () => on.blockType(this.blockSelect.value));
    this.blockRows = el('div', 'editor-group');
    this.blockRows.append(this.row('Type', this.blockSelect));
    this.objectSelect = select(Object.entries(objectTypes).map(([id, type]) => [id, `${id} (${type.kind})`]));
    this.objectSelect.addEventListener('change', () => on.objectType(this.objectSelect.value));
    this.objectRows = el('div', 'editor-group');
    this.objectRows.append(this.row('Object', this.objectSelect));

    this.hints = {};
    this.enemyType = el('select');
    this.enemyType.addEventListener('change', () => on.enemy('type', this.enemyType.value));
    this.enemySelects = {};
    this.enemyRows = this.group('enemy');
    this.enemyRows.append(this.row('Type', this.enemyType));
    const label = (field) => field[0].toUpperCase() + field.slice(1);
    for (const [field, values] of Object.entries(ENEMY_FIELDS)) {
      const node = select([['', ''], ...values.map((value) => [String(value), yesNo(value)])]);
      node.addEventListener('change', () => on.enemy(field, node.value === '' ? undefined : values.find((v) => String(v) === node.value)));
      this.enemySelects[field] = node;
      this.enemyRows.append(this.row(label(field), node));
    }
    this.enemyNumbers = {};
    for (const [field, [min, step]] of Object.entries(ENEMY_NUMBERS)) {
      const node = numberInput({ min, step });
      node.addEventListener('change', () => on.enemy(field, numberValue(node)));
      this.enemyNumbers[field] = node;
      this.enemyRows.append(this.row(label(field), node));
    }
    this.enemyColor = Object.assign(el('input'), { type: 'text' });
    this.enemyColor.addEventListener('change', () => on.enemy('color', this.enemyColor.value.trim() || undefined));
    this.enemyRows.append(this.row('Color', this.enemyColor));
    // Templates (D58): these settings as a new enemy type, or into the type they are of.
    this.templateInput = Object.assign(el('input'), { type: 'text', placeholder: 'template_name' });
    const templateName = () => this.templateInput.value.trim();
    const saveTemplate = () => templateName() && on.saveTemplate(templateName());
    const templateButton = el('button', 'editor-small', 'Save');
    templateButton.addEventListener('click', saveTemplate);
    this.templateInput.addEventListener('keydown', (e) => e.key === 'Enter' && saveTemplate());
    const templateRow = el('div', 'editor-row');
    templateRow.append(el('span', 'editor-label', 'Template'), this.templateInput, templateButton);
    // The template the settings are of: another name (typed above), or gone.
    this.renameTemplate = Object.assign(el('button', 'editor-small', 'Rename'), { title: 'Rename it to the name typed in Template' });
    this.renameTemplate.addEventListener('click', () => templateName() && on.renameTemplate(templateName()));
    this.deleteTemplate = el('button', 'editor-small', 'Delete');
    this.deleteTemplate.addEventListener('click', () => on.deleteTemplate());
    this.templateOfRow = el('div', 'editor-row');
    this.templateOf = el('span', 'editor-value editor-grow');
    this.templateOfRow.append(el('span', 'editor-label', 'Its template'), this.templateOf, this.renameTemplate, this.deleteTemplate);
    this.updateTemplate = el('button', 'editor-action');
    this.updateTemplate.addEventListener('click', () => on.updateTemplate());
    this.enemyRows.append(templateRow, this.templateOfRow, this.updateTemplate);
    this.setEnemyTypes(enemyTypes, {});

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
    this.exitRows = this.group('exit');
    this.exitRows.append(this.exitIdRow, this.exitAtRow, this.exitYRow, this.row('Width', this.exitWidth), this.row('Height', this.exitHeight), this.exitLinkRow);

    const actions = el('div', 'editor-actions');
    this.buttons = {};
    for (const [id, label] of [['undo', 'Undo'], ['redo', 'Redo'], ['save', canSave ? 'Save' : 'Export'], ['revert', 'Revert']]) {
      this.buttons[id] = el('button', 'editor-action', label);
      this.buttons[id].addEventListener('click', () => on[id]());
      actions.append(this.buttons[id]);
    }

    this.status = el('div', 'editor-status');
    this.errors = el('ul', 'editor-errors');
    const help = el('div', 'editor-help');
    for (const line of HELP) help.append(el('div', '', line));

    this.element.append(title, this.roomLabel, room, layer, this.hoverLine, tools, this.blockRows, this.objectRows, this.enemyRows, this.pathRows, this.exitRows, actions, this.status, this.errors, help);
    root.append(this.element);

    // Controls let go of the keyboard once used, so the editor's keys (the
    // digits pick a tool) don't end up typed into a list or a field.
    this.element.addEventListener('change', (e) => e.target.blur());
    this.element.addEventListener('click', (e) => {
      if (e.target.closest('button')) e.target.closest('button').blur();
    });
    // Function keys (F2 plays the room) commit the field first.
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || isFunctionKey(e.code)) e.target.blur();
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
   * The enemy types to pick from; templates show their base.
   * @param {Record<string, object>} types enemy types, templates filled in
   * @param {Record<string, string>} models each type's base type (itself for a base)
   */
  setEnemyTypes(types, models) {
    this.enemyTypes = types;
    this.enemyModels = models;
    this.enemyType.replaceChildren(
      ...Object.keys(types).map((id) => option(id, models[id] && models[id] !== id ? `${id} (${models[id]} template)` : id)),
    );
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
   * @param {{ id?: string, type: string, overrides: object }} state.enemy enemy settings: the picked enemy's (with its id), or for new ones
   * @param {boolean} state.template their type is a template (it can be renamed or deleted)
   * @param {object|null} state.pathItem the platform or enemy whose path is edited
   * @param {boolean} state.pathItemIsEnemy it is an enemy (its speed defaults to its type's)
   * @param {{ id: string|null, width: number, height: number, link: string|null, links: string[] }} state.exit
   *   the picked exit (id null: the settings for new ones) and the exits it can lead to
   * @param {number} state.layer
   * @param {boolean} state.cut what is above the layer is hidden
   * @param {{ file: string, errors: { error: string, text: string, target: boolean }[] }[]} state.errors
   *   by file; `target`: a click goes to it
   * @param {string} state.status a line about the last action
   * @param {boolean} state.unsaved there are unsaved edits (any room, or world.json)
   */
  show({ edit, rooms, tool, blockType, objectType, enemy, template, pathItem, pathItemIsEnemy, exit, layer, cut, errors, status, unsaved }) {
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

    this.enemyRows.hidden = tool !== 'enemy';
    this.pathRows.hidden = tool !== 'path';
    this.exitRows.hidden = tool !== 'exit';
    const picked = { enemy: enemy.id, path: pathItem?.id, exit: exit.id };
    for (const [key, [idle, busy]] of Object.entries(HINTS)) this.hints[key].textContent = picked[key] ? busy(picked[key]) : idle;

    this.enemyType.value = enemy.type;
    const typeValues = this.enemyTypes[enemy.type] ?? {};
    for (const [field, node] of Object.entries(this.enemySelects)) {
      node.options[0].textContent = `type's (${yesNo(typeValues[field] ?? false)})`;
      node.value = field in enemy.overrides ? String(enemy.overrides[field]) : '';
    }
    for (const [field, node] of Object.entries(this.enemyNumbers)) {
      node.placeholder = `type's (${typeValues[field]})`;
      this.setNumber(node, enemy.overrides[field]);
    }
    this.enemyColor.placeholder = `type's (${typeValues.color})`;
    if (document.activeElement !== this.enemyColor) this.enemyColor.value = enemy.overrides.color ?? '';
    // An enemy of a template with settings of its own can move them into the template.
    this.updateTemplate.hidden = !template || Object.keys(enemy.overrides).length === 0;
    this.updateTemplate.textContent = `Update template ${enemy.type}`;
    this.templateOfRow.hidden = !template;
    this.templateOf.textContent = enemy.type;

    const path = pathItem?.path;
    for (const node of [this.pathMode, this.pathSpeed, this.pathPause, this.clearPath]) node.disabled = !path;
    this.pathMode.value = path?.mode ?? PATH_DEFAULTS.mode;
    this.pathSpeed.placeholder = pathItemIsEnemy ? `type's` : String(PATH_DEFAULTS.speed);
    this.setNumber(this.pathSpeed, path?.speed);
    this.setNumber(this.pathPause, path?.pause);

    this.exitIdRow.hidden = this.exitLinkRow.hidden = this.exitAtRow.hidden = this.exitYRow.hidden = !exit.id;
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

  /** Put a number in a field (blank for undefined), unless it is being typed in. */
  setNumber(input, value) {
    if (document.activeElement !== input) input.value = value === undefined ? '' : String(value);
  }
}
