/**
 * three.js pieces of the double jump's kick-off (D95; timing and sizes in
 * jump-fx.js): flat hexagonal rings in his magenta under his feet.
 */
import { Group } from 'three';
import { JUMP_FX, jumpRings } from './jump-fx.js';
import { PALETTE, lineMaterial, neonLines } from './neon.js';

/** Segments of a hexagon of radius 1 in the xz plane, a corner towards the camera. */
const HEXAGON = Array.from({ length: JUMP_FX.sides }, (_, i) => {
  const at = (k) => {
    const angle = Math.PI / 4 + (k / JUMP_FX.sides) * Math.PI * 2;
    return [Math.sin(angle), 0, Math.cos(angle)];
  };
  return [at(i), at(i + 1)];
});

/** The kick-off rings (placeJumpRings()). */
export function createJumpRings(color = PALETTE.magenta) {
  const rings = Array.from({ length: JUMP_FX.rings }, () => {
    const ring = neonLines(HEXAGON, lineMaterial({ color, width: 2.6, brightness: 1 }));
    ring.userData.base = ring.material.color.clone();
    return ring;
  });
  const group = new Group().add(...rings);
  group.userData.rings = rings;
  group.visible = false;
  return group;
}

/**
 * Show the rings `tick` ticks after he kicked off at `feet`; hidden with no tick.
 * @param {Group} view
 * @param {number[]|null} feet where he kicked off
 * @param {number|null} tick may be fractional
 */
export function placeJumpRings(view, feet, tick) {
  view.visible = feet !== null && tick !== null;
  if (!view.visible) return;
  view.position.set(...feet);
  jumpRings(tick).forEach(({ radius, glow }, i) => {
    const ring = view.userData.rings[i];
    ring.visible = glow > 0;
    ring.scale.setScalar(radius);
    ring.material.color.copy(ring.userData.base).multiplyScalar(glow);
  });
}
