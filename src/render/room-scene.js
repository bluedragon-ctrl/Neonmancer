/**
 * The views of the current room, rebuilt whenever the game rebuilds the room.
 * A respawn rebuilds the same room, where only the objects can have changed,
 * so the static views (floor, holes, the shrine, walls, blocks, exits) are kept then.
 * Cut & Paste (D87) takes objects and enemies out and puts new ones in
 * while the room runs (clip()).
 */
import { Group } from 'three';
import { frameRoom } from './camera.js';
import { CollapsingView, EnemyView, PlatformView, PushableView } from './entity-view.js';
import { ExitView } from './exit-view.js';
import { createFloor } from './floor.js';
import { createHoleView } from './hole-view.js';
import { disposeTree } from './neon.js';
import { PickupView } from './pickup-view.js';
import { flareHazard } from './block-fx.js';
import { CLIP_FX, pasteGrow } from './clip-fx.js';
import { clipBounds } from './clip-view.js';
import { createRoomView } from './room-view.js';
import { createShrine } from './shrine-view.js';
import { LockView, PlateView, TargetView } from './switch-view.js';
import { ZapView } from './zap-view.js';

/**
 * The view class for each object kind (see entities/kinds.js). A view is
 * made with (game, object), has a `group` and syncs it once per frame.
 */
export const OBJECT_VIEWS = {
  pushable: PushableView,
  platform: PlatformView,
  collapsing: CollapsingView,
  target: TargetView,
  plate: PlateView,
};

/**
 * The room without its blocks above height layer `layer` (the edges of the
 * rest are worked out anew, so the cut shows as block tops).
 * @param {object} room built room (world/room.js)
 * @param {number} layer
 */
export function cutRoom(room, layer) {
  const blocks = Object.fromEntries(Object.entries(room.blocks).map(([type, cells]) => [type, cells.filter((cell) => cell[1] <= layer)]));
  return { ...room, blocks };
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
    /** The room's backup shrine (shrine-view.js, D96), or null. */
    this.shrine = null;
    /** Locked exits' barriers (switch-view.js), by exit id. */
    this.lockViews = new Map();
    /** Bolts and sparks of the room (made in show()). */
    this.zapView = null;
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
   */
  show(game, { rebuild = false, cutAbove = null } = {}) {
    const { room } = game;
    const { renderer } = this;
    this.game = game;
    this.leaving = [];
    this.growing = null;
    const old = [this.objectGroup];
    // A spiked platform's flare goes with its old view.
    if (this.flare?.object) this.flare = null;
    const shown = (thing) => cutAbove === null || Math.floor(thing.pos[1]) <= cutAbove;
    this.objectViews = game.objects.filter(shown).map((object) => new OBJECT_VIEWS[object.kind](game, object));
    this.enemyViews = game.enemies.filter(shown).map((enemy) => new EnemyView(game, enemy));
    this.pickupViews = game.pickups.filter((pickup) => cutAbove === null || pickup.data.at[1] <= cutAbove).map((pickup) => new PickupView(game, pickup));
    this.zapView = new ZapView(game);
    this.lockViews = new Map(game.locks.map((lock) => [lock.exit.id, new LockView(game, lock)]));
    this.objectGroup = new Group().add(this.zapView.group, ...[...this.lockViews.values()].map((view) => view.group));
    // add() with no arguments logs an error (a room without objects).
    const views = [...this.objectViews, ...this.enemyViews, ...this.pickupViews];
    if (views.length > 0) this.objectGroup.add(...views.map((view) => view.group));
    if (rebuild || room.id !== this.roomId || cutAbove !== this.cutAbove) {
      old.push(this.staticGroup);
      this.exitViews = room.exits.map((exit) => new ExitView(exit, room.size, game.destinationColor(exit)));
      const roomView = createRoomView(cutAbove === null ? room : cutRoom(room, cutAbove));
      this.flares = roomView.userData.flares;
      this.flare = null;
      this.shrine = room.shrine ? createShrine() : null;
      this.shrine?.position.set(room.shrine[0], 0, room.shrine[1]);
      this.staticGroup = new Group().add(
        createFloor(room.size, room.color, room.holes, room.look),
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
   * Once per frame.
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} dt seconds since the last frame
   */
  update(alpha, dt) {
    for (const view of this.objectViews) view.sync(alpha, dt);
    for (const view of this.enemyViews) view.sync(alpha, dt);
    this.updateClip(alpha, dt);
    for (const view of this.pickupViews) view.sync(alpha, dt);
    this.zapView.sync(alpha, dt);
    for (const view of this.lockViews.values()) view.sync(dt);
    for (const view of this.exitViews) {
      // A locked exit's stream shows once its barrier is mostly gone.
      const lock = this.lockViews.get(view.exit.id);
      view.group.visible = !lock || lock.openness > 0.5;
      view.update(dt);
    }
    this.shrine?.userData.update(dt);
    if (this.flare) {
      this.flare.time += dt;
      this.flare.apply(this.flare.time);
    }
  }

  /** The wizard used the room's backup shrine (D96): make it flare. */
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
    const view = object ? new OBJECT_VIEWS[object.kind](this.game, object) : new EnemyView(this.game, enemy);
    list.push(view);
    this.objectGroup.add(view.group);
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
