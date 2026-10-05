/**
 * The views of the current room, rebuilt whenever the game rebuilds the room.
 * A respawn rebuilds the same room, where only the objects can have changed,
 * so the static views (floor, holes, the shrine, walls, blocks, exits) are kept then.
 * Cut & Paste (D87) takes objects and enemies out and puts new ones in
 * while the room runs (clip()). A scan (D128) reveals fake blocks and
 * hidden exits: the room view is rebuilt without them (reveal()).
 */
import { Group } from 'three';
import { frameRoom } from './camera.js';
import { EnemyView, PlatformView, PushableView } from './entity-view.js';
import { ExitView } from './exit-view.js';
import { createFloor } from './floor.js';
import { createHoleView } from './hole-view.js';
import { createMotes } from './motes.js';
import { disposeTree, roomLook } from './neon.js';
import { PickupView } from './pickup-view.js';
import { flareHazard } from './block-fx.js';
import { CoreView } from './core-view.js';
import { DecoView } from './deco-view.js';
import { GateView } from './gate-view.js';
import { CLIP_FX, pasteGrow } from './clip-fx.js';
import { clipBounds } from './clip-view.js';
import { createRoomView } from './room-view.js';
import { pickPanels } from './walls.js';
import { createShrine } from './shrine-view.js';
import { LockView, PlateView, TargetView } from './switch-view.js';
import { DecoyView } from './decoy-view.js';
import { ScanView } from './scan-view.js';
import { ZapView } from './zap-view.js';

/**
 * The view class for each object kind (see entities/kinds.js). A view is
 * made with (game, object), has a `group` and syncs it once per frame.
 */
export const OBJECT_VIEWS = {
  pushable: PushableView,
  platform: PlatformView,
  target: TargetView,
  plate: PlateView,
  core: CoreView,
  deco: DecoView,
  gate: GateView,
};

/**
 * The room without its blocks above height layer `layer` (the edges of the
 * rest are worked out anew, so the cut shows as block tops).
 * @param {object} room built room (world/room.js)
 * @param {number} layer
 */
export function cutRoom(room, layer) {
  if (layer === null) return room;
  const blocks = Object.fromEntries(Object.entries(room.blocks).map(([type, cells]) => [type, cells.filter((cell) => cell[1] <= layer)]));
  return { ...room, blocks };
}

/**
 * The room as it shows now: without the hidden exits a scan has yet to
 * reveal (D128), drawn as wall. Fake blocks it revealed have left the
 * room's blocks already (entities/scan.js).
 * @param {import('../game.js').Game} game
 */
export function shownRoom({ room, hidden }) {
  return { ...room, exits: room.exits.filter((exit) => !hidden.exits.includes(exit)) };
}

