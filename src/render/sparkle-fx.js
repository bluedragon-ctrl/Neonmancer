/**
 * The sparkle trail (D152; the cosmetic boost): while he walks, glowing
 * pixels fall off his feet, rise a little, drift and shrink away. Purely
 * visual. The motion is pure (sparkleStep(), tested); SparkleTrail owns the
 * pixel burst.
 */
import { createPixelBurst, placePixels } from './pixels.js';
import { hash } from './hash.js';
import { DEREZ } from './derez-fx.js';
import { BOOST } from '../entities/boost.js';

/** Timing in seconds, sizes in units. */
export const SPARKLE = {
  /** Pixels in the trail at most, spawned per second while he walks. */
  count: 32,
  rate: 40,
  /** Seconds a pixel lives, how fast it rises, how far it drifts sideways at most. */
  life: 0.7,
  rise: 0.5,
  drift: 0.25,
  /** Height above his feet where they fall off. */
  y: 0.1,
};

const SEED = [41.3, 17.9];

/**
 * Advance the trail `dt` seconds: age the pixels, drop the old ones, and,
 * while `spawn`, add new ones at `pos` (feet center) at SPARKLE.rate.
 * @param {{ x: number, y: number, z: number, vx: number, vz: number, age: number }[]} pixels changed in place
 * @param {number} dt
 * @param {number[]|null} pos feet center while he walks, else null
 * @param {{ carry: number, serial: number }} state spawn leftover and a running number (for variety), changed in place
 */
export function sparkleStep(pixels, dt, pos, state) {
  for (const pixel of pixels) pixel.age += dt;
  for (let i = pixels.length - 1; i >= 0; i--) if (pixels[i].age >= SPARKLE.life) pixels.splice(i, 1);
  if (!pos) {
    state.carry = 0;
    return;
  }
  state.carry += dt * SPARKLE.rate;
  while (state.carry >= 1 && pixels.length < SPARKLE.count) {
    state.carry -= 1;
    const n = state.serial++;
    pixels.push({
      x: pos[0] + (hash(n, 0, SEED) - 0.5) * 0.3,
      y: pos[1] + SPARKLE.y,
      z: pos[2] + (hash(n, 1, SEED) - 0.5) * 0.3,
      vx: (hash(n, 2, SEED) - 0.5) * 2 * SPARKLE.drift,
      vz: (hash(n, 3, SEED) - 0.5) * 2 * SPARKLE.drift,
      age: 0,
    });
  }
  state.carry = Math.min(state.carry, 1);
}

/** The pixels as offsets for placePixels(): rising, drifting and shrinking with age. */
export function sparklePixels(pixels) {
  return pixels.map(({ x, y, z, vx, vz, age }) => ({
    offset: [x + vx * age, y + SPARKLE.rise * age, z + vz * age],
    scale: 0.8 * (1 - age / SPARKLE.life),
  }));
}

export class SparkleTrail {
  constructor() {
    this.mesh = createPixelBurst(SPARKLE.count, DEREZ.pixelSize, [BOOST.colors.sparkle]);
    this.pixels = [];
    this.state = { carry: 0, serial: 0 };
  }

  /**
   * @param {number} dt seconds since the last frame
   * @param {number[]|null} pos feet center while he walks with the boost on, else null (the rest fade out)
   */
  sync(dt, pos) {
    sparkleStep(this.pixels, dt, pos, this.state);
    placePixels(this.mesh, sparklePixels(this.pixels), [0, 0, 0]);
  }
}
