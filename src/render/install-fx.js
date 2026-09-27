/**
 * How installing a spell looks on the wizard (D73; pure, tested; no
 * three.js): after he takes a data disk, the disk shrinks where it hung and
 * its bits spiral into him; then three rings in the spell's color sweep up
 * his body from his feet to his hat, tinting his hologram, and he flashes
 * white at the end.
 *
 * Everything is relative to his feet center; `tick` counts ticks since the
 * disk was taken, and the animation lasts INSTALL_FX.ticks (while he stands
 * still, PLAYER.installTicks).
 */
import { PLAYER } from '../entities/player.js';
import { hash } from './hash.js';

/** Timing in ticks, sizes in units. */
export const INSTALL_FX = {
  /** Length of the whole animation. */
  ticks: PLAYER.installTicks,
  /** The disk shrinks away in this many ticks. */
  shrinkTicks: 6,
  /** Bits spiral in from `bitsAt` for `bitsTicks`, to his middle (`core` above his feet). */
  bitsAt: 4,
  bitsTicks: 22,
  core: 0.75,
  /** Pixels in the spiral. */
  pixels: 28,
  pixelSize: 0.055,
  /** Rings: the first starts at `ringsAt`, the next ones `ringGap` apart, each rising for `ringTicks` to `ringTop`. */
  rings: 3,
  ringsAt: 22,
  ringGap: 6,
  ringTicks: 22,
  ringTop: 1.95,
  /** Ring radius at his feet and at the top of the hat. */
  ringWide: 0.45,
  ringNarrow: 0.2,
  /** Tint of his hologram towards the spell's color, at its strongest. */
  tint: 0.6,
  /** White flash on him at the end: its first tick and length. */
  flashAt: 50,
  flashTicks: 10,
};

/** Where the disk hangs when the showcase has no real one: in front of him at hand height. */
export const INSTALL_FROM = [0, 0.55, 0.45];

const SEED = [73.1, 157.3];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => x * x * (3 - 2 * x);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/**
 * The install animation `tick` ticks after taking the disk.
 * @param {number} tick may be fractional
 * @param {number[]} [from] where the disk was, relative to his feet
 * @returns {{
 *   disk: { visible: boolean, pos: number[], scale: number },
 *   pixels: { offset: number[], scale: number }[],
 *   rings: { y: number, radius: number, glow: number }[],
 *   tint: number, flash: number, done: boolean,
 * }} disk: the disk shrinking; pixels in the spell's color; rings: height,
 *   radius and glow 0..1; tint: the wizard towards the spell's color 0..1;
 *   flash: the wizard towards white 0..1
 */
export function installLook(tick, from = INSTALL_FROM) {
  const fx = INSTALL_FX;
  const look = { disk: { visible: false, pos: from, scale: 0 }, pixels: [], rings: [], tint: 0, flash: 0, done: tick >= fx.ticks };
  if (tick < 0 || look.done) return look;

  if (tick < fx.shrinkTicks) look.disk = { visible: true, pos: from, scale: 1 - tick / fx.shrinkTicks };

  const b = (tick - fx.bitsAt) / fx.bitsTicks;
  if (b >= 0 && b < 1) {
    for (let i = 0; i < fx.pixels; i++) {
      const delay = hash(i, 0, SEED) * 0.3;
      const k = ease(clamp01((b - delay) / (1 - delay)));
      const angle = hash(i, 1, SEED) * Math.PI * 2 + k * Math.PI * 2.5;
      const r = (0.25 + hash(i, 2, SEED) * 0.45) * (1 - k);
      const center = mix(from, [0, fx.core, 0], k);
      look.pixels.push({
        offset: [center[0] + Math.cos(angle) * r, center[1] + (hash(i, 3, SEED) - 0.5) * 0.4 * (1 - k), center[2] + Math.sin(angle) * r],
        scale: 1 - k * 0.6,
      });
    }
  }

  for (let n = 0; n < fx.rings; n++) {
    const t = (tick - fx.ringsAt - n * fx.ringGap) / fx.ringTicks;
    if (t < 0 || t >= 1) continue;
    const y = ease(t) * fx.ringTop;
    // Wide round his body, narrowing up the hat.
    const radius = fx.ringWide - (fx.ringWide - fx.ringNarrow) * clamp01((y - 1.1) / 0.8) + 0.05 * Math.sin(t * Math.PI);
    look.rings.push({ y, radius, glow: t < 0.85 ? 1 : (1 - t) / 0.15 });
  }

  const tintEnd = fx.ticks - 4;
  if (tick >= fx.ringsAt) look.tint = fx.tint * Math.sin(clamp01((tick - fx.ringsAt) / (tintEnd - fx.ringsAt)) * Math.PI);
  const f = (tick - fx.flashAt) / fx.flashTicks;
  if (f >= 0 && f < 1) look.flash = f < 0.3 ? 1 : 1 - (f - 0.3) / 0.7;
  return look;
}
