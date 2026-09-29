/**
 * Upgrade card look (Phase 3 step 13, D95): an upgrade is an expansion
 * card, not a disk, so it reads as "plug this into the wizard". A white
 * landscape card as thin as a disk, hovering and spinning the same way
 * (diskMotion()); along its bottom edge a connector of contact fingers in
 * the upgrade's color, with a key notch; a mounting bracket up its left
 * side; on both faces the 4×4 bit grid with the upgrade's slot lit, one of
 * the 16 upgrade bits of the save. A card already found is a gray ghost,
 * solid-lined, like a found disk (D94).
 *
 * Looks are reviewed in the asset showcase (`?asset=upgrades`) before they
 * go into the game.
 */
import { Color, ExtrudeGeometry, Group, Mesh, Shape } from 'three';
import { DISK, bitGlow, createBitGrid } from './disk.js';
import { PALETTE, faceMaterial, lineMaterial, neonLines } from './neon.js';

/** Sizes in units. */
export const CARD = {
  /** The card: width, height (without the fingers) and thickness. */
  width: 0.72,
  height: 0.44,
  thickness: 0.05,
  /** Contact fingers along the bottom: how many, how long they stick out, their width; the key notch after this many. */
  fingers: 8,
  fingerLength: 0.07,
  fingerWidth: 0.045,
  notchAfter: 3,
  /** The bracket up the left side: its width and how far it stands above the card. */
  bracket: 0.05,
  bracketOver: 0.08,
  /** The bit grid: its size (DISK.grid of it is covered) and how far right of the middle. */
  grid: 0.42,
  gridShift: 0.1,
  /** Body line width and glow; the fingers' width, glow and the share of their color in their faces. */
  lineWidth: 2.2,
  brightness: 1.5,
  fingerLine: 1.6,
  fingerTint: 0.45,
};

/** Line segments of a closed polygon at depth z. */
const loop = (points, z) => points.map((p, i) => [[...p, z], [...points[(i + 1) % points.length], z]]);

/** A slab from an outline: faces and neon edges, `depth` thick, centered on z = 0. */
function slab(outline, depth, faces, lines) {
  const geometry = new ExtrudeGeometry(new Shape(outline.map(([x, y]) => ({ x, y }))), { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  const t = depth / 2;
  const edges = [...loop(outline, t), ...loop(outline, -t), ...outline.map((p) => [[...p, t], [...p, -t]])];
  const outlineLines = neonLines(edges, lines);
  outlineLines.renderOrder = 2;
  return [new Mesh(geometry, faces), outlineLines];
}

/**
 * The card model, centered on its middle, facing +z; pose it like a disk
 * with poseDisk(diskMotion()).
 * @param {object} [options]
 * @param {number|string} [options.color] the upgrade's color: its fingers and lit bit
 * @param {number} [options.slot] the upgrade's slot, 0-15: the one bit lit
 * @param {boolean} [options.ghost] a card already found
 */
export function createCard({ color = PALETTE.magenta, slot = 0, ghost = false } = {}) {
  const w = CARD.width / 2;
  const h = CARD.height / 2;
  const bodyColor = ghost ? DISK.ghost.color : DISK.color;
  const accent = ghost ? DISK.ghost.color : color;
  const glow = ghost ? DISK.ghost.brightness : CARD.brightness;

  // The card with its bracket: the bracket's strip runs up the left side
  // and stands above the top edge.
  const b = CARD.bracket;
  const outline = [[-w, -h], [w, -h], [w, h], [-w + b, h], [-w + b, h + CARD.bracketOver], [-w, h + CARD.bracketOver]];
  const body = slab(outline, CARD.thickness, faceMaterial(), lineMaterial({ color: bodyColor, width: CARD.lineWidth, brightness: glow }));

  // Contact fingers along the bottom edge, a gap for the key notch.
  const fingers = [];
  const span = CARD.width - 2 * b - 0.04;
  const pitch = span / (CARD.fingers + 1);
  const fw = CARD.fingerWidth / 2;
  for (let i = 0; i < CARD.fingers + 1; i++) {
    if (i === CARD.notchAfter) continue;
    const x = -w + b + 0.02 + pitch * (i + 0.5);
    fingers.push([[x - fw, -h], [x + fw, -h], [x + fw, -h - CARD.fingerLength], [x - fw, -h - CARD.fingerLength]]);
  }
  const fingerFaces = faceMaterial(new Color(PALETTE.face).lerp(new Color(accent), ghost ? 0.1 : CARD.fingerTint));
  const fingerLines = lineMaterial({ color: accent, width: CARD.fingerLine, brightness: ghost ? glow : bitGlow(accent) });
  const fingerParts = fingers.flatMap((outlineOf) => slab(outlineOf, CARD.thickness * 0.6, fingerFaces, fingerLines));

  // The save bits on both faces, right of the middle.
  const bits = new Group().add(...createBitGrid({ size: CARD.grid, depth: CARD.thickness / 2, slot, color: accent, ghost, sides: [1, -1] }));
  bits.position.x = CARD.gridShift;

  const spin = new Group().add(...body, ...fingerParts, bits);
  spin.position.y = DISK.hover;
  const model = new Group().add(spin);
  model.userData = { spin, color: bodyColor, bitColor: accent };
  return model;
}
