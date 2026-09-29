/**
 * Buff chip look (Phase 3 step 12, D93): a permanent buff, a square chip
 * in the color of the stat it raises (BUFF_COLORS: cyan integrity, lime
 * energy, amber recharge), thicker than a data disk and hovering and
 * spinning the same way (diskMotion()). Pins stick out of its left and
 * right sides; the front carries the stat's icon (a plus, a crystal, a
 * lightning bolt), the back the 4×4 bit grid with the buff's slot lit, one
 * of the 16 buff bits of the save. A chip already found is a gray, dashed
 * ghost like a found disk.
 *
 * Looks are reviewed in the asset showcase (`?asset=chips`) before they go
 * into the game.
 */
import { Color, ExtrudeGeometry, Group, Mesh, Shape } from 'three';
import { BUFF_COLORS } from '../entities/pickup.js';
import { DISK, createBitGrid, restartDashes } from './disk.js';
import { PALETTE, faceMaterial, lineMaterial, neonLines } from './neon.js';

/** Sizes in units. */
export const CHIP = {
  /** Edge of the square body, its thickness and the clipped corner marking pin 1. */
  size: 0.56,
  thickness: 0.12,
  corner: 0.08,
  /** Pins on each side: how many, how far they stick out, how wide and how far apart. */
  pins: 3,
  pinLength: 0.07,
  pinWidth: 0.06,
  pinGap: 0.15,
  /** Body line width and glow; share of its color in the faces. */
  width: 2.4,
  brightness: 1.6,
  tint: 0.18,
  /** The icon: its height, how far it stands out of the front, line width and glow. */
  icon: 0.36,
  raise: 0.03,
  iconWidth: 2,
  iconBrightness: 2.2,
  iconTint: 0.4,
};

/**
 * Icon outlines, in units of the icon's height, centered: a plus
 * (integrity), a crystal (energy), a lightning bolt (recharge).
 */
const ICONS = {
  integrity: [[-0.15, 0.5], [0.15, 0.5], [0.15, 0.15], [0.5, 0.15], [0.5, -0.15], [0.15, -0.15], [0.15, -0.5], [-0.15, -0.5], [-0.15, -0.15], [-0.5, -0.15], [-0.5, 0.15], [-0.15, 0.15]],
  energy: [[0, 0.5], [0.3, 0.1], [0, -0.5], [-0.3, 0.1]],
  recharge: [[0.12, 0.5], [-0.28, -0.04], [-0.02, -0.04], [-0.14, -0.5], [0.3, 0.08], [0.04, 0.08]],
};

/** Line segments of a closed polygon at depth z. */
const loop = (points, z) => points.map((p, i) => [[...p, z], [...points[(i + 1) % points.length], z]]);

/**
 * A slab from an outline: a face mesh and its neon edges (both faces and
 * the edges between them), `depth` thick, centered on z = `z`.
 */
function slab(outline, depth, z, faces, lines) {
  const geometry = new ExtrudeGeometry(new Shape(outline.map(([x, y]) => ({ x, y }))), { depth, bevelEnabled: false });
  geometry.translate(0, 0, z - depth / 2);
  const front = z + depth / 2;
  const back = z - depth / 2;
  const edges = [...loop(outline, front), ...loop(outline, back), ...outline.map((p) => [[...p, front], [...p, back]])];
  const outlineLines = neonLines(edges, lines);
  outlineLines.renderOrder = 2;
  return [new Mesh(geometry, faces), outlineLines];
}

/**
 * The chip model, centered on its middle, facing +z (the icon; the bits
 * face -z); pose it like a disk with poseDisk(diskMotion()).
 * @param {object} [options]
 * @param {'integrity'|'energy'|'recharge'} [options.stat] what the buff raises: its color and icon
 * @param {number} [options.slot] the buff's slot, 0-15: the one bit lit
 * @param {boolean} [options.ghost] a chip already found
 */
export function createChip({ stat = 'integrity', slot = 0, ghost = false } = {}) {
  const s = CHIP.size / 2;
  const t = CHIP.thickness / 2;
  const c = CHIP.corner;
  const color = ghost ? DISK.ghost.color : BUFF_COLORS[stat];
  const glow = ghost ? DISK.ghost.brightness : CHIP.brightness;

  // The body, one corner clipped like a real chip's pin-1 mark.
  const outline = [[-s, -s], [s, -s], [s, s], [-s + c, s], [-s, s - c]];
  const bodyLines = lineMaterial({ color, width: CHIP.width, brightness: glow, dashed: ghost });
  const bodyFaces = faceMaterial(new Color(PALETTE.face).lerp(new Color(color), ghost ? 0.05 : CHIP.tint));
  const body = slab(outline, CHIP.thickness, 0, bodyFaces, bodyLines);
  if (ghost) restartDashes(body[1], outline.length);

  // Pins on the left and right sides: small open loops in the middle plane.
  const pins = [];
  const w = CHIP.pinWidth / 2;
  for (const side of [1, -1]) {
    for (let i = 0; i < CHIP.pins; i++) {
      const y = (i - (CHIP.pins - 1) / 2) * CHIP.pinGap;
      const x0 = side * s;
      const x1 = side * (s + CHIP.pinLength);
      pins.push([[x0, y - w, 0], [x1, y - w, 0]], [[x1, y - w, 0], [x1, y + w, 0]], [[x1, y + w, 0], [x0, y + w, 0]]);
    }
  }
  const pinLines = neonLines(pins, lineMaterial({ color, width: CHIP.width * 0.7, brightness: glow, dashed: ghost }));
  pinLines.renderOrder = 2;

  // The stat's icon, standing out of the front.
  const icon = ICONS[stat].map(([x, y]) => [x * CHIP.icon, y * CHIP.icon]);
  const iconLines = lineMaterial({ color, width: CHIP.iconWidth, brightness: ghost ? glow : CHIP.iconBrightness, dashed: ghost });
  const iconFaces = faceMaterial(new Color(PALETTE.face).lerp(new Color(color), ghost ? 0.1 : CHIP.iconTint));
  const iconParts = slab(icon, CHIP.raise, t + CHIP.raise / 2, iconFaces, iconLines);
  if (ghost) restartDashes(iconParts[1], icon.length);

  // The save bits on the back.
  const bits = createBitGrid({ size: CHIP.size, depth: t, slot, color, ghost, sides: [-1] });

  const spin = new Group().add(...body, pinLines, ...iconParts, ...bits);
  spin.position.y = DISK.hover;
  const model = new Group().add(spin);
  model.userData = { spin, color, bitColor: color };
  return model;
}
