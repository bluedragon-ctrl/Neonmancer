/**
 * three.js pieces of the Fork spell (D129): its bits streaming from the
 * wizard's hands into the cell, and its aim marker while the spell is
 * selected. The decoy itself is in decoy-view.js.
 */
import { Group } from 'three';
import { pasteCell } from '../entities/clip.js';
import { PLAYER } from '../entities/player.js';
import { createMarquee, placeMarquee } from './clip-view.js';
import { BLOCK_BODY } from './derez-fx.js';
import { createStream, placeStream } from './pixels.js';
import { streamCount } from './stream-fx.js';
import { ZAP_FX } from './zap-fx.js';

/** The spell whose aim marker this is. */
const SPELL = 'fork';

/** Aim marker: the marquee's size round the cell and its brightness. */
const AIM = { marquee: 1.06, brightness: 0.8 };

/** Fork's bits from his hands and its aim marker, on the wizard's view. */
export class ForkView {
  /**
   * @param {number|string} color the spell's color
   */
  constructor(color) {
    this.aim = createMarquee(color, AIM.brightness);
    this.pixels = createStream(streamCount({ at: [0, 0, 0] }, { at: [0, 0, 0], body: BLOCK_BODY }), [color, 0xffffff]);
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
    const { fork } = player;
    const [dx, dz] = player.aim();
    const hands = { at: [pos[0] + dx * ZAP_FX.reach, pos[1] + ZAP_FX.height, pos[2] + dz * ZAP_FX.reach] };
    const into = fork && { at: [fork.cell[0] + 0.5, fork.cell[1], fork.cell[2] + 0.5], body: BLOCK_BODY };
    placeStream(this.pixels, fork ? fork.tick + alpha : null, PLAYER.forkTicks, hands, into);
    this.aim.visible = false;
    if (player.spell !== SPELL || player.dead || game.transition) return;
    const cell = pasteCell(game);
    if (cell) placeMarquee(this.aim, cell.map((v) => v + 0.5), AIM.marquee, this.time);
  }
}
