/**
 * The in-game room editor (CLAUDE.md §9, D56). F2 freezes the game and
 * edits the current room in place, in the real neon look: the room is
 * rebuilt from the edited data after every change. F2 again plays the
 * edited room from its start point (unsaved edits included), so editing
 * and testing take turns without a reload. Edits are kept per room until
 * the page is closed.
 *
 * The editor reads the mouse and its own keys directly, not through action
 * mapping (a tool, not the game; D56). Saving writes data/rooms/<id>.json
 * through the dev server; a build downloads the file instead.
 */
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { isTextField } from '../core/input.js';
import { formatJson } from './format-json.js';
import { EditorOverlay } from './overlay.js';
import { EditorPanel, TOOLS } from './panel.js';
import { RoomEdit, roomErrors } from './room-edit.js';
import { downloadRoomFile, saveRoomFile } from './save.js';

/** Block tools and the block type they place. */
const BLOCK_TOOLS = { block: 'block', hazard: 'hazard', void: 'void' };

export class Editor {
  /**
   * @param {object} options
   * @param {import('../game.js').Game} options.game
   * @param {import('../render/renderer.js').Renderer} options.renderer
   * @param {Record<string, any>} options.files the data files as loaded,
   *   keyed like data/; a saved room is updated in it
   * @param {boolean} options.canSave the dev server can save rooms
   * @param {() => void} options.onRoom the game's room was rebuilt from
   *   edited data: show it again (static views included)
   */
  constructor({ game, renderer, files, canSave, onRoom }) {
    this.game = game;
    this.renderer = renderer;
    this.files = files;
    this.canSave = canSave;
    this.onRoom = onRoom;
    this.active = false;
    /** Edited rooms by id, kept while the page is open. */
    this.sessions = new Map();
    /** @type {RoomEdit|null} the room being edited */
    this.edit = null;
    this.tool = 'block';
    /** Object types the Object tool places: not platforms (they need a path, step 8b). */
    this.objectTypes = Object.fromEntries(Object.entries(game.content.objectTypes).filter(([, type]) => type.kind !== 'platform'));
    this.objectType = Object.keys(this.objectTypes)[0];
    this.layer = 0;
    /** Validation errors of the edited room; the server's too after a failed save. */
    this.errors = [];
    this.serverErrors = [];
    this.status = '';
    /** The room needs rebuilding from the edited data (at most once per frame). */
    this.stale = false;
    /** Mouse stroke in progress: 'place' or 'erase', and the last cell it acted on. */
    this.stroke = null;
    this.strokeCell = '';
    /** Cell under the mouse, or null. */
    this.hover = null;

    this.overlay = new EditorOverlay();
    renderer.scene.add(this.overlay.group);
    this.panel = new EditorPanel(renderer.stage, {
      objectTypes: this.objectTypes,
      biomes: game.content.biomes,
      canSave,
      on: {
        tool: (id) => this.setTool(id),
        objectType: (id) => {
          this.objectType = id;
          this.refresh();
        },
        layer: (step) => this.setLayer(this.layer + step),
        name: (name) => name && this.change(() => this.edit.setName(name)),
        biome: (biome) => this.change(() => this.edit.setBiome(biome)),
        size: (size) => this.resize(size),
        undo: () => this.change(() => this.edit.undo()),
        redo: () => this.change(() => this.edit.redo()),
        save: () => this.save(),
        revert: () => this.change(() => this.edit.revert()),
      },
    });

    this.raycaster = new Raycaster();
    this.listen(renderer.webgl.domElement);
  }

  /** F2: open the editor on the current room, or close it and play. */
  toggle() {
    if (this.active) this.close();
    else this.open();
  }

