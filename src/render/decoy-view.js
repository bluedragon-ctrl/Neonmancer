/**
 * The decoy of Fork (D129): a hologram of the wizard in the spell's color
 * (the spell's own pieces are in fork-view.js). It grows in with a flash
 * and blinks before it derezzes as a compiled crate does (compileLook()),
 * and derezzes into pixels like anything else (derez-fx.js).
 */
import { Color, Group } from 'three';
import { DECOY } from '../entities/decoy.js';
import { compileLook } from './compile-fx.js';
import { createDropShadow, placeShadow, showHitFlash } from './entity-view.js';
import { HIT_FX } from './hit-fx.js';
import { lerpPosition } from './interp.js';
import { createDerez, placeDerez } from './pixels.js';
import { createWizard } from './wizard.js';
import { WizardMotion } from './wizard-motion.js';

/** Ticks the decoy's hologram flashes white while it grows in (fading), and how hard. */
const GROW_FLASH = { ticks: 14, amount: 0.8 };

/**
 * A decoy's model: a wizard hologram in the spell's `color` (white head),
 * its shadow and the pixels of its derez.
 * @param {number|string} color
 */
export function createDecoyModel(color) {
  const tint = new Color(color);
  const wizard = createWizard({ body: tint, head: 0xffffff, hat: tint, bands: 0 });
  const shadow = createDropShadow(tint);
  const pixels = createDerez(HIT_FX.body, [tint, 0xffffff]);
  const group = new Group().add(wizard, shadow, pixels);
  return { group, wizard, shadow, pixels, motion: new WizardMotion(wizard), time: 0 };
}

/**
 * Place a decoy model for this frame.
 * @param {ReturnType<typeof createDecoyModel>} model
 * @param {object} state
 * @param {number[]} state.pos feet center
 * @param {number} state.facing angle he looks at (as rotation.y)
 * @param {number} state.age ticks since it was cast (may be fractional)
 * @param {number} state.ticksLeft ticks before it derezzes
 * @param {number|null} state.gone ticks since it derezzed, or null while it stands
 * @param {number|null} state.ground surface under it for the shadow, or null
 * @param {number} state.width its footprint
 * @param {number} state.dt seconds since the last frame
 */
export function placeDecoyModel(model, { pos, facing, age, ticksLeft, gone, ground, width, dt }) {
  const { wizard, shadow, pixels, motion } = model;
  model.time += dt;
  wizard.position.set(pos[0], pos[1], pos[2]);
  wizard.rotation.y = facing;
  motion.update({ dt, time: model.time, pos, facing, grounded: true, moving: false, vy: 0 });
  const look = gone === null ? compileLook(age, ticksLeft) : { visible: false, scale: 1 };
  wizard.visible = look.visible;
  wizard.scale.setScalar(look.scale);
  showHitFlash(wizard, { amount: GROW_FLASH.amount * Math.max(0, 1 - age / GROW_FLASH.ticks), color: 'white' });
  placeShadow(shadow, pos[0], pos[2], pos[1], gone === null ? ground : null, width * 1.5);
  shadow.visible &&= look.visible;
  placeDerez(pixels, gone === null ? null : Math.min(gone, DECOY.derezTicks), pos);
}

/** The decoy standing in the room now, shown from `Game.decoy` (made and freed as it comes and goes). */
export class DecoyView {
  /**
   * @param {import('../game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.group = new Group();
    /** The decoy drawn now, and its model. */
    this.decoy = null;
    this.model = null;
  }

  /** Drop the model. */
  clear() {
    if (!this.model) return;
    this.group.remove(this.model.group);
    this.model.group.traverse((node) => {
      node.geometry?.dispose?.();
      node.material?.dispose?.();
    });
    this.decoy = null;
    this.model = null;
  }

  /**
   * Once per frame.
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} dt seconds since the last frame
   */
  sync(alpha, dt) {
    const { decoy } = this.game;
    if (decoy !== this.decoy) {
      this.clear();
      if (decoy) {
        this.model = createDecoyModel(this.game.content.spells.fork.color);
        this.group.add(this.model.group);
        this.decoy = decoy;
      }
    }
    if (!decoy) return;
    const pos = lerpPosition(decoy.prev, decoy.pos, alpha);
    placeDecoyModel(this.model, {
      pos,
      facing: decoy.facing,
      age: decoy.age + alpha,
      ticksLeft: decoy.ticksLeft - alpha,
      gone: decoy.gone === null ? null : decoy.gone + alpha,
      ground: this.game.shadowHeight(pos, decoy.size),
      width: decoy.size[0],
      dt,
    });
  }
}
