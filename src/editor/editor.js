/**
 * The in-game room editor (CLAUDE.md §9, D56, D57). F2 freezes the game and
 * edits the current room in place, in the real neon look: the room is
 * rebuilt from the edited data after every change. F2 again plays the
 * edited room from its start point (unsaved edits included), so editing
 * and testing take turns without a reload. Edits are kept per room until
 * the page is closed; the panel switches between rooms and makes new ones.
 * Exit connections are edited in world.json and screen texts in lore.json
 * (D118); both are saved with the rooms. Enemies are placed from their
 * templates (defs.json, D119), which the room editor doesn't change.
 *
 * The editor reads the mouse and its own keys directly, not through action
 * mapping (a tool, not the game; D56). Saving writes data/ through the dev
 * server; a build downloads the files instead.
 */
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { isTextField } from '../core/input.js';
import { MAX_ACCESS_LEVEL } from '../core/rules.js';
import { linkMap } from '../data/load.js';
import { resolveEnemyTemplates, sideLength, withExitDefaults } from '../data/room-data.js';
import { validateData } from '../data/validate.js';
import { LoreEdit } from './lore-edit.js';
import { errorTarget, groupErrors } from './errors.js';
import { formatJson } from './format-json.js';
import { idProblem } from './ids.js';
import { EditorOverlay } from './overlay.js';
import { EditorPanel, TOOLS } from './panel.js';
import { isSwitchGate, linksAt, poweredBy, poweredThings, roomSwitches, switchTimer, switchesOf } from './links.js';
import { RoomEdit, newRoom, resizeText, roomIdProblem, sizeProblem } from './room-edit.js';
import { downloadFile, saveFiles } from './save.js';
import { newText, pickedScreen, setScreenText, textUsers, updateText } from './texts.js';
import { WorldEdit, linkChoices } from './world-edit.js';
import { pickupReport } from '../world/pickup-report.js';
import { pickupBit } from '../world/progress.js';
import { SWITCH_KINDS } from '../entities/switch.js';
import { hitBoxes, pickCell } from './pick.js';
import { linkList, linkables, pickedLinkable, setEvery, setLink, switchClick } from './switch-tool.js';

/** Tools a mouse drag paints with; the others act on the cell clicked only. */
const PAINT_TOOLS = new Set(['block', 'hole', 'object']);
/** Tools that work on floor tiles (y 0) whatever the layer. */
const FLOOR_TOOLS = new Set(['hole', 'shrine']);
/**
 * Tools whose clicks hit what is seen (pick.js): blocks and items; the
 * Path tool items only (its points go on the layer). The others work on
 * the layer's plane (exits, the spawn and reset points) or the floor.
 */
const HIT_TOOLS = { block: true, object: true, enemy: true, switch: true, path: false };

/** The key that picks a tool. */
const toolKey = (id) => TOOLS.find((tool) => tool.id === id).key;

/** Hint after placing something that can't do without a path yet. */
const NEEDS_PATH = (id) => `${id} needs a path: pick the Path tool (${toolKey('path')}) and click cells.`;

