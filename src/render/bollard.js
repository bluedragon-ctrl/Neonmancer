/**
 * Bollard: a thin post a quarter of a block wide and half a block high in
 * the middle of its cell, a hologram of frosted glass with edges in the
 * room's (biome's) color and a faint ring round its foot. Its top is a
 * lamp that blinks; bollards side by side blink a little out of step (by
 * their cell), so a row reads as a chaser. A static block look (D276,
 * room-view.js): crates and enemies stop at it, the wizard walks through
 * it. As he (or his decoy) comes into its cell it fades to a faint
 * outline, its lamp dark, so he never shows cut by it; it comes back once
 * he is past. Showcase `?asset=bollards`.
 *
 * Nothing on it faces a way, so the camera's fixed angle (D115) needs no
 * turning.
 */
import { Color, Group } from 'three';
import { boxEdges, lightBoxes, placeLight } from './deco.js';
import { GLASS, glassBox } from './glass.js';
import { lineMaterial, neonLines } from './neon.js';

/** Tuning (units, seconds). */
export const BOLLARD_FX = {
  /** The post: lower and upper corners in its cell. */
  post: [[0.375, 0, 0.375], [0.625, 0.5, 0.625]],
  /** The ring round its foot: how far out from the post, and its brightness. */
  ring: 0.07,
  ringEdge: 0.5,
  /** Line brightness of the post's edges. */
  edge: 1.3,
  /** The lamp on top: center and size. */
  lamp: [[0.5, 0.525, 0.5], [0.19, 0.05, 0.19]],
  /** Blinks per second, and the lamp's brightness when dimmest (0..1). */
  blink: 0.8,
  low: 0.12,
  /** Seconds of delay per cell along x + z, so a row chases. */
  phase: 0.18,
  /**
   * Fading as he passes: fully there beyond `far` (units from the post's
   * axis to his), down to `faint` within `near`; how fast it follows (per second).
   */
  far: 0.9,
  near: 0.45,
  faint: 0.12,
  fadeRate: 10,
};

/**
 * The lamp's brightness at `time` (0..1, pure): a smooth pulse, delayed
 * by the cell.
 * @param {number} time seconds
 * @param {number[]} [cell] its cell [x, y, z]
 */
export function bollardLamp(time, [x, , z] = [0, 0, 0]) {
  const t = time * BOLLARD_FX.blink - (x + z) * BOLLARD_FX.phase * BOLLARD_FX.blink;
  const wave = 0.5 + 0.5 * Math.cos(t * 2 * Math.PI);
  return BOLLARD_FX.low + (1 - BOLLARD_FX.low) * wave ** 2;
}

/**
 * How much of the bollard in `cell` shows (faint..1, pure) with bodies
 * passing through at `points` (feet centers [x, y, z]): the nearest one
 * level with it counts.
 * @param {number[]} cell
 * @param {number[][]} points
 */
export function bollardPresence([cx, cy, cz], points) {
  const { far, near, faint } = BOLLARD_FX;
  let d = Infinity;
  for (const [x, y, z] of points) {
    if (y < cy - 1.4 || y > cy + 0.6) continue;
    d = Math.min(d, Math.hypot(x - cx - 0.5, z - cz - 0.5));
  }
  const t = Math.min(1, Math.max(0, (d - near) / (far - near)));
  return faint + (1 - faint) * t * t * (3 - 2 * t);
}

/**
 * A bollard, its cell's lower corner at the origin.
 * `userData.update(dt, points)` blinks its lamp and fades it while a body
 * that passes it (feet centers, room coordinates) is in its cell.
 * @param {object} [options]
 * @param {number|string} [options.color] the room's (biome's) color
 * @param {number[]} [options.cell] its cell, which times the blink and the fade
 */
export function createBollard({ color = '#ffb020', cell = [0, 0, 0] } = {}) {
  const { post, ring: r } = BOLLARD_FX;
  const group = new Group();
  const glass = glassBox(...post, color, GLASS.bollard);
  const edges = lineMaterial({ color, width: 2, brightness: BOLLARD_FX.edge });
  group.add(glass, neonLines(boxEdges(...post), edges));
  const [[x0, , z0], [x1, , z1]] = post;
  const [a, b, c, d, y] = [x0 - r, x1 + r, z0 - r, z1 + r, 0.004];
  const foot = [[[a, y, c], [b, y, c]], [[b, y, c], [b, y, d]], [[b, y, d], [a, y, d]], [[a, y, d], [a, y, c]]];
  const ringLines = lineMaterial({ color, width: 1.5, brightness: BOLLARD_FX.ringEdge });
  group.add(neonLines(foot, ringLines));

  const lamp = lightBoxes(1, new Color(color).lerp(new Color(0xffffff), 0.4).multiplyScalar(1.8));
  placeLight(lamp, 0, ...BOLLARD_FX.lamp);
  lamp.instanceMatrix.needsUpdate = true;
  group.add(lamp);

  // What fades: the lines' colors and the glass, from their full values.
  const lines = [edges, ringLines].map((material) => ({ material, full: material.color.clone() }));
  const { uAlpha, uTint, uRim } = glass.material.uniforms;
  const full = [uAlpha.value, uTint.value, uRim.value];
  let time = 0;
  let shown = 1;
  group.userData.update = (dt, points = []) => {
    time += dt;
    const target = bollardPresence(cell, points);
    shown += (target - shown) * Math.min(1, dt * BOLLARD_FX.fadeRate);
    for (const { material, full: base } of lines) material.color.copy(base).multiplyScalar(shown);
    [uAlpha.value, uTint.value, uRim.value] = full.map((v) => v * shown);
    // The lamp goes dark faster than the rest: it is the first thing he would cut.
    lamp.material.opacity = bollardLamp(time, cell) * shown ** 2;
  };
  group.userData.update(0);
  return group;
}
