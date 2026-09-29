/**
 * The in-game room editor (CLAUDE.md §9, D56, D57). F2 freezes the game and
 * edits the current room in place, in the real neon look: the room is
 * rebuilt from the edited data after every change. F2 again plays the
 * edited room from its start point (unsaved edits included), so editing
 * and testing take turns without a reload. Edits are kept per room until
 * the page is closed; the panel switches between rooms and makes new ones.
 * Exit connections are edited in world.json, and enemy templates in
 * defs.json (D58, D79); both are saved with the rooms.
 *
 * The editor reads the mouse and its own keys directly, not through action
 * mapping (a tool, not the game; D56). Saving writes data/ through the dev
 * server; a build downloads the files instead.
 */
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { isTextField } from '../core/input.js';
import { linkMap } from '../data/load.js';
import { sideLength, withExitDefaults } from '../data/room-data.js';
import { validateData } from '../data/validate.js';
import { DefsEdit } from './defs-edit.js';
import { errorTarget, groupErrors } from './errors.js';
import { formatJson } from './format-json.js';
import { EditorOverlay } from './overlay.js';
import { EditorPanel, TOOLS } from './panel.js';
import { ID_PATTERN, RoomEdit, newRoom, resizeText, roomIdProblem, sizeProblem } from './room-edit.js';
import { downloadFile, saveFiles } from './save.js';
import { applyEnemyTemplates, deleteTemplate, renameTemplate, saveTemplate, updateTemplate } from './templates.js';
import { WorldEdit, linkChoices } from './world-edit.js';

/** Tools a mouse drag paints with; the others act on the cell clicked only. */
const PAINT_TOOLS = new Set(['block', 'hole', 'object']);

/** Hint after placing something that can't do without a path yet. */
const NEEDS_PATH = (id) => `${id} needs a path: pick the Path tool (${TOOLS.find((tool) => tool.id === 'path').key}) and click cells.`;

