/**
 * Data disk look (Phase 3 step 2): an abstract data disk, a thin neon slab
 * with both top corners clipped (it looks the same from either side),
 * hovering over its cell and spinning. Both faces
 * carry a 4×4 grid of data bits (like a destructible crate's) showing the
 * spell's slot, one of the 16 spell bits of the save: set bits are small
 * raised cubes in the spell's color, the others dim squares. A disk already
 * found is a gray ghost, solid-lined, spinning without the bob (D67, D74, D94). Picking one up lifts
 * it, flashes it and bursts its bits into pixels.
 *
 * Looks are reviewed in the asset showcase (`?asset=disks`) before they go
 * into the game.
 */
import { BoxGeometry, Color, EdgesGeometry, ExtrudeGeometry, Group, Mesh, Shape } from 'three';
import { hash } from './hash.js';
import { PALETTE, faceMaterial, lineMaterial, neonLines } from './neon.js';

/** Sizes in units, times in seconds unless named ticks. */
export const DISK = {
  /** Edge of the square body and its thickness; the clipped top corners. */
  size: 0.6,
  thickness: 0.07,
  corner: 0.12,
  /** Height of its center above the floor, the bob around it and its period. */
  hover: 0.55,
  bob: 0.05,
  bobPeriod: 2.2,
  /** Spin (radians per second): a full turn every ~4 s. */
  turn: 1.5,
  /** Body line color, width and glow. */
  color: 0xffffff,
  width: 2.2,
  brightness: 1.5,
  /** The bit grid: share of the face it covers, a bit's share of its cell, how far a lit bit stands out. */
  grid: 0.66,
  bit: 0.62,
  raise: 0.05,
  /** Zero bits on a ghost: a share of its brightness. */
  zero: 0.35,
  /** Zero bits on a live disk: dark gray, so the lit bit stands out (D74); a ghost keeps its own gray. */
  zeroColor: 0x2c2f3a,
  /** Lit bits: line width and glow, and the share of their color in their faces. */
  bitWidth: 1.8,
  bitBrightness: 2,
  /** A darker spell color glows brighter, up to this many times, so every lit bit reads like Zap's cyan (D74). */
  bitBoost: 2.5,
  bitTint: 0.35,
  /** A found disk: gray, dim and still. */
  ghost: { color: 0x9aa0b8, brightness: 0.9 },
  /** Pick-up: ticks it rises and flashes, how high; then the pixel burst. */
  collect: { riseTicks: 10, rise: 0.4, pixels: 24, pixelSize: 0.06, pixelTicks: 36, spread: 0.8, lift: 0.5 },
};



