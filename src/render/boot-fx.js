/**
 * The boot sequence after Start (D110), as plain timing (pure, tested; no
 * three.js or DOM): the title's logo scrambles away, the room compiles
 * tile by tile along its own grid from the back corner forward (big
 * tiles of the floor, each a column up to the ceiling, their outlines
 * flashing as they clear), then the wizard pops in out of
 * a cloud of pixels (the derez played backwards) and lands with a flash
 * and a squash. Any menu key skips to the end. Times in seconds.
 */
import { hash } from './hash.js';
import { DEREZ, derezPixels } from './derez-fx.js';
import { HIT_FX } from './hit-fx.js';

export const BOOT = {
  /** The logo scrambles and glitches out. */
  logo: 0.35,
  /** The room's tiles start clearing (overlapping the logo's exit)... */
  wipeStart: 0.2,
  /** ...and take this long, the last part fading in the world round the room. */
  wipe: 1.6,
  /** The wizard's pixels start gathering... */
  popStart: 1.7,
  /** ...and take this long to become him. */
  pop: 0.6,
  /** After he appears: the flash and the squash settle. */
  land: 0.3,
  /** Edge of one reveal tile, in floor cells. */
  tile: 2,
  /** Share of the wipe by which every tile has cleared; the rest fades in the world outside. */
  tilesDone: 0.85,
  /** Share of the wipe a tile's outline flashes after it cleared. */
  flash: 0.1,
  /** How much a tile's turn wanders from the back-to-front wave (share of tilesDone). */
  jitter: 0.12,
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
    wipe: phase(t, BOOT.wipeStart, BOOT.wipe),
    pop: phase(t, BOOT.popStart, BOOT.pop),
    land: phase(t, BOOT.popStart + BOOT.pop, BOOT.land),
    done: false,
  };
}

/**
 * The room's reveal tiles: its floor cut into squares of BOOT.tile cells,
 * each with its turn to clear, 0..1 of BOOT.tilesDone: a wave from the back
 * corner (x = 0, z = 0) to the front, a little shuffled so it builds block
 * by block. The outer tiles reach half a cell past the room, over its back
 * walls' doorways and its front edge.
 * @param {number[]} size room size [x, y, z]
 * @returns {{ x0: number, z0: number, x1: number, z1: number, turn: number }[]} back to front
 */
export function revealTiles([sx, , sz]) {
  const nx = Math.ceil(sx / BOOT.tile);
  const nz = Math.ceil(sz / BOOT.tile);
  const last = nx + nz - 2 || 1;
  const tiles = [];
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const wave = (i + k) / last;
      const turn = Math.min(1, Math.max(0, wave * (1 - BOOT.jitter) + hash(i, k) * BOOT.jitter));
      tiles.push({
        x0: i === 0 ? -0.5 : i * BOOT.tile,
        z0: k === 0 ? -0.5 : k * BOOT.tile,
        x1: i === nx - 1 ? sx + 0.5 : (i + 1) * BOOT.tile,
        z1: k === nz - 1 ? sz + 0.5 : (k + 1) * BOOT.tile,
        turn,
      });
    }
  }
  return tiles.sort((a, b) => a.x0 + a.z0 - (b.x0 + b.z0));
}

/**
 * A reveal tile at `wipe`: still covered, or cleared with its outline
 * flashing (1 as it clears, fading to 0).
 * @param {number} turn from revealTiles()
 * @param {number} wipe from bootState()
 * @returns {{ covered: boolean, flash: number }}
 */
export function tileLook(turn, wipe) {
  const at = turn * BOOT.tilesDone;
  if (wipe < at) return { covered: true, flash: 0 };
  return { covered: false, flash: Math.max(0, 1 - (wipe - at) / BOOT.flash) };
}

/**
 * How dark the world round the room still is (1 black, 0 shown): it fades
 * in once every tile has cleared.
 * @param {number} wipe from bootState()
 */
export function outsideCover(wipe) {
  return 1 - phase(wipe, BOOT.tilesDone, 1 - BOOT.tilesDone);
}

/**
 * The wizard's pixels gathering into him: the derez burst backwards, so
 * they fall in from above, growing, and meet inside his body.
 * @param {number} pop 0..1 from bootState()
 * @returns {{ offset: number[], scale: number }[]} as derezPixels(); empty once he is there
 */
export function gatherPixels(pop) {
  if (pop <= 0 || pop >= 1) return [];
  return derezPixels((1 - pop) * (DEREZ.ticks - 1), HIT_FX.body);
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