  open() {
    // Not in the middle of a room transition.
    if (this.game.transition) return;
    const id = this.game.room.id;
    if (!this.sessions.has(id)) this.sessions.set(id, new RoomEdit(this.files[`rooms/${id}.json`]));
    this.edit = this.sessions.get(id);
    this.active = true;
    this.status = '';
    this.renderer.stage.classList.add('editing');
    this.panel.setShown(true);
    this.overlay.group.visible = true;
    this.setLayer(this.layer);
    this.rebuild();
  }

  /** Leave the editor and play the edited room from its start, if it is valid. */
  close() {
    this.edit.end();
    this.stroke = null;
    if (this.errors.length > 0) {
      this.status = 'Fix the errors below to play the room.';
      this.refresh();
      return;
    }
    this.active = false;
    this.renderer.stage.classList.remove('editing');
    this.panel.setShown(false);
    this.overlay.group.visible = false;
    this.game.enterRoom(this.edit.id);
    this.onRoom();
  }

  /** Once per frame while editing: rebuild the room if it changed. */
  frame() {
    if (this.active && this.stale) this.rebuild();
  }

  /**
   * Run an edit; if it changed the room, rebuild it (next frame).
   * @param {() => boolean} change
   */
  change(change) {
    if (!change()) return;
    this.serverErrors = [];
    this.stale = true;
    this.setLayer(this.layer); // the height may have changed
    this.refresh();
  }

  /**
   * Show the edited data: check it, give it to the game (its rooms are
   * looked up by id) and rebuild the room there, spawn and reset markers
   * and the panel too.
   */
  rebuild() {
    this.stale = false;
    const data = this.edit.toData();
    this.errors = roomErrors(this.files, data);
    this.game.content.rooms.set(data.id, data);
    try {
      this.game.enterRoom(data.id);
      this.onRoom();
    } catch (err) {
      // Data the game can't build yet (it is invalid anyway): keep the last view.
      this.errors.unshift(`preview failed: ${err.message}`);
    }
    this.overlay.setPoints(data.spawn, data.reset);
    this.refresh();
  }

  /** @param {string} id tool id (panel.js TOOLS) */
  setTool(id) {
    this.tool = id;
    this.updateCursor();
    this.refresh();
  }

  /** @param {number} layer height layer to edit, clamped to the room */
  setLayer(layer) {
    this.layer = Math.max(0, Math.min(layer, this.edit.size[1] - 1));
    this.overlay.setLayer(this.edit.size, this.layer);
    this.updateCursor();
    this.refresh();
  }

  /** @param {number[]} size */
  resize(size) {
    if (!size.every(Number.isInteger)) {
      this.status = 'Size: whole numbers only.';
      this.refresh();
      return;
    }
    this.change(() => this.edit.resize(size));
  }

  /** Save the room (dev server) or download it (build). */
  async save() {
    const data = this.edit.toData();
    const { id } = data;
    if (!this.canSave) {
      downloadRoomFile(id, formatJson(data));
      this.status = `Exported ${id}.json${this.errors.length > 0 ? ' (with errors)' : ''}.`;
      this.refresh();
      return;
    }
    if (this.errors.length > 0) {
      this.status = 'Not saved: fix the errors below first.';
      this.refresh();
      return;
    }
    this.status = 'Saving…';
    this.refresh();
    const result = await saveRoomFile(data);
    const edit = this.sessions.get(id);
    if (result.ok) {
      // Edits made while saving stay unsaved.
      edit.savedText = formatJson(data);
      this.files[`rooms/${id}.json`] = data;
      this.status = `Saved data/rooms/${id}.json.`;
    } else {
      this.serverErrors = result.errors;
      this.status = 'Not saved:';
    }
    this.refresh();
  }

  /** Are there edits not saved yet, in any room? */
  get unsaved() {
    return [...this.sessions.values()].some((edit) => edit.dirty);
  }

  refresh() {
    if (!this.active) return;
    this.panel.show({
      edit: this.edit,
      tool: this.tool,
      objectType: this.objectType,
      collapsing: this.objectTypes[this.objectType]?.kind === 'collapsing',
      layer: this.layer,
      errors: [...this.serverErrors, ...this.errors],
      status: this.status,
    });
  }

