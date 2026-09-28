/**
 * three.js pieces of a frozen enemy (Pause, D85; timing in pause-fx.js):
 * corner brackets of a box round it in the spell's color, like a
 * selection, picked in the showcase over a pause sign and a draining clock.
 */
import { Group } from 'three';
import { lineMaterial, neonLines } from './neon.js';

/** Sizes in units: half the cage's edge round the middle of a 0.6 enemy, a bracket's length. */
export const PAUSE_VIEW = { half: 0.42, arm: 0.14, lift: 0.02 };

/**
 * The cage round a frozen enemy (placePauseCage()), hidden; its origin is
 * at the enemy's feet, so it grows up from the floor as the freeze sets in.
 * @param {number|string} color the spell's color
 */
export function createPauseCage(color) {
  const { half: h, arm, lift } = PAUSE_VIEW;
  const segments = [];
  for (const x of [-h, h]) {
    for (const y of [-h, h]) {
      for (const z of [-h, h]) {
        const corner = [x, y, z];
        for (let axis = 0; axis < 3; axis++) {
          const end = [...corner];
          end[axis] -= Math.sign(corner[axis]) * arm;
          segments.push([corner, end]);
        }
      }
    }
  }
  const lines = neonLines(segments, lineMaterial({ color, width: 2.2, brightness: 1.8 }));
  lines.position.y = h + lift;
  const view = new Group().add(lines);
  view.visible = false;
  return view;
}

/**
 * Show the cage round an enemy with its feet at `feet`, from pauseLook().
 * @param {Group} view from createPauseCage()
 * @param {number[]} feet
 * @param {ReturnType<typeof import('./pause-fx.js').pauseLook>} look
 */
export function placePauseCage(view, feet, { frozen, grow, on }) {
  view.visible = frozen && on;
  if (!view.visible) return;
  view.position.set(...feet);
  view.scale.setScalar(Math.max(grow, 1e-3));
}
