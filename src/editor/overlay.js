/**
 * What the room editor draws over the room (D56): the grid of the height
 * layer being edited, the cursor on the cell under the mouse, and markers
 * for the start (spawn) and respawn (reset) points. Neon lines like the
 * room, so they glow and scale the same; the cursor and markers are drawn
 * through blocks, so they never get lost behind one.
 */
import { Group } from 'three';
import { PLAYER_HITBOX } from '../core/rules.js';
import { PALETTE, disposeTree, lineMaterial, neonLines } from '../render/neon.js';

/** Colors and widths (pixels at 1080p). */
export const EDITOR_LOOK = {
  grid: { color: 0x6a86a8, width: 1, brightness: 0.8 },
  border: { color: PALETTE.cyan, width: 2, brightness: 1 },
  /** Cursor colors by tool; erasing is red. */
  cursor: { place: 0xffffff, erase: 0xff3b30, width: 2.5, brightness: 1.4 },
  spawn: { color: PALETTE.cyan, width: 2 },
  reset: { color: PALETTE.magenta, width: 2 },
};

/** Drawn after everything else (the x-ray ghost included). */
const OVERLAY_ORDER = 100;

/** The 12 edges of a box from `lo` to `hi`. */
function boxSegments([x0, y0, z0], [x1, y1, z1]) {
  const segments = [];
  for (const y of [y0, y1]) {
    segments.push([[x0, y, z0], [x1, y, z0]], [[x1, y, z0], [x1, y, z1]], [[x1, y, z1], [x0, y, z1]], [[x0, y, z1], [x0, y, z0]]);
  }
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) segments.push([[x, y0, z], [x, y1, z]]);
  return segments;
}

/** Lines that stay visible through blocks. */
function onTop(line) {
  line.material.depthTest = false;
  line.material.transparent = true;
  line.renderOrder = OVERLAY_ORDER;
  return line;
}

export class EditorOverlay {
  constructor() {
    this.group = new Group();
    this.group.visible = false;
    /** Rebuilt when the layer or the room size changes. */
    this.gridGroup = new Group();
    this.gridKey = '';
    /** Cursor: a unit cube moved onto the cell under the mouse, or a square on a floor tile. */
    const { place, width, brightness } = EDITOR_LOOK.cursor;
    this.cursorMaterial = lineMaterial({ color: place, width, brightness });
    this.cube = onTop(neonLines(boxSegments([0, 0, 0], [1, 1, 1]), this.cursorMaterial));
    this.tile = onTop(neonLines([[[0, 0, 0], [1, 0, 0]], [[1, 0, 0], [1, 0, 1]], [[1, 0, 1], [0, 0, 1]], [[0, 0, 1], [0, 0, 0]]], this.cursorMaterial));
    this.cube.visible = this.tile.visible = false;
    const marker = ({ color, width }) => {
      const [w, h, d] = PLAYER_HITBOX;
      return onTop(neonLines(boxSegments([-w / 2, 0, -d / 2], [w / 2, h, d / 2]), lineMaterial({ color, width, dashed: true })));
    };
    this.spawn = marker(EDITOR_LOOK.spawn);
    this.reset = marker(EDITOR_LOOK.reset);
    this.group.add(this.gridGroup, this.cube, this.tile, this.spawn, this.reset);
  }

  /**
   * Draw the grid of height layer `layer` over the room's footprint.
   * @param {number[]} size room size [x, y, z]
   * @param {number} layer
   */
  setLayer([w, , d], layer) {
    const key = `${w},${d},${layer}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    this.group.remove(this.gridGroup);
    disposeTree(this.gridGroup);
    const y = layer + 0.002; // a hair above a block top, so it isn't hidden in it
    const lines = [];
    for (let x = 1; x < w; x++) lines.push([[x, y, 0], [x, y, d]]);
    for (let z = 1; z < d; z++) lines.push([[0, y, z], [w, y, z]]);
    const border = [[[0, y, 0], [w, y, 0]], [[w, y, 0], [w, y, d]], [[w, y, d], [0, y, d]], [[0, y, d], [0, y, 0]]];
    this.gridGroup = new Group();
    if (lines.length > 0) this.gridGroup.add(neonLines(lines, lineMaterial(EDITOR_LOOK.grid)));
    this.gridGroup.add(neonLines(border, lineMaterial(EDITOR_LOOK.border)));
    this.group.add(this.gridGroup);
  }

  /**
   * Put the cursor on a cell, or on a floor tile (flat), or hide it (null).
   * @param {number[]|null} cell [x, y, z]
   * @param {object} [options]
   * @param {boolean} [options.flat] a floor tile (holes), drawn flat at y
   * @param {boolean} [options.erase] the red erase look
   */
  setCursor(cell, { flat = false, erase = false } = {}) {
    this.cube.visible = !!cell && !flat;
    this.tile.visible = !!cell && flat;
    if (!cell) return;
    (flat ? this.tile : this.cube).position.set(cell[0], cell[1] + (flat ? 0.004 : 0), cell[2]);
    this.cursorMaterial.color.set(erase ? EDITOR_LOOK.cursor.erase : EDITOR_LOOK.cursor.place).multiplyScalar(EDITOR_LOOK.cursor.brightness);
  }

  /**
   * Show the start and respawn points (the wizard's box at each); no reset
   * means it is the spawn point.
   * @param {number[]} spawn feet center
   * @param {number[]} [reset]
   */
  setPoints(spawn, reset) {
    this.spawn.position.set(...spawn);
    this.reset.visible = !!reset;
    if (reset) this.reset.position.set(...reset);
  }
}