/** Relative luminance of a color (linear RGB weights). */
const luminance = (color) => {
  const { r, g, b } = new Color(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * How bright a lit bit in `color` glows: DISK.bitBrightness for a color as
 * light as Zap's cyan or lighter, more for darker ones (up to bitBoost
 * times), so a dark blue bit stands out on the white disk as well (D74).
 * @param {number|string} color
 */
export function bitGlow(color) {
  const boost = luminance(PALETTE.cyan) / Math.max(luminance(color), 1e-3);
  return DISK.bitBrightness * Math.min(DISK.bitBoost, Math.max(1, boost));
}

/** Line segments of a closed polygon at depth z. */
const loop = (points, z) => points.map((p, i) => [[...p, z], [...points[(i + 1) % points.length], z]]);

/** Shared geometry of a lit bit, sized when first needed. */
let bitGeometry = null;
let bitEdges = null;

/**
 * The disk model, centered on its middle, facing +z; pose it with
 * poseDisk(diskMotion()).
 * @param {object} [options]
 * @param {number|string} [options.color] its spell's color (defs.json spells), for the lit bit
 * @param {number} [options.slot] the spell's slot, 0-15: the one bit lit, row
 *   by row from the top left (the save bit the disk sets)
 * @param {boolean} [options.ghost] a disk already found
 */
export function createDisk({ color = PALETTE.cyan, slot = 0, ghost = false } = {}) {
  const s = DISK.size / 2;
  const t = DISK.thickness / 2;
  const c = DISK.corner;
  // Both top corners clipped: symmetric, so the lit bit sits the same way from both sides.
  const outline = [[-s, -s], [s, -s], [s, s - c], [s - c, s], [-s + c, s], [-s, s - c]];

  const bodyColor = ghost ? DISK.ghost.color : DISK.color;
  const bitColor = ghost ? DISK.ghost.color : color;
  const glow = ghost ? DISK.ghost.brightness : DISK.brightness;

  const shape = new Shape(outline.map(([x, y]) => ({ x, y })));
  const geometry = new ExtrudeGeometry(shape, { depth: DISK.thickness, bevelEnabled: false });
  geometry.translate(0, 0, -t);
  const body = new Mesh(geometry, faceMaterial());

  // Outline: both faces and the edges between them.
  const edges = [...loop(outline, t), ...loop(outline, -t), ...outline.map((p) => [[...p, t], [...p, -t]])];
  const lines = neonLines(edges, lineMaterial({ color: bodyColor, width: DISK.width, brightness: glow }));
  lines.renderOrder = 2;

  // The bit grid on both faces: a lit cube for the slot's bit, a dim square for the others.
  const cells = createBitGrid({ size: DISK.size, depth: t, slot, color: bitColor, ghost, sides: [1, -1] });
  const spin = new Group().add(body, lines, ...cells);
  const model = new Group().add(spin);
  model.userData = { spin, color: bodyColor, bitColor };
  spin.position.y = DISK.hover;
  return model;
}

/**
 * A 4×4 grid of save bits on the faces of a slab (a data disk, a buff chip,
 * D93): a raised cube in `color` for the slot's bit, dim squares for the
 * others, row by row from the top left.
 * @param {object} options
 * @param {number} options.size edge of the slab's face; the grid covers DISK.grid of it
 * @param {number} options.depth half the slab's thickness: the faces are at ±depth
 * @param {number} options.slot the lit bit, 0-15
 * @param {number|string} options.color the lit bit's color
 * @param {boolean} [options.ghost] found already: gray and dim
 * @param {number[]} [options.sides] the faces to cover: 1 the front (+z), -1 the back
 * @returns {import('three').Object3D[]}
 */
export function createBitGrid({ size, depth, slot, color, ghost = false, sides = [1, -1] }) {
  const s = size / 2;
  const t = depth;
  const bitColor = ghost ? DISK.ghost.color : color;
  const glow = ghost ? DISK.ghost.brightness : DISK.brightness;
  const pitch = (size * DISK.grid) / 4;
  const half = (pitch * DISK.bit) / 2;
  bitGeometry ??= new BoxGeometry(2 * half, 2 * half, DISK.raise);
  const scale = (2 * half) / bitGeometry.parameters.width;
  bitEdges ??= new EdgesGeometry(bitGeometry);
  const zeroMaterial = ghost
    ? lineMaterial({ color: DISK.ghost.color, width: 1.2, brightness: glow * DISK.zero })
    : lineMaterial({ color: DISK.zeroColor, width: 1.2, brightness: 1 });
  const litLines = lineMaterial({ color: bitColor, width: DISK.bitWidth, brightness: ghost ? glow : bitGlow(bitColor) });
  const litFaces = faceMaterial(new Color(PALETTE.face).lerp(new Color(bitColor), ghost ? 0.1 : DISK.bitTint));
  const edgeSegments = edgePairs(bitEdges);
  const cells = [];
  const zeros = [];
  for (const side of sides) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        // The back mirrors the front, so the code reads the same from both sides.
        const x = side * (col - 1.5) * pitch;
        const y = (1.5 - row) * pitch - 0.02 * s;
        if (row * 4 + col !== slot) {
          zeros.push(...loop([[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half]], side * t));
          continue;
        }
        const cubeLines = neonLines(edgeSegments, litLines);
        cubeLines.renderOrder = 2;
        const lit = new Group().add(new Mesh(bitGeometry, litFaces), cubeLines);
        lit.position.set(x, y, side * (t + DISK.raise / 2));
        lit.scale.set(scale, scale, 1);
        cells.push(lit);
      }
    }
  }
  // All zero bits are one line object: one draw call instead of 30.
  const zeroLines = neonLines(zeros, zeroMaterial);
  zeroLines.renderOrder = 2;
  cells.push(zeroLines);
  return cells;
}