export class Editor {
  /**
   * @param {object} options
   * @param {import('../game.js').Game} options.game
   * @param {import('../render/renderer.js').Renderer} options.renderer
   * @param {Record<string, any>} options.files the data files as loaded,
   *   keyed like data/; saved files are updated in it
   * @param {boolean} options.canSave the dev server can save
   * @param {(options?: { cutAbove?: number|null }) => void} options.onRoom the
   *   game's room was rebuilt from edited data: show it again (static views
   *   included), without what is above layer `cutAbove` if given
   */
  constructor({ game, renderer, files, canSave, onRoom }) {
    this.game = game;
    this.renderer = renderer;
    this.files = files;
    this.canSave = canSave;
    this.onRoom = onRoom;
    this.active = false;
    /** world.json being edited: the exits' connections. */
    this.world = new WorldEdit(files['world.json']);
    /** defs.json being edited (enemy templates, D58), and its text as the game last got it. */
    this.defs = new DefsEdit(files['defs.json']);
    this.defsApplied = '';
    /** Edited rooms by id, kept while the page is open. */
    this.sessions = new Map();
    /** @type {RoomEdit|null} the room being edited */
    this.edit = null;
    this.tool = 'block';
    /** Block type the Block tool places (defs.json "blocks", D60). */
    this.blockType = 'block';
    this.blockTypes = game.content.blockTypes;
    /** Pickup types (D71): placed with the Object tool too, into the room's pickups. */
    this.pickupTypes = game.content.pickupTypes;
    this.objectTypes = { ...game.content.objectTypes, ...this.pickupTypes };
    this.objectType = Object.keys(this.objectTypes)[0];
    this.enemyTemplates = game.content.enemyTemplates;
    /** Settings of new enemies (and of the picked one): a template and overrides of its values. */
    this.enemy = { template: Object.keys(this.enemyTemplates)[0], overrides: {} };
    /** Shape of new exits. */
    this.exitShape = { width: 2, height: 2 };
    /** @type {{ kind: 'item'|'exit', id: string } | null} the picked object, enemy or exit */
    this.selected = null;
    this.layer = 0;
    /** Hide blocks, objects and enemies above the layer. */
    this.cut = true;
    /** The room edited before this one (where discarding a new room goes back to). */
    this.lastRoom = null;
    /** Validation errors of the edited data; the server's too after a failed save. */
    this.errors = [];
    this.serverErrors = [];
    this.status = '';
    /** A save is on its way to the dev server. */
    this.saving = false;
    /** The room needs rebuilding from the edited data (at most once per frame). */
    this.stale = false;
    /** Mouse stroke in progress: 'place' or 'erase', and the last cell it acted on. */
    this.stroke = null;
    this.strokeCell = '';
    /** Cell under the mouse, or null; and where the mouse ray met its layer. */
    this.hover = null;
    this.hit = new Vector3();
    /** Where the mouse last was over the canvas (client pixels), or null. */
    this.pointer = null;

    this.overlay = new EditorOverlay();
    renderer.scene.add(this.overlay.group);
    this.panel = new EditorPanel(renderer.stage, {
      blockTypes: this.blockTypes,
      objectTypes: this.objectTypes,
      enemyTemplates: this.enemyTemplates,
      biomes: game.content.biomes,
      canSave,
      on: {
        room: (id) => this.openRoom(id),
        newRoom: (id) => this.createRoom(id),
        tool: (id) => this.setTool(id),
        blockType: (id) => {
          this.blockType = id;
          this.refresh();
        },
        objectType: (id) => {
          this.objectType = id;
          this.refresh();
        },
        enemy: (field, value) => this.setEnemy(field, value),
        saveTemplate: (name) => saveTemplate(this, name),
        updateTemplate: () => updateTemplate(this),
        renameTemplate: (name) => renameTemplate(this, name),
        deleteTemplate: () => deleteTemplate(this),
        path: (field, value) => this.pathItem && this.change(() => this.edit.setPathOptions(this.pathItem.id, { [field]: value })),
        clearPath: () => this.pathItem && this.change(() => this.edit.updateItem(this.pathItem.id, { path: undefined })),
        exit: (field, value) => this.setExit(field, value),
        layer: (step) => this.setLayer(this.layer + step),
        cut: (on) => this.setCut(on),
        discard: () => this.discardRoom(),
        error: (error) => this.goTo(error),
        name: (name) => (name ? this.change(() => this.edit.setName(name)) : this.refresh()),
        authored: (on) => this.change(() => this.edit.setAuthored(on)),
        biome: (biome) => this.change(() => this.edit.setBiome(biome)),
        size: (size) => this.resize(size),
        undo: () => this.change(() => this.edit.undo()),
        redo: () => this.change(() => this.edit.redo()),
        save: () => this.save(),
        revert: () => this.change(() => this.edit.revert()),
      },
    });

    applyEnemyTemplates(this);

    this.raycaster = new Raycaster();
    this.listenPointer(renderer.webgl.domElement);
    this.listenKeys();
  }

  /** F2: open the editor on the current room, or close it and play. */
  toggle() {
    if (this.active) this.close();
    else this.open();
  }

  open() {
    // Not in the middle of a room transition.
    if (this.game.transition) return;
    this.active = true;
    this.status = '';
    this.renderer.stage.classList.add('editing');
    this.panel.setShown(true);
    this.overlay.group.visible = true;
    this.openRoom(this.game.room.id);
  }

  /** Leave the editor and play the edited room from its start, if the data is valid. */
  close() {
    this.edit.end();
    this.stroke = null;
    // An edit this frame may not be rebuilt yet: check and play the room as it is now.
    if (this.stale) this.rebuild();
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

  /** The edit of a room, started the first time it is opened. */
  session(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, new RoomEdit(this.files[`rooms/${id}.json`], { world: this.world, defs: this.defs }));
    return this.sessions.get(id);
  }

  /** Edit another room (it shows in the game too). */
  openRoom(id) {
    this.edit?.end();
    if (this.edit && this.edit.id !== id) this.lastRoom = this.edit.id;
    this.stroke = null;
    this.selected = null;
    this.status = '';
    this.edit = this.session(id);
    this.setLayer(this.layer);
    this.rebuild();
  }

  /** Make a new, empty room and edit it. */
  createRoom(id) {
    const problem = roomIdProblem(id, this.roomIds());
    if (problem) {
      this.status = problem;
      this.refresh();
      return;
    }
    const data = newRoom(id, this.edit.data.biome);
    this.world.place(id, this.edit.id);
    this.sessions.set(id, new RoomEdit(data, { world: this.world, defs: this.defs, fresh: true }));
    this.game.content.rooms.set(id, data);
    this.openRoom(id);
    this.panel.newRoomInput.value = '';
    this.status = `New room ${id}: give it an exit (Exit tool, 8) and connect it, then save.`;
    this.refresh();
  }

