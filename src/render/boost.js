/**
 * Boost looks (D152): temporary pickups for simple secrets, small voxel
 * figures like the integrity refill's plus (refill.js), hovering and
 * spinning the same way, in the boost's color (BOOST.colors). Each effect has
 * a silhouette of its own on a 3×3 grid: Overdrive an arrowhead, Patch a
 * square ring, Overclock a lightning step, Sparkle an X, Rainbow an arch.
 *
 * Showcase: `?asset=refills`.
 */
import { BoxGeometry, Color, Group, Mesh } from 'three';
import { BOOST } from '../entities/boost.js';
import { blockEdges } from './edges.js';
import { PALETTE, faceMaterial, lineMaterial, neonLines } from './neon.js';
import { REFILL } from './refill.js';

/** Voxel cells [x, y, z] of each figure, in the x-y plane. */
export const BOOST_VOXELS = {
  overdrive: [[0, 0, 0], [0, 2, 0], [1, 1, 0], [2, 1, 0]],
  patch: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0], [2, 1, 0], [0, 2, 0], [1, 2, 0], [2, 2, 0]],
  overclock: [[0, 2, 0], [1, 2, 0], [1, 1, 0], [2, 1, 0], [2, 0, 0]],
  sparkle: [[0, 0, 0], [2, 0, 0], [1, 1, 0], [0, 2, 0], [2, 2, 0]],
  rainbow: [[0, 0, 0], [0, 1, 0], [1, 2, 0], [2, 1, 0], [2, 0, 0]],
};

/**
 * A boost model, centered at its hover height; pose it like a refill
 * (poseDisk(refillMotion(diskMotion()))).
 * @param {'overdrive'|'patch'|'overclock'|'sparkle'|'rainbow'} effect
 */
export function createBoost(effect) {
  const color = new Color(BOOST.colors[effect]).getHex();
  const cells = BOOST_VOXELS[effect];
  const faces = faceMaterial(new Color(PALETTE.face).lerp(new Color(color), REFILL.tint));
  const lines = lineMaterial({ color, width: REFILL.width, brightness: REFILL.brightness });
  const spin = new Group();

  const shape = new Group();
  const box = new BoxGeometry(1, 1, 1);
  for (const [x, y, z] of cells) {
    const voxel = new Mesh(box, faces);
    voxel.position.set(x + 0.5, y + 0.5, z + 0.5);
    shape.add(voxel);
  }
  const outline = neonLines(blockEdges(cells), lines);
  outline.renderOrder = 2;
  shape.add(outline);
  shape.scale.setScalar(REFILL.voxel);
  shape.position.set(-1.5 * REFILL.voxel, -1.5 * REFILL.voxel, -0.5 * REFILL.voxel);
  spin.add(shape);

  spin.position.y = REFILL.hover;
  const model = new Group().add(spin);
  model.userData = { spin, color, bitColor: color };
  return model;
}
