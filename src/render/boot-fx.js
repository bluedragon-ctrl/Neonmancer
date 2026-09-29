/**
 * The boot sequence after Start (D110), as plain timing (pure, tested; no
 * three.js or DOM): the title's logo scrambles away, the room compiles in
 * a scan from the top of the screen down, then the wizard pops in out of
 * a cloud of pixels (the derez played backwards) and lands with a flash
 * and a squash. Any menu key skips to the end. Times in seconds.
 */
import { HIT_FX, derezPixels } from './hit-fx.js';

export const BOOT = {
  /** The logo scrambles and glitches out. */
  logo: 0.35,
  /** The room's scan starts (overlapping the logo's exit)... */
  wipeStart: 0.2,
  /** ...and takes this long to reach the bottom. */
  wipe: 1.1,
  /** The wizard's pixels start gathering... */
  popStart: 1.2,
  /** ...and take this long to become him. */
  pop: 0.6,
  /** After he appears: the flash and the squash settle. */
  land: 0.3,
};

/** When the whole sequence is over and the game runs. */
export const BOOT_TIME = BOOT.popStart + BOOT.pop + BOOT.land;

/** 0 before `start`, 1 after `start + length`, linear in between. */
function phase(t, start, length) {
  return Math.min(1, Math.max(0, (t - start) / length));
}

/**
 * Where the boot sequence is `t` seconds after Start.
 * @param {number} t
 * @returns {{ logo: number, wipe: number, pop: number, land: number, done: boolean }}
 *   logo: how far the logo has gone (0 shown, 1 gone); wipe: how much of
 *   the room is drawn, top down; pop: how far his pixels have gathered
 *   (1: he is there); land: how far his landing has settled
 */
export function bootState(t) {
  // Exactly done at the end (the phase sums round a hair short of it).
  if (t >= BOOT_TIME) return { logo: 1, wipe: 1, pop: 1, land: 1, done: true };
  return {
    logo: phase(t, 0, BOOT.logo),
    // Eased, so the scan slows as it reaches the front of the room.
    wipe: 1 - (1 - phase(t, BOOT.wipeStart, BOOT.wipe)) ** 2,
    pop: phase(t, BOOT.popStart, BOOT.pop),
    land: phase(t, BOOT.popStart + BOOT.pop, BOOT.land),
    done: false,
  };
}

/**
 * The wizard's pixels gathering into him: the derez burst backwards, so
 * they fall in from above, growing, and meet inside his body.
 * @param {number} pop 0..1 from bootState()
 * @returns {{ offset: number[], scale: number }[]} as derezPixels(); empty once he is there
 */
export function gatherPixels(pop) {
  if (pop <= 0 || pop >= 1) return [];
  return derezPixels((1 - pop) * (HIT_FX.pixelTicks - 1));
}

/**
 * How the wizard looks while he boots in: hidden until his pixels have
 * gathered, then a white flash fading out and a squash springing back.
 * @param {{ pop: number, land: number }} state from bootState()
 * @returns {{ visible: boolean, flash: number, scale: number[] }} flash 0..1; scale [x, y, z]
 */
export function arrivalLook({ pop, land }) {
  if (pop < 1) return { visible: false, flash: 0, scale: [1, 1, 1] };
  // A squash that springs back with a small overshoot.
  const squash = 0.3 * Math.cos(land * Math.PI * 1.5) * (1 - land);
  return { visible: true, flash: 1 - land, scale: [1 + squash, 1 - squash, 1 + squash] };
}