  /** Throw away the new room being edited (never saved), with its connections, and go back. */
  discardRoom() {
    const { id, fresh } = this.edit;
    if (!fresh) return;
    this.edit.end();
    this.sessions.delete(id);
    this.game.content.rooms.delete(id);
    this.world.setLinks(id, []);
    this.world.unplace(id);
    const back = this.lastRoom && this.lastRoom !== id && this.roomData(this.lastRoom) ? this.lastRoom : this.game.content.world.start;
    this.edit = null;
    this.lastRoom = null;
    this.openRoom(back);
    this.status = `Room ${id} discarded.`;
    this.refresh();
  }

  /** Ids of every room, new ones included. */
  roomIds() {
    return [...new Set([...this.game.content.rooms.keys(), ...this.sessions.keys()])];
  }

  /** A room's data as edited so far. */
  roomData(id) {
    return this.sessions.get(id)?.data ?? this.game.content.rooms.get(id);
  }

  /** Every data file with the edits in: what saving would write. */
  editedFiles() {
    const files = { ...this.files, 'world.json': this.world.toData(), 'defs.json': this.defs.toData() };
    for (const [id, edit] of this.sessions) files[`rooms/${id}.json`] = edit.toData();
    return files;
  }

  /** Once per frame while editing: rebuild the room if it changed. */
  frame() {
    if (this.active && this.stale) this.rebuild();
  }

  /**
   * Run an edit; if it changed the data, rebuild the room (next frame).
   * @param {() => boolean} change
   */
  change(change) {
    if (!change()) return;
    this.serverErrors = [];
    this.status = '';
    this.stale = true;
    this.setLayer(this.layer); // the height may have changed
    this.refresh();
  }

  /**
   * Show the edited data: check it, give it to the game (its rooms are
   * looked up by id, exits by their connections) and rebuild the room
   * there, the editor's marks and the panel too.
   */
  rebuild() {
    this.stale = false;
    const data = this.edit.toData();
    this.errors = validateData(this.editedFiles());
    // Undo and redo may have changed the templates.
    if (this.defs.text() !== this.defsApplied) applyEnemyTemplates(this);
    this.game.content.rooms.set(data.id, data);
    this.game.content.links = linkMap(this.world.connections);
    try {
      this.game.enterRoom(data.id);
      this.onRoom({ cutAbove: this.cutLayer });
    } catch (err) {
      // Data the game can't build yet (it is invalid anyway): keep the last view.
      this.errors.unshift(`preview failed: ${err.message}`);
    }
    this.overlay.setPoints(data.spawn, data.reset);
    this.select(this.selected);
  }

  /** @param {string} id tool id (panel.js TOOLS) */
  setTool(id) {
    this.tool = id;
    this.updateCursor();
    this.refresh();
  }

  /** @param {number} layer height layer to edit, clamped to the room */
  setLayer(layer) {
    const before = this.layer;
    this.layer = Math.max(0, Math.min(layer, this.edit.size[1] - 1));
    this.overlay.setLayer(this.edit.size, this.layer);
    if (this.layer !== before && this.cut) this.showCut();
    this.updateCursor();
    this.refresh();
  }

  /** @param {boolean} on hide what is above the layer */
  setCut(on) {
    this.cut = on;
    this.showCut();
    this.refresh();
  }

  /** The layer above which the room isn't drawn, or null. */
  get cutLayer() {
    return this.cut ? this.layer : null;
  }

  /** Draw the room again, cut at the layer (a rebuild due anyway does it). */
  showCut() {
    if (this.active && !this.stale && this.game.room.id === this.edit.id) this.onRoom({ cutAbove: this.cutLayer });
  }

  /** @param {number[]} size [x, y, z] as typed in the panel */
  resize(size) {
    const problem = sizeProblem(size);
    let report = false;
    if (!problem) this.change(() => (report = this.edit.resize(size)));
    this.status = problem ?? (report ? resizeText(size, report) : '');
    this.refresh();
  }

  // --- Picked things -----------------------------------------------------

