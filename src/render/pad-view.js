/**
 * A jump pad (D221): a thin glass tile in the wizard's magenta (his own,
 * D98), flush with what it lies on, with a square inside and four short
 * posts at its corners; a square of light keeps rising off it and fading,
 * so it reads as "up from here" at a glance. Jumping off it flashes it.
 * Reviewed in the asset showcase (`?asset=pad`).
 */
import { Color, Group } from 'three';
import { glassBox } from './glass.js';
import { lineMaterial, neonLines } from './neon.js';

/** Tuning (units, seconds). */
export const PAD_FX = {
  /** The tile's thickness. */
  tile: 0.04,
  /** Margin of the inner square from the tile's edge. */
  inset: 0.24,
  /** Height of the posts at the inner square's corners. */
  post: 0.22,
  /** The rising square: how high it goes and how long one rise takes. */
  rise: 0.7,
  period: 1.1,
  /** Line brightness of the tile and of the rising square at its start. */
  glow: 1.3,
  ring: 1.8,
  /** Seconds a jump's flash lasts, and how much brighter it makes the pad. */
  flash: 0.35,
  flashGlow: 1.6,
};

/** The pad's glass: its color clearer and less milky than a switch's. */
const PAD_GLASS = { alpha: 0.5, tint: 0.35, milk: 0.15 };

/** A square at height `y`, `inset` from the unit tile's edges, as four segments. */
function square(inset, y) {
  const a = inset;
  const b = 1 - inset;
  const corners = [
    [a, y, a],
    [b, y, a],
    [b, y, b],
    [a, y, b],
  ];
  return corners.map((corner, i) => [corner, corners[(i + 1) % 4]]);
}

/**
 * A pad's look, at the origin (the lower corner of its cell).
 * @param {number|string|Color} color
 * @returns {Group} with `userData.update(dt)` and `userData.launch()` (a jump off it)
 */
export function createPad(color) {
  const base = new Color(color);
  const group = new Group();
  group.add(glassBox([0, 0, 0], [1, PAD_FX.tile, 1], base, PAD_GLASS));
  const y = PAD_FX.tile + 0.003;
  const tileMat = lineMaterial({ color: base, width: 2.2, brightness: PAD_FX.glow });
  const posts = square(PAD_FX.inset, y).map(([corner]) => [corner, [corner[0], y + PAD_FX.post, corner[2]]]);
  const lines = neonLines([...square(0.03, y), ...square(PAD_FX.inset, y), ...posts], tileMat);
  lines.renderOrder = 2;
  group.add(lines);
  const ringMat = lineMaterial({ color: base, width: 2, brightness: PAD_FX.ring });
  const ring = neonLines(square(PAD_FX.inset, 0), ringMat);
  ring.renderOrder = 2;
  group.add(ring);

  let time = 0;
  let flash = 0;
  group.userData.launch = () => {
    flash = PAD_FX.flash;
  };
  group.userData.update = (dt) => {
    time += dt;
    flash = Math.max(0, flash - dt);
    const boost = 1 + (PAD_FX.flashGlow - 1) * (flash / PAD_FX.flash);
    const phase = (time / PAD_FX.period) % 1;
    ring.position.y = y + phase * PAD_FX.rise;
    ringMat.color.copy(base).multiplyScalar(PAD_FX.ring * (1 - phase) * boost);
    tileMat.color.copy(base).multiplyScalar(PAD_FX.glow * boost);
  };
  group.userData.update(0);
  return group;
}

/** A jump pad in the room. */
export class PadView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/pad.js').Pad} pad
   */
  constructor(game, pad) {
    this.pad = pad;
    this.group = createPad(pad.object.color);
    this.group.position.set(...pad.pos);
    this.jumps = pad.jumps;
  }

  /**
   * @param {number} alpha unused: it never moves
   * @param {number} [dt] seconds since the last frame
   */
  sync(alpha, dt = 0) {
    if (this.pad.jumps !== this.jumps) this.group.userData.launch();
    this.jumps = this.pad.jumps;
    this.group.userData.update(dt);
  }
}
