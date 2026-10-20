/**
 * Bollard: a thin post a quarter of a block wide and half a block high in
 * the middle of its cell, a dark core with edges in the room's (biome's)
 * color and a faint ring round its foot. Its top is a lamp that blinks;
 * bollards side by side blink a little out of step (by their cell), so a
 * row reads as a chaser. Crates stop at it, the wizard walks through it.
 * Showcase `?asset=bollards`.
 *
 * Nothing on it faces a way, so the camera's fixed angle (D115) needs no
 * turning.
 */
import { Color, Group } from 'three';
import { boxEdges, boxFaces, lightBoxes, placeLight } from './deco.js';
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
 * A bollard, its cell's lower corner at the origin.
 * `userData.update(dt)` blinks its lamp.
 * @param {object} [options]
 * @param {number|string} [options.color] the room's (biome's) color
 * @param {number[]} [options.cell] its cell, which times the blink
 */
export function createBollard({ color = '#ffb020', cell = [0, 0, 0] } = {}) {
  const { post, ring: r } = BOLLARD_FX;
  const group = new Group();
  group.add(boxFaces([post]));
  group.add(neonLines(boxEdges(...post), lineMaterial({ color, width: 2, brightness: BOLLARD_FX.edge })));
  const [[x0, , z0], [x1, , z1]] = post;
  const [a, b, c, d, y] = [x0 - r, x1 + r, z0 - r, z1 + r, 0.004];
  const foot = [[[a, y, c], [b, y, c]], [[b, y, c], [b, y, d]], [[b, y, d], [a, y, d]], [[a, y, d], [a, y, c]]];
  group.add(neonLines(foot, lineMaterial({ color, width: 1.5, brightness: BOLLARD_FX.ringEdge })));

  const lamp = lightBoxes(1, new Color(color).lerp(new Color(0xffffff), 0.4).multiplyScalar(1.8));
  placeLight(lamp, 0, ...BOLLARD_FX.lamp);
  lamp.instanceMatrix.needsUpdate = true;
  group.add(lamp);

  let time = 0;
  group.userData.update = (dt) => {
    time += dt;
    lamp.material.opacity = bollardLamp(time, cell);
  };
  group.userData.update(0);
  return group;
}
