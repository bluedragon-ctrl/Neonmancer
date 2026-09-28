/**
 * The views of the current room, rebuilt whenever the game rebuilds the room.
 * A respawn rebuilds the same room, where only the objects can have changed,
 * so the static views (floor, holes, walls, blocks, exits) are kept then.
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
import { createRoomView } from './room-view.js';
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
      this.staticGroup = new Group().add(
        createFloor(room.size, room.color, room.holes, room.look),
        createHoleView(room.holes, room.color),
        roomView,
        ...this.exitViews.map((view) => view.group),
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
    for (const view of this.pickupViews) view.sync(alpha, dt);
    this.zapView.sync(alpha, dt);
    for (const view of this.lockViews.values()) view.sync(dt);
    for (const view of this.exitViews) {
      // A locked exit's stream shows once its barrier is mostly gone.
      const lock = this.lockViews.get(view.exit.id);
      view.group.visible = !lock || lock.openness > 0.5;
      view.update(dt);
    }
    if (this.flare) {
      this.flare.time += dt;
      this.flare.apply(this.flare.time);
    }
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