  // --- Mouse and keys ---------------------------------------------------

  /**
   * The cell of the current layer under the mouse (floor tile for the Hole
   * tool: y 0), or null outside the room.
   * @param {PointerEvent|WheelEvent} event
   * @returns {number[]|null} [x, y, z]
   */
  pick(event) {
    const rect = this.renderer.webgl.domElement.getBoundingClientRect();
    const ndc = new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.renderer.camera);
    const y = this.tool === 'hole' ? 0 : this.layer;
    const point = this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -y), new Vector3());
    if (!point) return null;
    const [w, , d] = this.edit.size;
    const x = Math.floor(point.x);
    const z = Math.floor(point.z);
    return x >= 0 && z >= 0 && x < w && z < d ? [x, y, z] : null;
  }

  updateCursor() {
    this.overlay.setCursor(this.hover, { flat: this.tool === 'hole', erase: this.stroke === 'erase' });
  }

  /**
   * Use the tool on a cell: place (left button) or erase (right button).
   * @param {number[]} cell
   * @param {'place'|'erase'} mode
   */
  apply(cell, mode) {
    const { edit, tool } = this;
    const place = mode === 'place';
    const [x, y, z] = cell;
    const point = [x + 0.5, y, z + 0.5];
    const extra = this.objectTypes[this.objectType]?.kind === 'collapsing' && this.panel.regrow ? { regrow: this.panel.regrow } : {};
    this.change(() => {
      if (BLOCK_TOOLS[tool]) return place ? edit.placeBlock(cell, BLOCK_TOOLS[tool]) : edit.erase(cell);
      if (tool === 'hole') return edit.setHole([x, z], place);
      if (tool === 'object') return place ? edit.placeObject(cell, this.objectType, extra) : edit.erase(cell);
      if (tool === 'spawn') return place && edit.setPoint('spawn', point);
      if (tool === 'reset') return edit.setPoint('reset', place ? point : null);
      return false;
    });
  }

  /** Mouse on the game canvas, keys on the window, a warning before closing with unsaved edits. */
  listen(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active || (e.button !== 0 && e.button !== 2)) return;
      // Back from the panel: its fields let go of the keyboard.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const cell = this.pick(e);
      if (!cell) return;
      canvas.setPointerCapture(e.pointerId);
      this.stroke = e.button === 0 ? 'place' : 'erase';
      this.strokeCell = cell.join();
      this.edit.begin();
      this.apply(cell, this.stroke);
      this.updateCursor();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      this.hover = this.pick(e);
      this.updateCursor();
      // Painting: each new cell the stroke crosses.
      if (this.stroke && this.hover && this.hover.join() !== this.strokeCell) {
        this.strokeCell = this.hover.join();
        this.apply(this.hover, this.stroke);
      }
    });
    const endStroke = () => {
      if (!this.stroke) return;
      this.stroke = null;
      this.edit.end();
      this.updateCursor();
      this.refresh();
    };
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      if (this.active) this.updateCursor();
    });
    canvas.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        this.setLayer(this.layer + (e.deltaY < 0 ? 1 : -1));
        this.hover = this.pick(e);
        this.updateCursor();
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (!this.active || isTextField(e.target)) return;
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        const action = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', s: 'save' }[key];
        if (!action) return;
        e.preventDefault();
        if (this.stroke) return;
        if (action === 'save') this.save();
        else this.change(() => this.edit[action]());
        return;
      }
      const tool = TOOLS.find(({ key }) => e.code === `Digit${key}`);
      if (tool) this.setTool(tool.id);
      if (e.code === 'PageUp' || e.code === 'PageDown') {
        e.preventDefault();
        this.setLayer(this.layer + (e.code === 'PageUp' ? 1 : -1));
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.unsaved) e.preventDefault();
    });
  }
}
