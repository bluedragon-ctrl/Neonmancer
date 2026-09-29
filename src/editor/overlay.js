/**
 * What the room editor draws over the room (D56, D57): the grid of the
 * height layer being edited, the cursor on the cell under the mouse,
 * markers for the start (spawn) and respawn (reset) points, the paths of
 * platforms and enemies, and a box around what is selected. Neon lines like the
 * room, so they glow and scale the same; the cursor and markers are drawn
 * through blocks, so they never get lost behind one.
 */
import { Group } from 'three';
import { PLAYER_HITBOX } from '../core/rules.js';
import { exitCells, withExitDefaults } from '../data/room-data.js';
import { buildTrack } from '../world/path.js';
import { PALETTE, disposeTree, lineMaterial, neonLines } from '../render/neon.js';

/** Colors and widths (pixels at 1080p). */
export const EDITOR_LOOK = {
  grid: { color: 0x6a86a8, width: 1, brightness: 0.8 },
  border: { color: PALETTE.cyan, width: 2, brightness: 1 },
  /** Cursor colors by tool; erasing is red. */
  cursor: { place: 0xffffff, erase: PALETTE.danger, width: 2.5, brightness: 1.4 },
  spawn: { color: PALETTE.cyan, width: 2 },
  reset: { color: PALETTE.magenta, width: 2 },
  /**
   * Paths, dashed: dim when not picked; the picked thing's bright white, with
   * its points marked and a box around it (white: rooms come in every color).
   */
  path: { color: 0x9fb4d0, width: 2, brightness: 0.9, dashed: true },
  selected: { color: 0xffffff, width: 2.5, brightness: 1.2, dashed: true },
};

/** Half the size of a path point's cross. */
const POINT_MARK = 0.18;

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
    /** Paths and the selection box, rebuilt with setMarks(). */
    this.marks = new Group();
    this.group.add(this.gridGroup, this.cube, this.tile, this.spawn, this.reset, this.marks);
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
   * Draw the paths of the room's platforms and enemies (through the middle
   * of the cells they pass) and a box around the selected thing.
   * @param {object} room room data
   * @param {{ kind: 'item'|'exit', id: string } | null} selected
   */
  setMarks(room, selected) {
    this.group.remove(this.marks);
    disposeTree(this.marks);
    this.marks = new Group();
    this.group.add(this.marks);
    const lines = { path: [], selected: [] };
    for (const item of [...(room.objects ?? []), ...(room.enemies ?? []), ...(room.pickups ?? [])]) {
      const chosen = selected?.kind === 'item' && selected.id === item.id;
      if (chosen) lines.selected.push(...boxSegments(item.at, item.at.map((v) => v + 1)));
      if (!item.path) continue;
      const out = chosen ? lines.selected : lines.path;
      const mid = (p) => p.map((v) => v + 0.5);
      for (const { from, to } of buildTrack(item.at, item.path).legs) out.push([mid(from), mid(to)]);
      if (!chosen) continue;
      for (const point of item.path.points) {
        const [x, y, z] = mid(point);
        out.push([[x - POINT_MARK, y, z], [x + POINT_MARK, y, z]], [[x, y - POINT_MARK, z], [x, y + POINT_MARK, z]], [[x, y, z - POINT_MARK], [x, y, z + POINT_MARK]]);
      }
    }
    const exit = selected?.kind === 'exit' && (room.exits ?? []).find((e) => e.id === selected.id);
    if (exit) {
      const { inside } = exitCells(withExitDefaults(exit), room.size);
      const lo = [0, 1, 2].map((axis) => Math.min(...inside.map((cell) => cell[axis])));
      const hi = [0, 1, 2].map((axis) => Math.max(...inside.map((cell) => cell[axis])) + 1);
      lines.selected.push(...boxSegments(lo, hi));
    }
    for (const [key, segments] of Object.entries(lines)) {
      if (segments.length > 0) this.marks.add(onTop(neonLines(segments, lineMaterial(EDITOR_LOOK[key]))));
    }
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
