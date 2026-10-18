/**
 * three.js pieces of Swap (D260): the pixels of what he swapped streaming
 * from where it stood into the cell he stood in (the shared stream, D127;
 * his own stream is his afterimage, Warp's, render/warp-view.js), and the
 * aim marker while the spell is selected: a dim marquee round what a swap
 * would take, as Pull's.
 */
import { Group } from 'three';
import { ENEMY, Enemy } from '../entities/enemy.js';
import { PLAYER } from '../entities/player.js';
import { swapTarget } from '../entities/swap.js';
import { createMarquee, placeMarquee } from './clip-view.js';
import { BLOCK_BODY } from './derez-fx.js';
import { createStream, placeStream } from './pixels.js';
import { streamCount } from './stream-fx.js';
import { PULL_FX } from './pull-fx.js';
import { pullBounds } from './pull-view.js';

/** The spell whose effect this is. */
const SPELL = 'swap';

/** A stream end: the body of a crate or an enemy standing in `cell` (its lower corner). */
function bodyIn(cell, enemy) {
  const at = [cell[0] + 0.5, cell[1], cell[2] + 0.5];
  return { at, body: enemy ? { size: [ENEMY.size[0], ENEMY.size[1], ENEMY.size[2]] } : BLOCK_BODY };
}

export class SwapView {
  /**
   * @param {number|string} color the spell's color
   */
  constructor(color) {
    this.aim = createMarquee(color, PULL_FX.aimBrightness);
    // As many pixels as a crate's stream (an enemy's has fewer).
    const crate = { at: [0, 0, 0], body: BLOCK_BODY };
    this.pixels = createStream(streamCount(crate, crate), [color, 0xffffff]);
    this.group = new Group().add(this.aim, this.pixels);
    /** Seconds, for the marching ants. */
    this.time = 0;
  }

  /**
   * Once per frame.
   * @param {import('../game.js').Game} game
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} dt seconds since the last frame
   */
  sync(game, alpha, dt) {
    this.time += dt;
    const { player } = game;
    const { swap } = player;
    this.aim.visible = false;
    if (swap) {
      const enemy = swap.target instanceof Enemy;
      placeStream(this.pixels, swap.tick + alpha, PLAYER.warpTicks, bodyIn(swap.from, enemy), bodyIn(swap.to, enemy));
      return;
    }
    placeStream(this.pixels, null);
    if (player.spell !== SPELL || player.dead || game.transition) return;
    const found = swapTarget(game, game.content.spells[SPELL].range);
    if (!found) return;
    const { center, size } = pullBounds(found.object ?? found.enemy, alpha, PULL_FX.aimMarquee);
    placeMarquee(this.aim, center, size, this.time);
  }
}