  /** Pick an object, enemy or exit (null: none); one that is gone is dropped. */
  select(selected) {
    const gone = selected?.kind === 'item' ? !this.edit.item(selected.id) : selected?.kind === 'exit' && !this.edit.exits.some((e) => e.id === selected.id);
    this.selected = gone ? null : selected;
    this.overlay.setMarks(this.edit.data, this.selected);
    this.refresh();
  }

  /** The picked object or enemy, or null. */
  get selectedItem() {
    return this.selected?.kind === 'item' ? this.edit.item(this.selected.id) : null;
  }

  /** The picked enemy, or null. */
  get selectedEnemy() {
    const item = this.selectedItem;
    return item && this.edit.data.enemies?.includes(item) ? item : null;
  }

  /** The picked platform or enemy, whose path the Path tool edits, or null. */
  get pathItem() {
    const item = this.selectedItem;
    return item && (this.selectedEnemy || this.objectTypes[item.type]?.kind === 'platform') ? item : null;
  }

  /** The picked exit (as written), or null. */
  get selectedExit() {
    return this.selected?.kind === 'exit' ? (this.edit.exits.find((e) => e.id === this.selected.id) ?? null) : null;
  }

  /** Does this enemy (or new ones, with these settings) patrol, so it needs a path? */
  patrols({ template, overrides = {} }) {
    return (overrides.movement ?? this.enemyTemplates[template]?.movement) === 'patrol';
  }

  /** May this enemy have a path: a patrol, or a chaser (walked while calm, D78)? Not a stationary one. */
  walksPath({ template, overrides = {} }) {
    return (overrides.movement ?? this.enemyTemplates[template]?.movement) !== 'stationary';
  }

  /** An enemy setting changed in the panel: for new enemies, and the picked one. */
  setEnemy(field, value) {
    const enemy = this.selectedEnemy;
    const settings = enemy ? { template: enemy.template, overrides: { ...enemy.overrides } } : this.enemy;
    if (field === 'template') settings.template = value;
    else if (value === undefined) delete settings.overrides[field];
    else settings.overrides[field] = value;
    this.enemy = structuredClone(settings);
    if (enemy) this.retype(enemy, settings);
    this.refresh();
  }

  /** Give an enemy these settings (its id follows the template; a stationary one loses its path) and keep it picked. */
  retype(enemy, settings) {
    const wasPicked = this.selected?.id === enemy.id;
    let id = null;
    this.change(() => !!(id = this.edit.setEnemy(enemy.id, settings, this.walksPath(settings))));
    if (id && wasPicked) this.select({ kind: 'item', id });
  }

  /** The enemy settings the panel shows: the picked enemy's, or the ones for new enemies. */
  get enemySettings() {
    const enemy = this.selectedEnemy;
    return enemy ? { id: enemy.id, template: enemy.template, overrides: enemy.overrides ?? {} } : this.enemy;
  }

  /** An exit field changed in the panel: for the picked exit, or new ones. */
  setExit(field, value) {
    const exit = this.selectedExit;
    const least = { width: 1, height: 2, at: 0, y: 0 };
    if (field in least) value = Math.max(least[field], Math.round(value));
    if (!exit) {
      if (field in this.exitShape) this.exitShape[field] = value;
      this.refresh();
      return;
    }
    if (field === 'link') {
      this.change(() => this.edit.linkExit(exit.id, value));
    } else if (field === 'locked') {
      this.change(() => this.edit.updateExit(exit.id, { locked: value }));
    } else if (field === 'id') {
      if (!ID_PATTERN.test(value)) this.status = 'Exit id: lowercase letters, digits and _, starting with a letter.';
      else if (this.edit.exits.some((e) => e.id === value && e !== exit)) this.status = `Exit id: "${value}" is taken.`;
      else if (this.edit.updateExit(exit.id, { id: value })) {
        this.selected = { kind: 'exit', id: value };
        this.change(() => true);
      }
    } else {
      const fields = this.exitFields(this.edit, exit, field, value);
      if (this.edit.exitClashes(exit.id, fields)) this.status = 'Another exit is in the way.';
      else {
        this.change(() => this.edit.updateExit(exit.id, fields));
        if (field === 'width') this.matchPartnerWidth(exit, value);
      }
    }
    this.refresh();
  }

