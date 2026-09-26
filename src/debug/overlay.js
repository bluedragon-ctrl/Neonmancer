/**
 * Debug mode (F3, CLAUDE.md §9): wireframe collision boxes for the static
 * blocks, the wizard and every pushable, plus the stats readout in
 * src/main.js. Room jump, invincibility and the test-damage key are actions
 * on the Game (see debugJumpRoom() and hurt() in src/game.js); this module
 * only draws the boxes and tracks whether the mode is on.
 */
import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments } from 'three';
import { lerpPosition } from '../render/interp.js';
import { PALETTE } from '../render/neon.js';

/** Unit cube edges, reused for every box: only position/scale differ. */
const UNIT_EDGES = new EdgesGeometry(new BoxGeometry(1, 1, 1));

const materials = {
  cell: new LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.5 }),
  body: new LineBasicMaterial({ color: PALETTE.lime }),
};

/** A wireframe box sized and centered by place(). */
function box(material) {
  return new LineSegments(UNIT_EDGES, material);
}

/** Move and resize a unit box mesh to cover [corner, corner + size]. */
function place(mesh, corner, size) {
  mesh.position.set(corner[0] + size[0] / 2, corner[1] + size[1] / 2, corner[2] + size[2] / 2);
  mesh.scale.set(size[0], size[1], size[2]);
}

export class DebugOverlay {
  constructor() {
    this.active = false;
    this.group = new Group();
    this.group.visible = false;
    this.cellGroup = new Group();
    this.playerBox = box(materials.body);
    this.pushableBoxes = [];
    this.bodyGroup = new Group().add(this.playerBox);
    this.group.add(this.cellGroup, this.bodyGroup);
  }

  /** Toggle debug mode on or off. */
  toggle() {
    this.active = !this.active;
    this.group.visible = this.active;
  }

  /**
   * Rebuild the boxes for a freshly (re)built room: one per static block
   * cell, one per pushable (the wizard's box is reused, see the constructor).
   * @param {{ cells: number[][] }} room
   * @param {import('../entities/pushable.js').Pushable[]} pushables
   */
  setRoom(room, pushables) {
    this.cellGroup.clear();
    for (const cell of room.cells) {
      const mesh = box(materials.cell);
      place(mesh, cell, [1, 1, 1]);
      this.cellGroup.add(mesh);
    }

    for (const mesh of this.pushableBoxes) this.bodyGroup.remove(mesh);
    this.pushableBoxes = pushables.map(() => box(materials.body));
    for (const mesh of this.pushableBoxes) this.bodyGroup.add(mesh);
  }

  /**
   * Place the player and pushable boxes at their interpolated position.
   * @param {import('../game.js').Game} game
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   */
  sync(game, alpha) {
    if (!this.active) return;
    const { player, pushables } = game;
    const pos = lerpPosition(player.prev, player.pos, alpha);
    place(this.playerBox, [pos[0] - player.size[0] / 2, pos[1], pos[2] - player.size[2] / 2], player.size);

    pushables.forEach((pushable, i) => {
      place(this.pushableBoxes[i], lerpPosition(pushable.prev, pushable.pos, alpha), [1, 1, 1]);
    });
  }
}
