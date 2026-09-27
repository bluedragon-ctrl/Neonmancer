/**
 * three.js pieces of the Shield (D73; timing and shapes in shield-fx.js):
 * every zigzag variant of the lightning ring, one shown at a time.
 */
import { Group } from 'three';
import { lineMaterial, neonLines } from './neon.js';
import { SHIELD_FX, arcPoints, shieldLook } from './shield-fx.js';

/**
 * The Shield round the wizard (placeShield()).
 * @param {number|string} color the spell's color (defs.json spells)
 */
export function createShield(color) {
  const outer = lineMaterial({ color, width: 3.6, brightness: 2.6 });
  const inner = lineMaterial({ color: 0xffffff, width: 0.9, brightness: 1.3 });
  const shapes = Array.from({ length: SHIELD_FX.variants }, (_, v) => {
    const points = arcPoints(v);
    const segments = points.map((p, i) => [p, points[(i + 1) % points.length]]);
    const lines = new Group().add(neonLines(segments, outer), neonLines(segments, inner));
    lines.visible = false;
    return lines;
  });
  const spin = new Group().add(...shapes);
  spin.position.y = SHIELD_FX.y;
  const group = new Group().add(spin);
  Object.assign(group.userData, { spin, shapes, outer, inner, base: { outer: outer.color.clone(), inner: inner.color.clone() } });
  group.visible = false;
  return group;
}

/**
 * Show the Shield `tick` ticks after casting, lasting `ticks`, round the
 * wizard's feet `feet`; hidden when it is down.
 * @param {Group} view from createShield()
 * @param {number[]} feet
 * @param {number} tick
 * @param {number} ticks
 */
export function placeShield(view, feet, tick, ticks) {
  const look = shieldLook(tick, ticks);
  view.visible = look.visible;
  if (!look.visible) return;
  const { spin, shapes, outer, inner, base } = view.userData;
  view.position.set(...feet);
  spin.scale.setScalar(Math.max(look.scale, 1e-3));
  spin.rotation.y = look.angle;
  shapes.forEach((lines, v) => (lines.visible = v === look.variant));
  outer.color.copy(base.outer).multiplyScalar(look.glow);
  inner.color.copy(base.inner).multiplyScalar(look.glow);
}
