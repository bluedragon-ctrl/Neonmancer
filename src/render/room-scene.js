/**
 * The views of the current room, rebuilt whenever the game rebuilds the room.
 * A respawn rebuilds the same room, where only the objects can have changed,
 * so the static views (floor, holes, walls, blocks, exits) are kept then.
 */
import { Group } from 'three';
import { frameRoom } from './camera.js';
import { PlatformView, PushableView } from './entity-view.js';
import { ExitView } from './exit-view.js';
import { createFloor } from './floor.js';
import { createHoleView } from './hole-view.js';
import { disposeTree } from './neon.js';
import { flareHazard } from './block-fx.js';
import { createRoomView } from './room-view.js';

/**
 * The view class for each object kind (see entities/kinds.js). A view is
 * made with (game, object), has a `group` and syncs it once per frame.
 */
export const OBJECT_VIEWS = {
  pushable: PushableView,
  platform: PlatformView,
};

export class RoomScene {
  /** @param {import('./renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.staticGroup = new Group();
    this.objectGroup = new Group();
    this.roomId = null;
    this.objectViews = [];
    this.exitViews = [];
    /** Face material of the room's hazard blocks, or null. */
    this.hazardFaces = null;
    /** The hazard block that last hurt the wizard, flaring: { cell, time } (seconds since). */
    this.flare = null;
  }

  /**
   * Show the game's current room (call after it was built or rebuilt).
   * @param {import('../game.js').Game} game
   */
  show(game) {
    const { room } = game;
    const { renderer } = this;
    const old = [this.objectGroup];
    this.objectViews = game.objects.map((object) => new OBJECT_VIEWS[object.kind](game, object));
    this.objectGroup = new Group();
    // add() with no arguments logs an error (a room without objects).
    if (this.objectViews.length > 0) this.objectGroup.add(...this.objectViews.map((view) => view.group));
    if (room.id !== this.roomId) {
      old.push(this.staticGroup);
      this.exitViews = room.exits.map((exit) => new ExitView(exit, room.size, game.destinationColor(exit)));
      const roomView = createRoomView(room);
      this.hazardFaces = roomView.userData.hazardFaces;
      this.flare = null;
      this.staticGroup = new Group().add(
        createFloor(room.size, room.color, room.holes),
        createHoleView(room.holes, room.color),
        roomView,
        ...this.exitViews.map((view) => view.group),
      );
      frameRoom(renderer.camera, room.size);
      this.roomId = room.id;
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
    for (const view of this.objectViews) view.sync(alpha);
    for (const view of this.exitViews) view.update(dt);
    if (this.flare && this.hazardFaces) {
      this.flare.time += dt;
      flareHazard(this.hazardFaces, this.flare.cell, this.flare.time);
    }
  }

  /**
   * A hazard block just hurt the wizard: make it flare.
   * @param {number[]} cell [x, y, z]
   */
  flareHazard(cell) {
    this.flare = { cell, time: 0 };
  }
}
