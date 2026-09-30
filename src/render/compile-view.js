/**
 * three.js pieces of Compile (D125; timing and shapes in compile-fx.js):
 * the bits flying from his hands into the cell, and the aim marker while
 * the spell is selected. The crate itself is an ordinary PushableView,
 * which grows in and blinks (compileLook()).
 */
import { Group } from 'three';
import { pasteCell } from '../entities/clip.js';
import { createMarquee, placeMarquee } from './clip-view.js';
import { COMPILE_FX, COMPILE_PIXELS, compilePixels } from './compile-fx.js';
import { createPixelBurst, placePixels } from './pixels.js';
import { ZAP_FX } from './zap-fx.js';

/** The spell whose aim marker this is. */
const SPELL = 'compile';

export class CompileView {
  /**
   * @param {number|string} color the spell's color
   */
  constructor(color) {
    this.aim = createMarquee(color, COMPILE_FX.aimBrightness);
    this.pixels = createPixelBurst(COMPILE_PIXELS, COMPILE_FX.pixelSize, [color, 0xffffff]);
    this.group = new Group().add(this.aim, this.pixels);
    /** Seconds, for the marching ants. */
    this.time = 0;
  }

  /**
   * Once per frame.
   * @param {import('../game.js').Game} game
   * @param {number[]} pos where the wizard is drawn (his feet center)
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} dt seconds since the last frame
   */
  sync(game, pos, alpha, dt) {
    this.time += dt;
    const { player } = game;
    const { compile } = player;
    const [dx, dz] = player.aim();
    const hands = [pos[0] + dx * ZAP_FX.reach, pos[1] + ZAP_FX.height, pos[2] + dz * ZAP_FX.reach];
    placePixels(this.pixels, compile ? compilePixels(compile.tick + alpha, hands, compile.cell) : [], [0, 0, 0]);
    this.aim.visible = false;
    if (player.spell !== SPELL || player.dead || game.transition) return;
    const cell = pasteCell(game);
    if (cell) placeMarquee(this.aim, cell.map((v) => v + 0.5), COMPILE_FX.aimMarquee, this.time);
  }
}