/** Segment pairs of an EdgesGeometry, for neonLines(). */
function edgePairs(edges) {
  const p = edges.attributes.position.array;
  const pairs = [];
  for (let i = 0; i < p.length; i += 6) pairs.push([[p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]]]);
  return pairs;
}

/**
 * Where the disk is and how it looks this frame (pure).
 * @param {object} state
 * @param {number} state.time seconds, for the idle motion
 * @param {boolean} [state.ghost] found already: spins at its hover height, without the bob
 * @param {number} [state.collected] ticks since it was picked up (undefined: not picked up)
 * @returns {{ visible: boolean, y: number, angle: number, scale: number, flash: number }}
 *   y: center height above the floor; flash 0..1 towards white
 */
export function diskMotion({ time, ghost = false, collected }) {
  if (ghost) return { visible: true, y: DISK.hover, angle: time * DISK.turn, scale: 1, flash: 0 };
  const y = DISK.hover + DISK.bob * Math.sin((time / DISK.bobPeriod) * 2 * Math.PI);
  const angle = time * DISK.turn;
  if (collected === undefined) return { visible: true, y, angle, scale: 1, flash: 0 };
  const { riseTicks, rise } = DISK.collect;
  // Gone: where it vanished, for the pixel burst.
  if (collected >= riseTicks) return { visible: false, y: y + rise, angle, scale: 0, flash: 1 };
  const k = collected / riseTicks;
  // Rises, spins up and flashes white, shrinking at the very end.
  return { visible: true, y: y + rise * k * (2 - k), angle: angle + k * k * 6, scale: 1 - 0.5 * k * k, flash: k };
}

/**
 * Pose the model from diskMotion().
 * @param {Group} model from createDisk()
 * @param {ReturnType<typeof diskMotion>} motion
 */
export function poseDisk(model, { visible, y, angle, scale, flash }) {
  const { spin } = model.userData;
  spin.visible = visible;
  spin.position.y = y;
  spin.rotation.y = angle;
  spin.scale.setScalar(scale);
  spin.traverse((node) => {
    if (!node.isLineSegments2) return;
    const material = node.material;
    material.userData.base ??= material.color.clone();
    material.color.copy(material.userData.base).lerp(new Color(0xffffff).multiplyScalar(2.4), flash);
  });
}

/** Seed of the burst's hash() sequence. */
const SEED = [47.3, 191.9];

/**
 * The pixels of a picked-up disk, `tick` ticks after it vanished, as
 * offsets from its center: its bits fly out and up and shrink to nothing.
 * @param {number} tick
 * @returns {{ offset: number[], scale: number }[]} empty once they are gone
 */
export function diskPixels(tick) {
  const { pixels, pixelTicks, spread, lift } = DISK.collect;
  if (tick < 0 || tick >= pixelTicks) return [];
  const t = tick / pixelTicks;
  const out = 1 - (1 - t) * (1 - t);
  return Array.from({ length: pixels }, (_, i) => {
    const angle = (i / pixels) * 2 * Math.PI + hash(i, 0, SEED);
    const reach = spread * (0.5 + 0.5 * hash(i, 1, SEED)) * out;
    return {
      offset: [Math.cos(angle) * reach, lift * out * (0.4 + hash(i, 2, SEED)) + Math.sin(angle) * reach * 0.4, Math.sin(angle) * reach],
      scale: 1 - t,
    };
  });
}
