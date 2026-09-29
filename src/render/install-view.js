/**
 * three.js pieces of the install animation (D73; timing and shapes in
 * install-fx.js): the disk (or a buff's chip, D93) shrinking, its bits
 * spiralling in, rings sweeping up the wizard, and his hologram tinted and
 * flashed.
 */
import { Color, Group } from 'three';
import { poseDisk } from './disk.js';
import { createPixelBurst, placePixels } from './entity-view.js';
import { INSTALL_FX, installLook } from './install-fx.js';
import { lineMaterial, neonLines } from './neon.js';

/** Segments of a circle of radius 1 in the xz plane. */
const CIRCLE = Array.from({ length: 48 }, (_, i) => {
  const at = (k) => [Math.sin((k / 48) * Math.PI * 2), 0, Math.cos((k / 48) * Math.PI * 2)];
  return [at(i), at(i + 1)];
});

const WHITE = new Color(0xffffff);

/**
 * The install animation's pieces for one data disk or buff chip (placeInstall()).
 * @param {import('three').Group} disk the item's model (createDisk() or createChip()), taken over
 */
export function createInstall(disk) {
  // A disk's spell color (its lit bit), a chip's own.
  const color = disk.userData.bitColor;
  const pixels = createPixelBurst(INSTALL_FX.pixels, INSTALL_FX.pixelSize, [color, color, 0xffffff]);
  const rings = Array.from({ length: INSTALL_FX.rings }, () => {
    const ring = neonLines(CIRCLE, lineMaterial({ color, width: 2.6, brightness: 2 }));
    ring.userData.base = ring.material.color.clone();
    ring.visible = false;
    return ring;
  });
  const group = new Group().add(disk, pixels, ...rings);
  Object.assign(group.userData, { disk, pixels, rings, color: new Color(color) });
  return group;
}

/**
 * Show the install animation `tick` ticks after the disk was taken, round
 * the wizard's feet, and tint or flash his hologram; hidden once it is done
 * (his flash is then left alone).
 * @param {Group} view from createInstall()
 * @param {import('three').Object3D} wizard from createWizard()
 * @param {number[]} feet
 * @param {number} tick
 * @param {number[]} [from] where the disk was, relative to his feet
 */
export function placeInstall(view, wizard, feet, tick, from) {
  const look = installLook(tick, from);
  view.visible = !look.done;
  if (look.done) return;
  const { disk, pixels, rings, color } = view.userData;
  view.position.set(...feet);
  disk.position.set(look.disk.pos[0], 0, look.disk.pos[2]);
  poseDisk(disk, { visible: look.disk.visible, y: look.disk.pos[1], angle: 0, scale: Math.max(look.disk.scale, 1e-3), flash: 0 });
  placePixels(pixels, look.pixels, [0, 0, 0]);
  rings.forEach((ring, i) => {
    const r = look.rings[i];
    ring.visible = Boolean(r);
    if (!r) return;
    ring.position.y = r.y;
    ring.scale.set(r.radius, 1, r.radius);
    ring.material.color.copy(ring.userData.base).multiplyScalar(r.glow);
  });
  const flash = wizard.userData.flash;
  flash.amount.value = Math.max(look.tint, look.flash);
  flash.color.value.copy(look.flash > 0 ? WHITE : color);
}