/** Is a block type a switch gate (D140, D141), which takes switches? */
function switchGate(type) {
  return type?.kind === 'gate' && (type.trigger ?? 'switch') === 'switch';
}

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
    /** lore.json being edited (screen texts, D118); a new file if there is none yet. */
    this.lore = new LoreEdit(files['lore.json']);
    /** The files rooms share, by name without .json: saved and exported with the rooms. */
    this.shared = { world: this.world, lore: this.lore };
    /** Edited rooms by id, kept while the page is open. */
    this.sessions = new Map();
    /** @type {RoomEdit|null} the room being edited */
    this.edit = null;
    this.tool = 'block';
    /** Block type the Block tool places (defs.json "blocks", D60). */
    this.blockType = 'block';
    /** Switches of the switch gates the Block tool places (D140, D141); none: every switch in the room. */
    this.blockSwitches = [];
    this.blockTypes = game.content.blockTypes;
    /** Pickup types (D71): placed with the Object tool too, into the room's pickups. */
    this.pickupTypes = game.content.pickupTypes;
    this.objectTypes = { ...game.content.objectTypes, ...this.pickupTypes };
    /** Switch types (targets, plates, D140): only the Switch tool places them. */
    this.switchTypes = Object.fromEntries(Object.entries(this.objectTypes).filter(([, type]) => SWITCH_KINDS.includes(type.kind)));
    this.switchType = Object.keys(this.switchTypes)[0];
    /** What the Object tool places: every object and pickup type but the switches. */
    const placeable = Object.fromEntries(Object.entries(this.objectTypes).filter(([id]) => !this.switchTypes[id]));
    this.objectType = Object.keys(placeable)[0];
    this.enemyTemplates = game.content.enemyTemplates;
    /** Template of new enemies (an enemy is all its template, D119). */
    this.enemyTemplate = Object.keys(this.enemyTemplates)[0];
    /** Shape of new exits. */
    this.exitShape = { width: 2, height: 2 };
    /** @type {{ kind: 'item'|'exit'|'gate', id?: string, cell?: number[] } | null} the picked object, enemy, exit or switch gate (a cell of it) */
    this.selected = null;
    /** Shift held at the last mouse event: the Switch tool picks another thing only with it. */
    this.shift = false;
    /** The key of the link checklist row under the mouse (its link lights up), or null. */
    this.linkHover = null;
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
      objectTypes: placeable,
      switchTypes: this.switchTypes,
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
        switchType: (id) => {
          this.switchType = id;
          this.refresh();
        },
        link: (key, on) => this.tickLink(key, on),
        linkEvery: (on) => this.tickLink(null, on),
        linkHover: (key) => {
          this.linkHover = key;
          this.updateLinks();
        },
        enemyTemplate: (id) => this.setEnemyTemplate(id),
        enemyDrop: (id) => this.setEnemyDrop(id),
        screenText: (id) => setScreenText(this, id),
        blockSwitches: (ids) => {
          this.blockSwitches = ids;
          this.refresh();
        },
        switchTimer: (seconds) => this.selectedItem && this.change(() => this.edit.setTimer(this.selectedItem.id, seconds)),
        itemSwitches: (ids) => this.selectedItem && this.change(() => this.edit.setSwitches(this.selectedItem.id, ids)),
        newText: (id, text) => newText(this, id, text),
        updateText: (text) => updateText(this, text),
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
    if (!this.sessions.has(id)) this.sessions.set(id, new RoomEdit(this.files[`rooms/${id}.json`], { world: this.world, lore: this.lore }));
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
    this.sessions.set(id, new RoomEdit(data, { world: this.world, lore: this.lore, fresh: true }));
    this.game.content.rooms.set(id, data);
    this.openRoom(id);
    this.panel.newRoomInput.value = '';
    this.status = `New room ${id}: give it an exit (Exit tool, ${toolKey('exit')}) and connect it, then save.`;
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

  /**
   * The rooms each permanent pickup type lies in (D71, D146), edits not yet
   * saved included: the Object tool's list shows them.
   * @returns {Map<string, string[]>} pickup type → the room of each place
   */
  pickupPlaces() {
    const rooms = this.roomIds().map((id) => [id, this.roomData(id) ?? {}]);
    const { items } = pickupReport(this.pickupTypes, this.game.content.spells, rooms);
    const places = new Map();
    for (const item of items) for (const type of item.types) places.set(type, item.places.map((place) => place.room));
    return places;
  }

  /** A room's data as edited so far. */
  roomData(id) {
    return this.sessions.get(id)?.data ?? this.game.content.rooms.get(id);
  }

  /** Every data file with the edits in: what saving would write. */
  editedFiles() {
    const files = { ...this.files };
    for (const [name, file] of Object.entries(this.shared)) files[`${name}.json`] = file.toData();
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
    this.game.content.lore = this.lore.texts;
    this.game.content.rooms.set(data.id, data);
    this.game.content.links = linkMap(this.world.connections);
    try {
      this.game.enterRoom(data.id);
      this.onRoom({ cutAbove: this.cutLayer, editing: true });
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
    if (this.active && !this.stale && this.game.room.id === this.edit.id) this.onRoom({ cutAbove: this.cutLayer, editing: true });
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

  /**
   * Pick an object, enemy, exit or (the Switch tool) a switch gate by one
   * of its cells (null: none); one that is gone is dropped.
   */
  select(selected) {
    let gone = selected?.kind === 'item' ? !this.edit.item(selected.id) : selected?.kind === 'exit' && !this.edit.exits.some((e) => e.id === selected.id);
    let cells = null;
    if (selected?.kind === 'gate') {
      cells = pickedLinkable(linkables(this.edit, this.linkTypes), selected)?.cells ?? null;
      gone = !cells;
    }
    this.selected = gone ? null : selected;
    this.overlay.setMarks(this.edit.data, this.selected, cells);
    this.updateCursor();
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

  /** Do enemies of this template patrol, so they need a path? */
  patrols(template) {
    return this.enemyTemplates[template]?.movement === 'patrol';
  }

  /** May enemies of this template have a path: a patrol, or a chaser (walked while calm, D78)? Not a stationary one. */
  walksPath(template) {
    return this.enemyTemplates[template]?.movement !== 'stationary';
  }

  /** The template picked in the panel: for new enemies, and the picked one. */
  setEnemyTemplate(template) {
    this.enemyTemplate = template;
    const enemy = this.selectedEnemy;
    if (enemy) this.retype(enemy, template);
    this.refresh();
  }

  /** Give the picked enemy a template (its id follows it; a stationary one loses its path) and keep it picked. */
  retype(enemy, template) {
    let id = null;
    this.change(() => !!(id = this.edit.setEnemy(enemy.id, template, this.walksPath(template), Boolean(this.enemyTemplates[template]?.boss))));
    if (id) this.select({ kind: 'item', id });
  }

  /** The pickup the picked boss drops (D104), picked in the panel; '' for none. */
  setEnemyDrop(drop) {
    const enemy = this.selectedEnemy;
    if (enemy) this.change(() => this.edit.setDrop(enemy.id, drop || null));
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
    } else if (field === 'locked' || field === 'hidden' || field === 'switches') {
      this.change(() => this.edit.updateExit(exit.id, { [field]: value }));
    } else if (field === 'access') {
      this.change(() => this.edit.updateExit(exit.id, { access: Math.min(MAX_ACCESS_LEVEL, Math.max(0, Math.round(value))) }));
    } else if (field === 'id') {
      const problem = idProblem('Exit id', value, this.edit.exits.filter((e) => e !== exit).map((e) => e.id));
      if (problem) this.status = problem;
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
    // The changed shared files, as they are now: { world: data, ... }.
    const shared = Object.fromEntries(Object.entries(this.shared).filter(([, file]) => file.dirty).map(([name, file]) => [name, file.toData()]));
    const sharedNames = Object.keys(shared).map((name) => `${name}.json`);
    if (!this.canSave) {
      // Nothing changed: export the room shown.
      const exported = rooms.length > 0 || sharedNames.length > 0 ? rooms : [this.edit];
      for (const edit of exported) downloadFile(`${edit.id}.json`, edit.text());
      for (const [name, data] of Object.entries(shared)) downloadFile(`${name}.json`, formatJson(data));
      const names = [...exported.map((edit) => `${edit.id}.json`), ...sharedNames];
      this.status = `Exported ${names.join(', ')}${this.errors.length > 0 ? ' (with errors)' : ''}.`;
      this.refresh();
      return;
    }
    if (rooms.length === 0 && sharedNames.length === 0) return;
    if (this.errors.length > 0) {
      this.status = 'Not saved: fix the errors below first.';
      this.refresh();
      return;
    }
    this.status = 'Saving…';
    this.refresh();
    const sent = rooms.map((edit) => edit.toData());
    this.saving = true;
    const result = await saveFiles({ rooms: sent, ...shared }).finally(() => (this.saving = false));
    if (result.ok) {
      // Edits made while saving stay unsaved: what was sent is what is saved.
      rooms.forEach((edit, i) => {
        edit.markSaved(formatJson(sent[i]));
        this.files[`rooms/${edit.id}.json`] = sent[i];
      });
      for (const [name, data] of Object.entries(shared)) {
        this.shared[name].markSaved(formatJson(data));
        this.files[`${name}.json`] = data;
      }
      this.status = `Saved ${result.files.join(', ')}.`;
    } else {
      this.serverErrors = result.errors;
      this.status = 'Not saved:';
    }
    this.refresh();
  }

  /**
   * Another page (the monster editor, the world map) saved data files: take
   * the enemy templates, and the rooms this page has no unsaved edits of.
   * @param {Record<string, any>} saved the files as saved, by path relative to data/
   */
  takeSaved(saved) {
    if (this.saving) return;
    const taken = [];
    const kept = [];
    for (const [file, data] of Object.entries(saved)) {
      if (file === 'defs.json') {
        if (formatJson(data) === formatJson(this.files[file])) continue;
        this.files[file] = data;
        this.setEnemyTemplates(resolveEnemyTemplates(data.enemies ?? {}));
        taken.push('the enemy templates');
      } else if (file.startsWith('rooms/')) {
        const id = file.slice('rooms/'.length, -'.json'.length);
        const session = this.sessions.get(id);
        if (formatJson(data) === (session?.savedText ?? formatJson(this.files[file] ?? null))) continue;
        if (session?.dirty) {
          kept.push(id);
          continue;
        }
        this.files[file] = data;
        this.sessions.delete(id);
        this.game.content.rooms.set(id, data);
        taken.push(id);
      }
    }
    if (taken.length === 0 && kept.length === 0) return;
    // The room open here may have changed under it: open it again.
    if (this.active && !this.sessions.has(this.edit.id)) {
      this.edit = this.session(this.edit.id);
      this.setLayer(this.layer);
    }
    if (this.active) this.stale = true;
    this.status = [
      taken.length > 0 && `Another page saved ${taken.join(', ')}: taken in.`,
      kept.length > 0 && `${kept.join(', ')} changed on disk too: your unsaved edits here would overwrite that.`,
    ]
      .filter(Boolean)
      .join(' ');
    this.refresh();
  }

  /**
   * Enemy templates (filled in) for the game and the panel; new enemies of
   * one that is gone are of the first.
   * @param {Record<string, object>} templates
   */
  setEnemyTemplates(templates) {
    this.enemyTemplates = templates;
    this.game.content.enemyTemplates = templates;
    this.panel.setEnemyTemplates(templates);
    if (!templates[this.enemyTemplate]) this.enemyTemplate = Object.keys(templates)[0];
  }

  /** Are there edits not saved yet, in any room, world.json or lore.json? */
  get unsaved() {
    return Object.values(this.shared).some((file) => file.dirty) || [...this.sessions.values()].some((edit) => edit.dirty);
  }

  refresh() {
    if (!this.active) return;
    this.updateLinks();
    const enemy = this.selectedEnemy;
    const exit = this.selectedExit;
    const pathItem = this.pathItem;
    this.panel.show({
      edit: this.edit,
      rooms: this.roomIds(),
      tool: this.tool,
      blockType: this.blockType,
      blockSwitches: switchGate(this.blockTypes[this.blockType]) ? this.blockSwitches : null,
      objectType: this.objectType,
      objectPlaces: this.tool === 'object' ? this.pickupPlaces() : null,
      switchType: this.switchType,
      linkList: this.linkListState(),
      links: this.linksState(),
      switchInfo: this.switchState(),
      enemy: {
        id: enemy?.id ?? null,
        template: enemy?.template ?? this.enemyTemplate,
        // A boss's drop (D104): one of the room's permanent pickups.
        drop: enemy?.drop ?? null,
        drops: (this.edit.data.pickups ?? []).filter((pickup) => pickupBit(this.game.content.pickupTypes[pickup.type] ?? {}, this.game.content.spells) !== null).map((pickup) => pickup.id),
      },
      pathItem,
      pathItemIsEnemy: !!pathItem && pathItem === enemy,
      screen: this.screenState(),
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

  /** The room as it stands now, for links.js: its blocks written back from the editor's boxes. */
  get linkData() {
    return this.edit.toData();
  }

  /** Block and object types, as links.js wants them. */
  get linkTypes() {
    return { objectTypes: this.objectTypes, blockTypes: this.blockTypes };
  }

  /**
   * The picked switch for the panel (D140): what it powers and its timer
   * (its type's or its own); or null.
   */
  switchState() {
    const item = this.selectedItem;
    if (!item || !roomSwitches({ objects: [item] }, this.objectTypes).length) return null;
    const powers = poweredBy(poweredThings(this.linkData, this.linkTypes), item.id);
    const typeTimer = this.objectTypes[item.type]?.timer ?? null;
    return { id: item.id, powers: powers.map((thing) => thing.label), timer: switchTimer(item, this.objectTypes), typeTimer };
  }

  /**
   * The switch links to draw (D140): those of what is under the mouse, else
   * of what is picked (a switch, a platform, a locked exit); null: none.
   */
  focusLinks() {
    const row = this.linkHover && this.hoveredRowLinks(this.linkHover);
    if (row) return row;
    const flat = FLOOR_TOOLS.has(this.tool);
    const hovered = this.hover && !flat ? linksAt(this.linkData, this.linkTypes, this.hover) : null;
    if (hovered) return hovered;
    const item = this.selectedItem;
    if (item) return linksAt(this.linkData, this.linkTypes, item.at);
    if (this.selected?.kind === 'gate') return linksAt(this.linkData, this.linkTypes, this.selected.cell);
    const exit = this.selectedExit;
    if (!exit?.locked) return null;
    const thing = poweredThings(this.linkData, this.linkTypes).find((one) => one.kind === 'exit' && one.id === exit.id);
    return thing ? { switches: switchesOf(thing, roomSwitches(this.linkData, this.objectTypes)), powered: [thing] } : null;
  }

  /** The links of a checklist row under the mouse: the picked switch and that thing, or the picked thing and that switch. */
  hoveredRowLinks(key) {
    const { things, switches, picked } = this.linkState();
    if (picked.switch) {
      const thing = things.find((t) => t.key === key);
      return thing ? { switches: [picked.switch], powered: [thing] } : null;
    }
    const zwitch = picked.thing && switches.find((object) => object.id === key);
    return zwitch ? { switches: [zwitch], powered: [picked.thing] } : null;
  }

  /** Redraw the switch links when what they show changed. */
  updateLinks() {
    const links = this.focusLinks();
    const key = links ? JSON.stringify([links.switches.map((s) => s.at), links.powered.map((p) => p.cells)]) : '';
    if (key === this.linksKey) return;
    this.linksKey = key;
    this.overlay.setLinks(links);
  }

  /**
   * Alt+click with the Block tool: take the type of the block in a cell,
   * and a switch gate's switches (D141), to paint more like it.
   * @param {number[]} cell
   */
  eyedrop(cell) {
    const here = this.edit.at(cell);
    if (here?.kind !== 'block') {
      this.status = 'Alt+click a block to take its type and switches.';
      return this.refresh();
    }
    this.blockType = here.type;
    this.blockSwitches = here.switches ?? [];
    const links = linksAt(this.linkData, this.linkTypes, cell);
    this.status = `Painting ${here.type}${links ? `: ${links.text}` : ''}.`;
    this.refresh();
  }

  /** The picked platform for the panel (D140): its switches; or null. */
  linksState() {
    const item = this.selectedItem;
    return item && this.objectTypes[item.type]?.kind === 'platform' ? { kind: 'platform', switches: item.switches ?? [] } : null;
  }

  /** The picked screen for the panel (D118): its id, its text and who shows that, and every text; or null. */
  screenState() {
    const screen = pickedScreen(this);
    if (!screen) return null;
    return { id: screen.id, text: screen.text ?? null, texts: this.lore.texts, users: screen.text ? textUsers(this, screen.text) : [] };
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

  /** Where an error points in the editor, or null (errors.js). */
  errorTarget(error) {
    return errorTarget(error, { roomData: (id) => this.roomData(id), connections: this.world.connections });
  }

  /** The errors by file, each marked if a click can go to it. */
  errorGroups() {
    return groupErrors([...this.serverErrors, ...this.errors]).map((group) => ({
      ...group,
      errors: group.errors.map((entry) => ({ ...entry, target: this.errorTarget(entry.error) !== null })),
    }));
  }

  /** Go to what an error is about: its room, the tool that edits it, picked, on its layer. */
  goTo(error) {
    const target = this.errorTarget(error);
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
   * The cell under the mouse: for most tools what is seen there, a block
   * or an item drawn on this layer (pick.js), else the cell of the
   * current layer (floor tile for the Hole and Shrine tools: y 0); null
   * outside the room. Keeps where the ray met it in `this.hit`.
   * @param {PointerEvent|WheelEvent} event
   * @returns {number[]|null} [x, y, z]
   */
  pick(event) {
    const rect = this.renderer.webgl.domElement.getBoundingClientRect();
    const ndc = new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.renderer.camera);
    const y = FLOOR_TOOLS.has(this.tool) ? 0 : this.layer;
    const [w, , d] = this.edit.size;
    if (this.tool in HIT_TOOLS) {
      const { origin, direction } = this.raycaster.ray;
      const boxes = hitBoxes(this.edit, this.objectTypes, { cutAbove: this.cutLayer, blocks: HIT_TOOLS[this.tool] });
      const hit = pickCell(origin.toArray(), direction.toArray(), boxes, y);
      if (!hit) return null;
      this.hit.fromArray(hit.point);
      if (hit.cell) return [...hit.cell];
    } else if (!this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -y), this.hit)) return null;
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
    // The layer or the tool (holes and the shrine are on the floor) may have changed under a still mouse.
    if (this.pointer && !this.stroke) this.hover = this.pick(this.pointer);
    const flat = FLOOR_TOOLS.has(this.tool);
    // The Switch tool says what a click does: its cursor in a color of its own (D142).
    const click = this.hover && this.tool === 'switch' && !this.stroke ? this.switchClick(this.hover) : null;
    this.overlay.setCursor(this.hover, { flat, erase: this.stroke === 'erase', tone: click?.action });
    const links = this.hover && !flat ? linksAt(this.linkData, this.linkTypes, this.hover) : null;
    const said = click ? ` · click: ${click.text}` : links ? ` · ${links.text}` : '';
    this.panel.setHover(this.hover && `${this.edit.describe(this.hover, { tile: flat })}${said}`);
    this.updateLinks();
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
    if (tool === 'block') this.change(() => (place ? edit.placeBlock(cell, this.blockType, this.blockSwitches) : edit.erase(cell)));
    else if (tool === 'hole') this.change(() => edit.setHole([x, z], place));
    else if (tool === 'object') this.useObject(cell, place);
    else if (tool === 'enemy') this.useEnemy(cell, place);
    else if (tool === 'path') this.usePath(cell, place);
    else if (tool === 'exit') this.useExit(cell, place);
    else if (tool === 'spawn') this.change(() => place && edit.setPoint('spawn', point));
    else if (tool === 'reset') this.change(() => edit.setPoint('reset', place ? point : null));
    else if (tool === 'shrine') this.change(() => edit.setShrine(place ? [x, z] : null));
    else if (tool === 'switch') this.useSwitch(cell, place);
  }

  /**
   * Switch tool (D140, D142): the only tool that places switches; what a
   * left click does is worked out in switch-tool.js (switchClick()), and
   * the cursor and the hover line say it before. Right click erases a
   * switch, elsewhere drops the pick.
   * @param {number[]} cell
   * @param {boolean} place left button
   */
  useSwitch(cell, place) {
    const { edit } = this;
    const here = edit.at(cell);
    if (!place) {
      const isSwitch = here?.kind === 'object' && roomSwitches({ objects: [here.item] }, this.objectTypes).length > 0;
      if (isSwitch) {
        this.change(() => edit.erase(cell));
        this.status = `${here.item.id} erased.`;
        return this.select(this.selected);
      }
      return this.select(null);
    }
    const click = this.switchClick(cell);
    if (click.action === 'place') {
      this.change(() => edit.placeObject(cell, this.switchType));
      const placed = edit.at(cell);
      if (placed?.kind !== 'object') return;
      this.status = `${placed.item.id} placed and picked: tick what it powers below, or click it in the room.`;
      return this.select({ kind: 'item', id: placed.item.id });
    }
    if (click.action === 'pick') {
      this.status = `${click.text.replace(/^pick /, '')} picked.`;
      return this.select(click.pick);
    }
    if (click.action === 'none') {
      this.status = `${click.text[0].toUpperCase()}${click.text.slice(1)}.`;
      return this.refresh();
    }
    const { thing, switchId } = click;
    this.change(() => {
      if (thing.kind === 'gate') return edit.toggleGateLink(thing.cells[0], switchId) !== null;
      if (thing.kind === 'platform') return !!edit.togglePlatformLink(thing.id, switchId);
      return !!edit.toggleExitLink(thing.id, switchId);
    });
    this.status = `${click.text[0].toUpperCase()}${click.text.slice(1)}: done.`;
    this.select(this.selected);
  }

  /** What a left click of the Switch tool on `cell` would do (switch-tool.js). */
  switchClick(cell) {
    const side = this.exitSide(cell);
    const exit = (side && this.edit.exitAt(side, cell)) || null;
    return switchClick(this.edit, this.linkTypes, { cell, exit, selected: this.selected, shift: this.shift, switchType: this.switchType });
  }

  /** The Switch tool's linkable things, the room's switches and what of them is picked. */
  linkState() {
    const things = linkables(this.edit, this.linkTypes);
    const switches = roomSwitches(this.edit.data, this.objectTypes);
    const item = this.selectedItem;
    const picked = { switch: item && switches.includes(item) ? item : null, thing: pickedLinkable(things, this.selected) };
    return { things, switches, picked };
  }

  /** The panel's link checklist (switch-tool.js), in the Switch tool or for a switch the Object tool picked. */
  linkListState() {
    if (this.tool !== 'switch' && !this.switchState()) return null;
    const { things, switches, picked } = this.linkState();
    return linkList(things, switches, picked);
  }

  /**
   * A checklist tick: link or unlink a row (a thing for a picked switch, a
   * switch for a picked thing), or (`key` null) put the picked thing on
   * every switch or name them.
   * @param {string|null} key
   * @param {boolean} on
   */
  tickLink(key, on) {
    const { things, switches, picked } = this.linkState();
    const all = switches.map((object) => object.id);
    if (picked.switch) {
      const thing = things.find((t) => t.key === key);
      if (thing) this.change(() => setLink(this.edit, thing, picked.switch.id, on, all));
    } else if (picked.thing) {
      if (key === null) this.change(() => setEvery(this.edit, picked.thing, on, all));
      else this.change(() => setLink(this.edit, picked.thing, key, on, all));
    }
    this.select(this.selected);
  }

  useObject(cell, place) {
    const { edit } = this;
    if (!place) return this.change(() => edit.erase(cell));
    const type = this.objectTypes[this.objectType];
    const before = edit.at(cell);
    // A decoration of this type there is picked (a screen's text is set in
    // the panel, D118); clicking the picked one turns it to face the other way (D117).
    if (type?.kind === 'deco' && before?.kind === 'object' && before.item.type === this.objectType) {
      const { id } = before.item;
      if (this.selected?.id !== id) {
        this.select({ kind: 'item', id });
        this.status = `${id} picked: click it again to turn it.`;
        return this.refresh();
      }
      this.change(() => edit.turnObject(id));
      this.status = `${id} faces ${edit.item(id)?.overrides?.face ?? '+z'}.`;
      return this.refresh();
    }
    // Nothing is ever overwritten (D142): an object, enemy or pickup there
    // is picked (a switch or a platform shows its links), a block named;
    // erase it (right click) to put something else there.
    if (before?.kind === 'block') {
      this.status = `A ${before.type} block is there: erase it first to place ${this.objectType}.`;
      return this.refresh();
    }
    if (before) {
      if (this.selected?.id === before.item.id && before.item.type !== this.objectType) {
        this.status = `${before.item.id} is there: erase it first (right click) to place ${this.objectType}.`;
        return this.refresh();
      }
      this.status = `${before.item.id} picked.`;
      return this.select({ kind: 'item', id: before.item.id });
    }
    if (this.pickupTypes[this.objectType]) return this.change(() => edit.placePickup(cell, this.objectType));
    this.change(() => edit.placeObject(cell, this.objectType));
    const here = edit.at(cell);
    if (here?.kind !== 'object') return;
    if (type?.kind === 'deco') {
      this.select({ kind: 'item', id: here.item.id });
      this.status = `${here.item.id} faces +z: click it again to turn it to +x.`;
      this.refresh();
    }
    // A new platform is picked, ready for its path.
    if (type?.kind === 'platform' && !here.item.path) {
      this.status = NEEDS_PATH(here.item.id);
      this.select({ kind: 'item', id: here.item.id });
    }
  }

  useEnemy(cell, place) {
    const { edit } = this;
    const here = edit.at(cell);
    if (!place) return this.change(() => edit.erase(cell));
    if (here?.kind === 'enemy') {
      // Pick it: new enemies are of its template.
      this.enemyTemplate = here.item.template;
      return this.select({ kind: 'item', id: here.item.id });
    }
    let id = null;
    this.change(() => !!(id = edit.placeEnemy(cell, this.enemyTemplate)));
    if (!id) return;
    this.status = this.patrols(this.enemyTemplate) ? NEEDS_PATH(id) : '';
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
    if (enemy && !this.walksPath(item.template)) {
      this.status = `${item.id} is stationary (template ${item.template}): pick a patrolling or chasing template (Enemy tool) to give it a path.`;
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
      this.shift = e.shiftKey;
      // Alt+click with the Block tool takes a block's type and switches.
      if (this.tool === 'block' && e.altKey && e.button === 0) return this.eyedrop(cell);
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
      this.shift = e.shiftKey;
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
    // Shift changes what a Switch tool click does (it picks another thing): say so at once.
    const shift = (e) => {
      if (!this.active || e.key !== 'Shift' || this.shift === (e.type === 'keydown')) return;
      this.shift = e.type === 'keydown';
      this.updateCursor();
    };
    window.addEventListener('keyup', shift);
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      shift(e);
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
