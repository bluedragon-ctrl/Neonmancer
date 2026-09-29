/**
 * The room compiling in after Start (D110): a canvas over the game, under
 * the HUD, covering the room in the void and clearing it tile by tile
 * along the room's own grid, back corner first; each tile is a column from
 * the floor to the ceiling, so what stands on it clears with it (a cleared
 * column always shows, over the covered ones), and its
 * floor outline flashes cyan as it goes. The world round the room fades in
 * last. Timing and order come from render/boot-fx.js.
 */
import { Vector3 } from 'three';
import { outsideCover, revealTiles, tileLook } from '../render/boot-fx.js';

const VOID = '#05060d';
const FLASH = '0, 240, 255';

const point = new Vector3();

/** Convex hull of 2D points (monotone chain), counter-clockwise. @param {number[][]} points */
function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

export class BootScreen {
  /**
   * @param {HTMLElement} stage the renderer's stage; the canvas goes under its HUD
   * @param {import('three').Camera} camera the game's camera, to put the tiles on the room
   */
  constructor(stage, camera) {
    this.stage = stage;
    this.camera = camera;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'boot-cover';
    this.canvas.hidden = true;
    stage.querySelector('.hud').before(this.canvas);
    this.context = this.canvas.getContext('2d');
    /** The room's tiles, with their outlines on screen; made for each boot. */
    this.tiles = null;
  }

  /**
   * Get ready for a boot into a room of `size` (after the camera framed it).
   * @param {number[]} size [x, y, z]
   */
  start(size) {
    const { clientWidth: width, clientHeight: height } = this.stage;
    const ratio = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.scale = this.canvas.height / 1080;
    this.camera.updateMatrixWorld();
    const project = (x, y, z) => {
      point.set(x, y, z).project(this.camera);
      return [((point.x + 1) / 2) * this.canvas.width, ((1 - point.y) / 2) * this.canvas.height];
    };
    this.tiles = revealTiles(size).map((tile) => {
      const floor = [project(tile.x0, 0, tile.z0), project(tile.x1, 0, tile.z0), project(tile.x1, 0, tile.z1), project(tile.x0, 0, tile.z1)];
      const top = [[tile.x0, tile.z0], [tile.x1, tile.z0], [tile.x1, tile.z1], [tile.x0, tile.z1]].map(([x, z]) => project(x, size[1], z));
      return { turn: tile.turn, floor, column: hull([...floor, ...top]) };
    });
  }

  /**
   * @param {number | null} wipe how far the room has compiled, 0..1 from
   *   bootState(), or null when no boot sequence runs
   */
  show(wipe) {
    const shown = wipe !== null && wipe < 1 && this.tiles !== null;
    this.canvas.hidden = !shown;
    if (!shown) return;
    const { context: ctx, canvas } = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = outsideCover(wipe);
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    // Covered tiles first, then the cleared ones cut through: a cleared
    // floor shows even where the column of a covered tile in front rises
    // over it on screen (at worst a block in front shows a moment early).
    const looks = this.tiles.map((tile) => tileLook(tile.turn, wipe));
    for (const covered of [true, false]) {
      ctx.globalCompositeOperation = covered ? 'source-over' : 'destination-out';
      this.tiles.forEach((tile, i) => {
        if (looks[i].covered !== covered) return;
        ctx.beginPath();
        tile.column.forEach(([x, y], j) => (j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
        ctx.fill();
      });
    }
    // The outlines of tiles just cleared flash on top.
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 2.5 * this.scale;
    ctx.shadowBlur = 14 * this.scale;
    ctx.shadowColor = `rgb(${FLASH})`;
    this.tiles.forEach((tile, i) => {
      const { flash } = looks[i];
      if (flash <= 0) return;
      ctx.strokeStyle = `rgba(${FLASH}, ${flash})`;
      ctx.beginPath();
      tile.floor.forEach(([x, y], j) => (j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }

  /** The boot is over. */
  stop() {
    this.tiles = null;
    this.canvas.hidden = true;
  }
}
