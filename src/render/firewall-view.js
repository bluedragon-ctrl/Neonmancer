/**
 * three.js pieces of the Firewall (D84; shapes in firewall-fx.js, timing
 * the Shield's, shieldLook()): every flicker variant of its ring, one shown
 * at a time.
 */
import { Group } from 'three';
import { firewallSegments } from './firewall-fx.js';
import { lineMaterial, neonLines } from './neon.js';
import { SHIELD_FX, shieldLook } from './shield-fx.js';

/**
 * The Firewall round the wizard (placeFirewall()).
 * @param {number|string} color the spell's color (defs.json spells)
 */
export function createFirewall(color) {
  const outer = lineMaterial({ color, width: 3.2, brightness: 2.6 });
  const inner = lineMaterial({ color: 0xffffff, width: 0.8, brightness: 1.2 });
  const shapes = Array.from({ length: SHIELD_FX.variants }, (_, v) => {
    const segments = firewallSegments(v);
    const lines = new Group().add(neonLines(segments, outer), neonLines(segments, inner));
    lines.visible = false;
    return lines;
  });
  const spin = new Group().add(...shapes);
  const group = new Group().add(spin);
  Object.assign(group.userData, { spin, shapes, outer, inner, base: { outer: outer.color.clone(), inner: inner.color.clone() } });
  group.visible = false;
  return group;
}

/**
 * Show the Firewall `tick` ticks after casting, lasting `ticks`, round the
 * wizard's feet `feet`; hidden when it is down. It turns the other way
 * from the Shield, slower.
 * @param {Group} view from createFirewall()
 * @param {number[]} feet
 * @param {number} tick
 * @param {number} ticks
 * @param {number|null} [sinceBlock] ticks since it last blocked an attack, or null
 */
export function placeFirewall(view, feet, tick, ticks, sinceBlock = null) {
  const look = shieldLook(tick, ticks, sinceBlock);
  view.visible = look.visible;
  if (!look.visible) return;
  const { spin, shapes, outer, inner, base } = view.userData;
  view.position.set(...feet);
  spin.scale.set(Math.max(look.scale, 1e-3), Math.max(look.scale, 1e-3) ** 0.5, Math.max(look.scale, 1e-3));
  spin.rotation.y = -look.angle * 0.5;
  shapes.forEach((lines, v) => (lines.visible = v === look.variant));
  outer.color.copy(base.outer).multiplyScalar(look.glow);
  inner.color.copy(base.inner).multiplyScalar(look.glow);
}
