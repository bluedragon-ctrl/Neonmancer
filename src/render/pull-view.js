/**
 * three.js pieces of Pull (D124; timing and shapes in pull-fx.js): the
 * beam of pixel rings flowing from what he pulls into his hands, the
 * marquee riding on it, and the aim marker while the spell is selected.
 */
import { Group } from 'three';
import { ENEMY, Enemy } from '../entities/enemy.js';
import { pullTarget } from '../entities/pull.js';
import { createMarquee, placeMarquee } from './clip-view.js';
import { createPixelBurst, placePixels } from './entity-view.js';
import { lerpPosition } from './interp.js';
import { PULL_FX, PULL_PIXELS, pullMarquee, pullPixels } from './pull-fx.js';
import { ZAP_FX } from './zap-fx.js';

/** The spell whose aim marker this is. */
const SPELL = 'pull';

/**
 * The middle of a crate or an enemy drawn `alpha` of the way between its
 * last two ticks, and the size of its marquee.
 * @param {{ prev: number[], pos: number[] }} thing a pushable or an enemy
 * @param {number} alpha
 * @param {number} crateScale the marquee round a crate, as a share of a block
 * @returns {{ center: number[], size: number }}
 */
export function pullBounds(thing, alpha, crateScale) {
  const enemy = thing instanceof Enemy;
  const height = enemy ? ENEMY.size[1] : 1;
  const [x, y, z] = lerpPosition(thing.prev, thing.pos, alpha);
  return { center: [x + 0.5, y + height / 2, z + 0.5], size: enemy ? PULL_FX.enemyMarquee : crateScale };
}

export class PullView {
  /**
   * @param {number|string} color the spell's color
   */
  constructor(color) {
    this.marquee = createMarquee(color, PULL_FX.brightness);
    this.aim = createMarquee(color, PULL_FX.aimBrightness);
    this.pixels = createPixelBurst(PULL_PIXELS, PULL_FX.pixelSize, [color]);
    this.group = new Group().add(this.marquee, this.aim, this.pixels);
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
    const { pull } = player;
    this.aim.visible = false;
    this.marquee.visible = false;
    const tick = pull ? pull.tick + alpha : 0;
    const scale = pull ? pullMarquee(tick) : null;
    if (scale === null) {
      placePixels(this.pixels, [], [0, 0, 0]);
      this.placeAim(game, alpha);
      return;
    }
    const { center, size } = pullBounds(pull.target, alpha, PULL_FX.crateMarquee);
    placeMarquee(this.marquee, center, size * scale, this.time);
    const [dx, dz] = player.aim();
    const hands = [pos[0] + dx * ZAP_FX.reach, pos[1] + ZAP_FX.height, pos[2] + dz * ZAP_FX.reach];
    placePixels(this.pixels, pullPixels(tick, center, hands), [0, 0, 0]);
  }

  /**
   * The aim marker, while Pull is selected and he could cast it: a dim
   * marquee round the first crate or enemy in line that has somewhere to
   * go; nothing without one.
   * @param {import('../game.js').Game} game
   * @param {number} alpha
   */
  placeAim(game, alpha) {
    const { player } = game;
    if (player.spell !== SPELL || player.dead || game.transition) return;
    const found = pullTarget(game, game.content.spells[SPELL].range);
    if (!found || found.distance < 2) return;
    const { center, size } = pullBounds(found.object ?? found.enemy, alpha, PULL_FX.aimMarquee);
    placeMarquee(this.aim, center, size, this.time);
  }
}