  /** Fields that set an exit's `field`; a wider exit moves back to stay within its side. */
  exitFields(edit, exit, field, value) {
    if (field !== 'width') return { [field]: value };
    const length = sideLength(exit.side, edit.size);
    return { width: value, at: Math.max(0, Math.min(withExitDefaults(exit).at, length - value)) };
  }

  /** The exit got `width`: the exit it leads to gets it too (an undo step of that room). */
  matchPartnerWidth(exit, width) {
    const partner = this.world.partner(`${this.edit.id}.${exit.id}`);
    if (!partner) return;
    const [room, id] = partner.split('.');
    const other = this.session(room);
    const theirs = other.exits.find((e) => e.id === id);
    if (!theirs || withExitDefaults(theirs).width === width) return;
    const fields = this.exitFields(other, theirs, 'width', width);
    if (other.exitClashes(id, fields) || !other.updateExit(id, fields)) {
      this.status = `${partner} can't be ${width} wide: another exit is in the way. Change it there.`;
      return;
    }
    this.game.content.rooms.set(room, other.toData());
    this.status = `${partner} is ${width} wide too.`;
  }

  // --- Saving -------------------------------------------------------------

  /** Save every edited room and world.json (dev server), or download them (build). */
  async save() {
    if (this.saving) return;
    // An edit this frame may not be checked yet.
    if (this.stale) this.rebuild();
    const rooms = [...this.sessions.values()].filter((edit) => edit.dirty);
    const world = this.world.dirty ? this.world.toData() : undefined;
    const defs = this.defs.dirty ? this.defs.toData() : undefined;
    if (!this.canSave) {
      // Nothing changed: export the room shown.
      const exported = rooms.length > 0 || world || defs ? rooms : [this.edit];
      for (const edit of exported) downloadFile(`${edit.id}.json`, edit.text());
      if (world) downloadFile('world.json', formatJson(world));
      if (defs) downloadFile('defs.json', formatJson(defs));
      const names = [...exported.map((edit) => `${edit.id}.json`), ...(world ? ['world.json'] : []), ...(defs ? ['defs.json'] : [])];
      this.status = `Exported ${names.join(', ')}${this.errors.length > 0 ? ' (with errors)' : ''}.`;
      this.refresh();
      return;
    }
    if (rooms.length === 0 && !world && !defs) return;
    if (this.errors.length > 0) {
      this.status = 'Not saved: fix the errors below first.';
      this.refresh();
      return;
    }
    this.status = 'Saving…';
    this.refresh();
    const sent = rooms.map((edit) => edit.toData());
    this.saving = true;
    const result = await saveFiles({ rooms: sent, world, defs }).finally(() => (this.saving = false));
    if (result.ok) {
      // Edits made while saving stay unsaved.
      rooms.forEach((edit, i) => {
        edit.savedText = formatJson(sent[i]);
        edit.fresh = false;
        this.files[`rooms/${edit.id}.json`] = sent[i];
      });
      if (world) {
        this.world.savedText = formatJson(world);
        this.files['world.json'] = world;
      }
      if (defs) {
        this.defs.savedText = formatJson(defs);
        this.files['defs.json'] = defs;
      }
      this.status = `Saved ${result.files.join(', ')}.`;
    } else {
      this.serverErrors = result.errors;
      this.status = 'Not saved:';
    }
    this.refresh();
  }

  /** Are there edits not saved yet, in any room, world.json or defs.json? */
  get unsaved() {
    return this.world.dirty || this.defs.dirty || [...this.sessions.values()].some((edit) => edit.dirty);
  }

  refresh() {
    if (!this.active) return;
    const enemy = this.selectedEnemy;
    const exit = this.selectedExit;
    const pathItem = this.pathItem;
    this.panel.show({
      edit: this.edit,
      rooms: this.roomIds(),
      tool: this.tool,
      blockType: this.blockType,
      objectType: this.objectType,
      enemy: this.enemySettings,
      pathItem,
      pathItemIsEnemy: !!pathItem && pathItem === enemy,
      exit: exit
        ? {
            ...withExitDefaults(exit),
            link: this.world.partner(`${this.edit.id}.${exit.id}`),
            links: linkChoices(this.world, this.roomIds(), (id) => this.roomData(id), this.edit.id, exit),
          }
        : { id: null, ...this.exitShape, link: null, links: [] },
      layer: this.layer,
      cut: this.cut,
      errors: this.errorGroups(),
      status: this.status,
      unsaved: this.unsaved,
    });
  }

