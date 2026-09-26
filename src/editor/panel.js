/**
 * The room editor's side panel (D56): room settings, height layer, tools,
 * undo/redo/save and the room's validation errors. Plain DOM; it only shows
 * state and reports clicks to the editor (src/editor/editor.js). A tool, so
 * its text is written here, not in strings.json (like the debug readout).
 */

/**
 * The editor's tools, in panel order; `key` is the digit that picks it.
 * Left click places, right click erases.
 */
export const TOOLS = [
  { id: 'block', label: 'Block', key: '1' },
  { id: 'hazard', label: 'Hazard', key: '2' },
  { id: 'void', label: 'Void', key: '3' },
  { id: 'hole', label: 'Hole', key: '4' },
  { id: 'object', label: 'Object', key: '5' },
  { id: 'spawn', label: 'Spawn', key: '6' },
  { id: 'reset', label: 'Reset', key: '7' },
];

const HELP = [
  'Left click: place · Right click: erase',
  'Wheel or PgUp/PgDn: layer · 1–7: tool',
  'Ctrl+Z / Ctrl+Y: undo / redo · Ctrl+S: save',
  'F2: play the room · F3: debug',
];

/** An element with a class and optional text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class EditorPanel {
  /**
   * @param {HTMLElement} root the stage (the panel scales with --u)
   * @param {object} options
   * @param {Record<string, { kind: string, color: string }>} options.objectTypes object types that can be placed
   * @param {Record<string, { name: string }>} options.biomes
   * @param {boolean} options.canSave the dev server can save; a build only exports
   * @param {Record<string, Function>} options.on callbacks: tool(id), objectType(id), layer(step),
   *   name(text), biome(id), size([x, y, z]), undo(), redo(), save(), revert()
   */
  constructor(root, { objectTypes, biomes, canSave, on }) {
    this.element = el('div', 'editor-panel');
    this.element.hidden = true;
    // Keep clicks and the wheel on the panel from reaching the game canvas.
    this.element.addEventListener('contextmenu', (e) => e.preventDefault());

    const title = el('div', 'editor-title', 'ROOM EDITOR');
    this.roomLabel = el('div', 'editor-room');

    this.toolButtons = new Map();
    const tools = el('div', 'editor-tools');
    for (const tool of TOOLS) {
      const button = el('button', 'editor-tool');
      button.append(el('span', 'editor-key', tool.key), ` ${tool.label}`);
      button.addEventListener('click', () => on.tool(tool.id));
      this.toolButtons.set(tool.id, button);
      tools.append(button);
    }

    this.objectSelect = el('select');
    for (const [id, type] of Object.entries(objectTypes)) {
      const option = el('option', '', `${id} (${type.kind})`);
      option.value = id;
      this.objectSelect.append(option);
    }
    this.objectSelect.addEventListener('change', () => on.objectType(this.objectSelect.value));
    this.regrowInput = Object.assign(el('input'), { type: 'number', min: '0', step: '0.5', placeholder: 'never' });
    this.regrowRow = this.row('Regrow (s)', this.regrowInput);
    const objectRows = el('div', 'editor-group');
    objectRows.append(this.row('Object', this.objectSelect), this.regrowRow);

    this.layerLabel = el('span', 'editor-value');
    const down = el('button', 'editor-small', '−');
    const up = el('button', 'editor-small', '+');
    down.addEventListener('click', () => on.layer(-1));
    up.addEventListener('click', () => on.layer(1));
    const layer = el('div', 'editor-row editor-layer');
    layer.append(el('span', 'editor-label', 'Layer'), down, this.layerLabel, up);

    this.nameInput = Object.assign(el('input'), { type: 'text' });
    this.nameInput.addEventListener('change', () => on.name(this.nameInput.value.trim()));
    this.biomeSelect = el('select');
    for (const [id, biome] of Object.entries(biomes)) {
      const option = el('option', '', biome.name);
      option.value = id;
      this.biomeSelect.append(option);
    }
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
    const room = el('div', 'editor-group');
    room.append(this.row('Name', this.nameInput), this.row('Biome', this.biomeSelect), sizeRow);

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

    this.element.append(title, this.roomLabel, room, layer, tools, objectRows, actions, this.status, this.errors, help);
    root.append(this.element);

    // Controls let go of the keyboard once used, so the editor's keys (1–7
    // pick a tool) don't end up typed into a list or a field.
    this.element.addEventListener('change', (e) => e.target.blur());
    this.element.addEventListener('click', (e) => {
      if (e.target.closest('button')) e.target.closest('button').blur();
    });
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') e.target.blur();
    });
  }

  /** A labeled row. */
  row(label, control) {
    const row = el('div', 'editor-row');
    row.append(el('span', 'editor-label', label), control);
    return row;
  }

  /** @param {boolean} shown */
  setShown(shown) {
    this.element.hidden = !shown;
  }

  /** The regrow time typed in, in seconds, or undefined (never grows back). */
  get regrow() {
    const value = this.regrowInput.valueAsNumber;
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  /**
   * Show the editor's state.
   * @param {object} state
   * @param {import('./room-edit.js').RoomEdit} state.edit the room
   * @param {string} state.tool
   * @param {string} state.objectType
   * @param {boolean} state.collapsing the object type is a collapsing block (it may regrow)
   * @param {number} state.layer
   * @param {string[]} state.errors
   * @param {string} state.status a line about the last save
   */
  show({ edit, tool, objectType, collapsing, layer, errors, status }) {
    const data = edit.data;
    this.roomLabel.textContent = `${data.id}${edit.dirty ? ' • unsaved' : ''}`;
    for (const [id, button] of this.toolButtons) button.classList.toggle('active', id === tool);
    this.objectSelect.value = objectType;
    this.regrowRow.hidden = !collapsing;
    this.layerLabel.textContent = `${layer} / ${data.size[1] - 1}`;
    // Don't overwrite a field while it is being typed in.
    if (document.activeElement !== this.nameInput) this.nameInput.value = data.name;
    this.biomeSelect.value = data.biome;
    this.sizeInputs.forEach((input, axis) => {
      if (document.activeElement !== input) input.value = String(data.size[axis]);
    });
    this.buttons.undo.disabled = edit.undoStack.length === 0;
    this.buttons.redo.disabled = edit.redoStack.length === 0;
    this.buttons.revert.disabled = !edit.dirty;
    this.status.textContent = status;
    this.errors.replaceChildren(...errors.map((error) => el('li', '', error)));
  }
}