export class RoomScene {
  /** @param {import('./renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.staticGroup = new Group();
    this.objectGroup = new Group();
    this.roomId = null;
    /** Height layer above which nothing is drawn (room editor), or null. */
    this.cutAbove = null;
    this.objectViews = [];
    this.enemyViews = [];
    this.pickupViews = [];
    this.exitViews = [];
    /** The room's backup shrine (shrine-view.js, D97), or null. */
    this.shrine = null;
    /** The floor (its data flows run in update()) and the warm motes or null (D179). */
    this.floor = null;
    this.motes = null;
    /** The back walls' glass panels (D179), picked once per entry, so a rebuild keeps them. */
    this.panels = [];
    /** Locked exits' barriers (switch-view.js), by exit id. */
    this.lockViews = new Map();
    /** Bolts and sparks of the room (made in show()). */
    this.zapView = null;
    /** The wizard's Fork decoy (made in show(), D129). */
    this.decoyView = null;
    /** Scan's wave and the derez of what it reveals (made in show(), D128). */
    this.scanView = null;
    /** The blocks and walls (room-view.js), rebuilt when a scan reveals something. */
    this.roomView = null;
    /** Game.reveals the room view was built for; it is rebuilt when they differ. */
    this.reveals = 0;
    /** "x,y,z" of each hazard-look block → its face material (room-view.js). */
    this.flares = new Map();
    /**
     * The hazard block or spiked platform (D82) that last hurt the wizard,
     * flaring: { owner, apply, object?, time }: `apply(since)` sets its
     * look `time` seconds after; `owner` tells flares apart (the face
     * material of a hazard block type, the object).
     */
    this.flare = null;
    /** Views of things just cut away (D87), kept until the marquee has snapped onto them. */
    this.leaving = [];
    /** The view of a thing being pasted in, scaled as it grows in. */
    this.growing = null;
    /** @type {import('../game.js').Game|null} */
    this.game = null;
  }

  /**
   * Show the game's current room (call after it was built or rebuilt).
   * @param {import('../game.js').Game} game
   * @param {object} [options]
   * @param {boolean} [options.rebuild] rebuild the static views of the same
   *   room too (its data changed in the room editor)
   * @param {number|null} [options.cutAbove] leave out blocks, objects and
   *   enemies above this height layer (the room editor's layer), or null
   * @param {boolean} [options.editing] shown in the room editor (switched-off gates show their outline, D141)
   */
  show(game, { rebuild = false, cutAbove = null, editing = false } = {}) {
    this.editing = editing;
    const { room } = game;
    const { renderer } = this;
    this.game = game;
    this.leaving = [];
    this.growing = null;
    const old = [this.objectGroup];
    // A spiked platform's flare goes with its old view.
    if (this.flare?.object) this.flare = null;
    const shown = (thing) => cutAbove === null || Math.floor(thing.pos[1]) <= cutAbove;
    this.objectViews = game.objects.filter(shown).map((object) => new OBJECT_VIEWS[object.kind](game, object, { editing }));
    this.enemyViews = game.enemies.filter(shown).map((enemy) => new EnemyView(game, enemy));
    this.pickupViews = game.pickups.filter((pickup) => cutAbove === null || pickup.data.at[1] <= cutAbove).map((pickup) => new PickupView(game, pickup));
    this.zapView = new ZapView(game);
    this.scanView = new ScanView(game);
    this.decoyView = new DecoyView(game);
    // A hidden exit (D128) that is only hidden has no barrier: it is wall until revealed.
    const barred = game.locks.filter(({ exit }) => exit.locked || exit.access);
    this.lockViews = new Map(barred.map((lock) => [lock.exit.id, new LockView(game, lock)]));
    this.objectGroup = new Group().add(this.zapView.group, this.scanView.group, this.decoyView.group, ...[...this.lockViews.values()].map((view) => view.group));
    // add() with no arguments logs an error (a room without objects).
    const views = [...this.objectViews, ...this.enemyViews, ...this.pickupViews];
    if (views.length > 0) this.objectGroup.add(...views.map((view) => view.group));
    // A respawn after a scan brings back what it revealed.
    if (rebuild || room.id !== this.roomId || cutAbove !== this.cutAbove || game.reveals !== this.reveals) {
      old.push(this.staticGroup);
      if (room.id !== this.roomId) this.panels = pickPanels(room.size, room.exits, roomLook(room.look).panels);
      this.exitViews = room.exits.map((exit) => new ExitView(exit, room.size, game.destinationColor(exit)));
      const roomView = createRoomView({ ...cutRoom(shownRoom(game), cutAbove), panels: this.panels });
      this.roomView = roomView;
      this.reveals = game.reveals;
      this.flares = roomView.userData.flares;
      this.flare = null;
      this.shrine = room.shrine ? createShrine() : null;
      this.shrine?.position.set(room.shrine[0], 0, room.shrine[1]);
      this.floor = createFloor(room.size, room.color, room.holes, room.look);
      this.motes = createMotes(room.size, room.color, roomLook(room.look).motes);
      this.staticGroup = new Group().add(
        this.floor,
        ...(this.motes ? [this.motes] : []),
        createHoleView(room.holes, room.color),
        roomView,
        ...this.exitViews.map((view) => view.group),
        ...(this.shrine ? [this.shrine] : []),
      );
      frameRoom(renderer.camera, room.size);
      renderer.setLook(room.look);
      this.roomId = room.id;
      this.cutAbove = cutAbove;
    }
    renderer.scene.add(this.staticGroup, this.objectGroup);
    // Compile the new views before freeing the old ones, so shaders they
    // share stay alive instead of being compiled again.
    renderer.compile();
    for (const group of old) {
      renderer.scene.remove(group);
      disposeTree(group);
    }
  }

  /**
   * Only the shape of the game's room, behind the title screen (D109): its
   * floor grid and back walls in its biome's look, empty (no blocks,
   * holes, exits or objects). The room itself loads after Start (show()).
   * @param {import('../game.js').Game} game
   */
  showShape(game) {
    const { room } = game;
    const { renderer } = this;
    const old = [this.objectGroup, this.staticGroup];
    this.game = game;
    this.leaving = [];
    this.growing = null;
    this.objectViews = [];
    this.enemyViews = [];
    this.pickupViews = [];
    this.exitViews = [];
    this.lockViews = new Map();
    this.flares = new Map();
    this.flare = null;
    this.shrine = null;
    this.zapView = new ZapView(game);
    this.scanView = null;
    this.decoyView = null;
    this.objectGroup = new Group().add(this.zapView.group);
    this.panels = pickPanels(room.size, [], roomLook(room.look).panels);
    const shape = { ...room, blocks: {}, holes: [], exits: [], panels: this.panels };
    this.roomView = createRoomView(shape);
    this.floor = createFloor(room.size, room.color, [], room.look);
    this.motes = createMotes(room.size, room.color, roomLook(room.look).motes);
    this.staticGroup = new Group().add(this.floor, this.roomView, ...(this.motes ? [this.motes] : []));
    frameRoom(renderer.camera, room.size);
    renderer.setLook(room.look);
    // The next show() builds the room in full, even the same one.
    this.roomId = null;
    this.cutAbove = null;
    renderer.scene.add(this.staticGroup, this.objectGroup);
    renderer.compile();
    for (const group of old) {
      renderer.scene.remove(group);
      disposeTree(group);
    }
  }

  /**
   * Once per frame.
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} dt seconds since the last frame
   */
  update(alpha, dt) {
    if (this.game) this.dropExpired();
    for (const view of this.objectViews) view.sync(alpha, dt);
    for (const view of this.enemyViews) view.sync(alpha, dt);
    this.updateClip(alpha, dt);
    for (const view of this.pickupViews) view.sync(alpha, dt);
    this.zapView.sync(alpha, dt);
    this.scanView?.sync(alpha, dt);
    this.decoyView?.sync(alpha, dt);
    if (this.game && this.game.reveals !== this.reveals) this.rebuildRoomView();
    // Exits a scan has yet to reveal (D128) are wall: no barrier, no stream.
    const hidden = (id) => this.game?.hidden.exits.some((exit) => exit.id === id) ?? false;
    for (const [id, view] of this.lockViews) {
      view.sync(dt);
      view.group.visible = !hidden(id);
    }
    for (const view of this.exitViews) {
      // A locked exit's stream shows once its barrier is mostly gone.
      const lock = this.lockViews.get(view.exit.id);
      view.group.visible = !hidden(view.exit.id) && (!lock || lock.openness > 0.5);
      view.update(dt);
    }
    this.shrine?.userData.update(dt);
    this.floor?.userData.update(dt);
    this.motes?.userData.update(dt);
    if (this.flare) {
      this.flare.time += dt;
      this.flare.apply(this.flare.time);
    }
  }

  /**
   * A scan revealed a fake block or a hidden exit (D128): it derezzes, and
   * the room view is rebuilt without it (in update(), once for all of a tick's).
   * @param {import('../game.js').GameEvent} event 'reveal'
   */
  reveal(event) {
    this.scanView?.reveal(event);
  }

  /** Build the blocks and walls anew as the room shows now (a scan revealed something). */
  rebuildRoomView() {
    const view = createRoomView({ ...cutRoom(shownRoom(this.game), this.cutAbove), panels: this.panels });
    if (this.roomView) {
      this.staticGroup.remove(this.roomView);
      disposeTree(this.roomView);
    }
    this.staticGroup.add(view);
    this.roomView = view;
    this.flares = view.userData.flares;
    this.flare = null;
    this.reveals = this.game.reveals;
  }

  /** The wizard used the room's backup shrine (D97): make it flare. */
  useShrine() {
    this.shrine?.userData.use();
  }

  /**
   * Cut & Paste (D87): a crate or an enemy was cut away or pasted in. A
   * cut one's view stays until the marquee has snapped onto it; a pasted
   * one gets a new view, which grows in (updateClip()).
   * @param {import('../game.js').GameEvent} event 'cut' or 'paste'
   */
  clip({ type, object, enemy }) {
    const list = object ? this.objectViews : this.enemyViews;
    if (type === 'cut') {
      const i = list.findIndex((view) => viewed(view) === (object ?? enemy));
      if (i >= 0) this.leaving.push(...list.splice(i, 1));
      return;
    }
    const view = object ? new OBJECT_VIEWS[object.kind](this.game, object, { editing: this.editing }) : new EnemyView(this.game, enemy);
    list.push(view);
    this.objectGroup.add(view.group);
  }

  /**
   * Compile (D125): a crate was compiled in; it gets a view, which grows
   * in by itself (compileLook()).
   * @param {import('../game.js').GameEvent} event 'compile'
   */
  addCompiled({ object }) {
    const view = new OBJECT_VIEWS[object.kind](this.game, object, { editing: this.editing });
    this.objectViews.push(view);
    this.objectGroup.add(view.group);
  }

  /** Views of compiled crates the game has dropped (Game.dropExpired()) go. */
  dropExpired() {
    const { objects } = this.game;
    this.objectViews = this.objectViews.filter((view) => {
      if (!view.pushable?.temporary || objects.includes(view.pushable)) return true;
      this.objectGroup.remove(view.group);
      disposeTree(view.group);
      return false;
    });
  }

  /** Once per frame: views of things cut away go, a pasted one grows in round its middle. */
  updateClip(alpha, dt) {
    const clip = this.game?.player.clip;
    const tick = clip ? clip.tick + alpha : 0;
    this.leaving = this.leaving.filter((view) => {
      if (clip?.mode === 'cut' && clip.target === viewed(view) && tick < CLIP_FX.snapTicks) {
        view.sync(alpha, dt);
        return true;
      }
      this.objectGroup.remove(view.group);
      disposeTree(view.group);
      return false;
    });
    const growing = clip?.mode === 'paste' ? [...this.objectViews, ...this.enemyViews].find((view) => viewed(view) === clip.target) : null;
    if (this.growing && this.growing !== growing) {
      this.growing.group.scale.setScalar(1);
      this.growing.group.position.set(0, 0, 0);
    }
    this.growing = growing ?? null;
    if (!growing) return;
    // Scale the view (drawn at the origin) round the middle of what it shows.
    const scale = Math.max(pasteGrow(tick), 1e-3);
    const { center } = clipBounds(clip.target, growing instanceof EnemyView);
    growing.group.scale.setScalar(scale);
    growing.group.position.set(...center.map((v) => v * (1 - scale)));
  }

  /**
   * A bolt stopped, or bounced: sparks where it is (or bounced).
   * @param {import('../entities/bolt.js').Bolt} bolt
   * @param {number[]} [pos] where it bounced; where it is by default
   * @param {number[]} [dir] the way it came in; its flight by default
   */
  sparks(bolt, pos, dir) {
    this.zapView.spark(bolt, pos, dir);
  }

  /** The core took fragments (a level raised, the Grid rebooted, D101): make it flash. */
  flashCore() {
    for (const view of this.objectViews) if (view instanceof CoreView) view.flash();
  }

  /**
   * A hazard block just hurt the wizard: make it flare.
   * @param {number[]} cell [x, y, z]
   */
  flareHazard(cell) {
    const faces = this.flares.get(cell.join());
    if (!faces) return; // a block that hurts without the hazard look
    this.startFlare({ owner: faces, apply: (since) => flareHazard(faces, cell, since) });
  }

  /**
   * A spiked platform (D82) just hurt the wizard: make it flare.
   * @param {object} object the room object (entities/platform.js)
   */
  flareObject(object) {
    const apply = this.objectViews.find((view) => view.platform === object)?.block.userData.flare;
    if (apply) this.startFlare({ owner: object, apply, object });
  }

  /** Start a flare; one still fading on something else goes out. */
  startFlare(flare) {
    if (this.flare && this.flare.owner !== flare.owner) this.flare.apply(Infinity);
    this.flare = { ...flare, time: 0 };
  }
}

/** The crate or enemy a view shows (Cut & Paste takes only those). */
function viewed(view) {
  return view.pushable ?? view.enemy;
}