  /** Remove the picked object, enemy or exit (Delete key). */
  removeSelected() {
    const item = this.selectedItem;
    const exit = this.selectedExit;
    if (item) this.change(() => this.edit.removeItem(item.id));
    else if (exit) this.change(() => this.edit.removeExit(exit.id));
    else return;
    this.status = `${(item ?? exit).id} removed.`;
    this.select(null);
  }

  // --- Errors -------------------------------------------------------------

  /** The errors by file, each marked if a click can go to it. */
  errorGroups() {
    const context = { roomData: (id) => this.roomData(id), connections: this.world.connections };
    return groupErrors([...this.serverErrors, ...this.errors]).map((group) => ({
      ...group,
      errors: group.errors.map((entry) => ({ ...entry, target: errorTarget(entry.error, context) !== null })),
    }));
  }

  /** Go to what an error is about: its room, the tool that edits it, picked, on its layer. */
  goTo(error) {
    const target = errorTarget(error, { roomData: (id) => this.roomData(id), connections: this.world.connections });
    if (!target) return;
    if (target.room !== this.edit.id) this.openRoom(target.room);
    if (target.tool) this.setTool(target.tool);
    if (target.selected) {
      this.select(target.selected);
      const at = this.selectedItem?.at[1] ?? (this.selectedExit && withExitDefaults(this.selectedExit).y);
      if (at !== undefined && at !== null) this.setLayer(at);
    }
  }

  // --- Mouse and keys ---------------------------------------------------

