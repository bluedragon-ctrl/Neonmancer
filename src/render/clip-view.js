/**
 * three.js pieces of Cut & Paste (D87; timing and shapes in clip-fx.js):
 * the marquee that snaps onto what he cuts or pastes, the pixels
 * streaming between it and his hands, and the aim marker while the spell
 * is selected: a dim marquee round what a cut would take, a dashed ghost
 * of what he holds where a paste would put it.
 */
import { Color, Group } from 'three';
import { ENEMY, Enemy } from '../entities/enemy.js';
import { cutTarget, pasteCell } from '../entities/clip.js';
import { CLIP_FX, clipPixels, marqueeLook } from './clip-fx.js';
import { blockEdges } from './edges.js';
import { createPixelBurst, placePixels } from './entity-view.js';
import { lineMaterial, neonLines } from './neon.js';
import { ZAP_FX } from './zap-fx.js';

/** The spell whose aim marker this is. */
const SPELL = 'cut_paste';

/** A unit cube's edges, centered on the origin. */
const CUBE = blockEdges([[0, 0, 0]]).map((segment) => segment.map((point) => point.map((v) => v - 0.5)));

/**
 * A dashed cube outline centered on its origin, hidden.
 * @param {number|string} color
 * @param {number} brightness
 */
export function createMarquee(color, brightness) {
  const lines = neonLines(CUBE, lineMaterial({ color, width: 2.2, brightness, dashed: true }));
  lines.visible = false;
  return lines;
}

/**
 * Show a marquee round the middle `center`, `size` wide, its dashes
 * marching (`time` in seconds).
 * @param {import('three').Object3D} marquee from createMarquee()
 */
export function placeMarquee(marquee, center, size, time) {
  marquee.visible = true;
  marquee.position.set(...center);
  marquee.scale.setScalar(size);
  marquee.material.dashOffset = -time * CLIP_FX.march;
}

/**
 * The middle and size of a crate or an enemy, for its marquee and pixels.
 * @param {{ box(): number[][], data?: object }} thing a pushable or an enemy
 * @param {boolean} enemy
 * @returns {{ center: number[], size: number }}
 */
export function clipBounds(thing, enemy) {
  const box = thing.box();
  const center = box.map(([min, max]) => (min + max) / 2);
  return { center, size: enemy ? ENEMY.size[0] : 1 };
}

export class ClipView {
  /**
   * @param {number|string} color the spell's color
   */
  constructor(color) {
    this.color = new Color(color);
    this.marquee = createMarquee(color, CLIP_FX.brightness);
    this.aim = createMarquee(color, CLIP_FX.aimBrightness);
    /** Ghosts of what he holds, by color, made on first use. */
    this.ghosts = new Map();
    this.pixels = createPixelBurst(CLIP_FX.pixels, CLIP_FX.pixelSize, [color]);
    /** The target the pixels are colored for. */
    this.colored = null;
    this.group = new Group().add(this.marquee, this.aim, this.pixels);
    /** Seconds, for the marching ants. */
    this.time = 0;
  }

  /** The ghost in `color`, made on first use. */
  ghost(color) {
    let ghost = this.ghosts.get(color);
    if (!ghost) {
      ghost = createMarquee(color, CLIP_FX.ghostBrightness);
      this.ghosts.set(color, ghost);
      this.group.add(ghost);
    }
    return ghost;
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
    const { clip } = player;
    for (const ghost of this.ghosts.values()) ghost.visible = false;
    this.aim.visible = false;
    this.marquee.visible = false;

    if (clip) {
      const tick = clip.tick + alpha;
      const enemy = clip.target instanceof Enemy;
      const { center, size } = clipBounds(clip.target, enemy);
      const look = marqueeLook(clip.mode, tick);
      const frame = size * (enemy ? CLIP_FX.enemyMarquee / ENEMY.size[0] : CLIP_FX.crateMarquee);
      if (look.visible) placeMarquee(this.marquee, center, frame * look.scale, this.time);
      this.colorPixels(clip.target);
      const [dx, dz] = player.aim();
      const hands = [pos[0] + dx * ZAP_FX.reach, pos[1] + ZAP_FX.height, pos[2] + dz * ZAP_FX.reach];
      placePixels(this.pixels, clipPixels(clip.mode, tick, center, size, hands), [0, 0, 0]);
      return;
    }
    placePixels(this.pixels, [], [0, 0, 0]);
    this.placeAim(game);
  }

  /**
   * The aim marker, while Cut & Paste is selected and he could cast it: a
   * dim marquee round what a cut would take, or a ghost of what he holds
   * where a paste would put it; nothing without a target.
   * @param {import('../game.js').Game} game
   */
  placeAim(game) {
    const { player } = game;
    if (player.spell !== SPELL || player.dead || game.transition) return;
    const held = player.clipboard;
    if (!held) {
      const target = cutTarget(game);
      if (!target) return;
      const enemy = Boolean(target.enemy);
      const { center, size } = clipBounds(target.object ?? target.enemy, enemy);
      const frame = enemy ? CLIP_FX.enemyMarquee : CLIP_FX.aimMarquee * size;
      placeMarquee(this.aim, center, frame, this.time);
      return;
    }
    const cell = pasteCell(game);
    if (!cell) return;
    const enemy = held.kind === 'enemy';
    const size = enemy ? ENEMY.size[0] : 1;
    const center = [cell[0] + 0.5, cell[1] + size / 2, cell[2] + 0.5];
    placeMarquee(this.ghost(held.data.color), center, size, this.time);
  }

  /** Color the pixels for `target`: half in its color, half in the spell's. */
  colorPixels(target) {
    if (this.colored === target) return;
    this.colored = target;
    const own = new Color(target.object?.color ?? target.data.color).multiplyScalar(1.6);
    const spell = this.color.clone().multiplyScalar(1.6);
    for (let i = 0; i < CLIP_FX.pixels; i++) this.pixels.setColorAt(i, i % 2 ? spell : own);
    this.pixels.instanceColor.needsUpdate = true;
  }
}