  /**
   * The cell of the current layer under the mouse (floor tile for the Hole
   * tool: y 0), or null outside the room. Keeps where the ray met the layer
   * in `this.hit`.
   * @param {PointerEvent|WheelEvent} event
   * @returns {number[]|null} [x, y, z]
   */
  pick(event) {
    const rect = this.renderer.webgl.domElement.getBoundingClientRect();
    const ndc = new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.renderer.camera);
    const y = this.tool === 'hole' ? 0 : this.layer;
    if (!this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -y), this.hit)) return null;
    const [w, , d] = this.edit.size;
    const x = Math.floor(this.hit.x);
    const z = Math.floor(this.hit.z);
    return x >= 0 && z >= 0 && x < w && z < d ? [x, y, z] : null;
  }

  /**
   * The side an edge cell opens an exit in, or null inside the room; in a
   * corner, the side whose wall the mouse is nearer.
   * @param {number[]} cell
   */
  exitSide([x, , z]) {
    const [w, , d] = this.edit.size;
    const distance = { '-x': this.hit.x, '+x': w - this.hit.x, '-z': this.hit.z, '+z': d - this.hit.z };
    const sides = [x === 0 && '-x', x === w - 1 && '+x', z === 0 && '-z', z === d - 1 && '+z'].filter(Boolean);
    return sides.sort((a, b) => distance[a] - distance[b])[0] ?? null;
  }

  updateCursor() {
    // The layer or the tool (holes are on the floor) may have changed under a still mouse.
    if (this.pointer && !this.stroke) this.hover = this.pick(this.pointer);
    this.overlay.setCursor(this.hover, { flat: this.tool === 'hole', erase: this.stroke === 'erase' });
    this.panel.setHover(this.hover && this.edit.describe(this.hover, { tile: this.tool === 'hole' }));
  }

  /**
   * Use the tool on a cell: place or pick (left button), or erase (right button).
   * @param {number[]} cell
   * @param {'place'|'erase'} mode
   */
  apply(cell, mode) {
    const { edit, tool } = this;
    const place = mode === 'place';
    const [x, y, z] = cell;
    const point = [x + 0.5, y, z + 0.5];
    if (tool === 'block') this.change(() => (place ? edit.placeBlock(cell, this.blockType) : edit.erase(cell)));
    else if (tool === 'hole') this.change(() => edit.setHole([x, z], place));
    else if (tool === 'object') this.useObject(cell, place);
    else if (tool === 'enemy') this.useEnemy(cell, place);
    else if (tool === 'path') this.usePath(cell, place);
    else if (tool === 'exit') this.useExit(cell, place);
    else if (tool === 'spawn') this.change(() => place && edit.setPoint('spawn', point));
    else if (tool === 'reset') this.change(() => edit.setPoint('reset', place ? point : null));
  }

  useObject(cell, place) {
    const { edit } = this;
    if (!place) return this.change(() => edit.erase(cell));
    const type = this.objectTypes[this.objectType];
    if (this.pickupTypes[this.objectType]) return this.change(() => edit.placePickup(cell, this.objectType));
    this.change(() => edit.placeObject(cell, this.objectType));
    // A new platform is picked, ready for its path.
    const here = edit.at(cell);
    if (type?.kind === 'platform' && here?.kind === 'object' && !here.item.path) {
      this.status = NEEDS_PATH(here.item.id);
      this.select({ kind: 'item', id: here.item.id });
    }
  }

  useEnemy(cell, place) {
    const { edit } = this;
    const here = edit.at(cell);
    if (!place) return this.change(() => edit.erase(cell));
    if (here?.kind === 'enemy') {
      // Pick it: new enemies take its settings.
      this.enemy = { template: here.item.template, overrides: structuredClone(here.item.overrides ?? {}) };
      return this.select({ kind: 'item', id: here.item.id });
    }
    let id = null;
    this.change(() => !!(id = edit.placeEnemy(cell, this.enemy.template, this.enemy.overrides)));
    if (!id) return;
    this.status = this.patrols(this.enemy) ? NEEDS_PATH(id) : '';
    this.select({ kind: 'item', id });
  }

  usePath(cell, place) {
    const { edit } = this;
    const here = edit.at(cell);
    const mover = here && (here.kind === 'enemy' || (here.kind === 'object' && this.objectTypes[here.item.type]?.kind === 'platform'));
    const item = this.pathItem;
    if (!place) {
      if (item) this.change(() => edit.removeWaypoint(item.id));
      return;
    }
    if (mover && here.item !== item) return this.select({ kind: 'item', id: here.item.id });
    if (!item) {
      this.status = 'Pick a platform or an enemy first: click it.';
      return this.refresh();
    }
    const enemy = item === this.selectedEnemy;
    if (enemy && !this.walksPath(item)) {
      this.status = `${item.id} is stationary: set its Movement to patrol or chase (Enemy tool) to give it a path.`;
      return this.refresh();
    }
    // Enemies patrol level: their points stay at their own height.
    const target = enemy ? [cell[0], item.at[1], cell[2]] : cell;
    this.change(() => edit.addWaypoint(item.id, target));
  }

  useExit(cell, place) {
    const { edit } = this;
    const side = this.exitSide(cell);
    if (!side) {
      this.status = 'Exits go in the edge cells of the room.';
      return this.refresh();
    }
    const exit = edit.exitAt(side, cell);
    if (!place) {
      if (exit) this.change(() => edit.removeExit(exit.id));
      return;
    }
    if (exit) return this.select({ kind: 'exit', id: exit.id });
    let id = null;
    this.change(() => !!(id = edit.placeExit(side, cell, this.exitShape)));
    this.status = id ? `Exit ${id}: pick where it leads (Leads to).` : 'Another exit is in the way.';
    if (id) this.select({ kind: 'exit', id });
    else this.refresh();
  }

  /** Mouse on the game canvas: painting, erasing, picking, and the wheel for the layer. */
  listenPointer(canvas) {
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
      this.pointer = { clientX: e.clientX, clientY: e.clientY };
      this.hover = this.pick(e);
      this.updateCursor();
      // Painting: each new cell the stroke crosses.
      if (this.stroke && PAINT_TOOLS.has(this.tool) && this.hover && this.hover.join() !== this.strokeCell) {
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
      this.pointer = null;
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
      },
      { passive: false },
    );
  }

  /** The editor's own keys, and a warning before leaving with unsaved edits. */
  listenKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (isTextField(e.target)) {
        // Ctrl+S saves from a field too (committing it first), not the browser's Save Page.
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          e.target.blur();
          this.save();
        }
        return;
      }
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
      if (e.code === 'Escape') this.select(null);
      if ((e.code === 'Delete' || e.code === 'Backspace') && !this.stroke) this.removeSelected();
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
