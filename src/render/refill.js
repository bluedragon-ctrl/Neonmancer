/**
 * Refill looks (Phase 3 step 2): temporary pickups, smaller than a data
 * disk, hovering and spinning the same way (diskMotion()), in the color of
 * the HUD bar they fill. Integrity: a plus of five voxels (cyan). Energy: a
 * crystal, an octahedron (lime).
 *
 * Looks are reviewed in the asset showcase (`?asset=refills`) before they
 * go into the game.
 */
import { BoxGeometry, Color, EdgesGeometry, Group, Mesh, OctahedronGeometry } from 'three';
import { blockEdges } from './edges.js';
import { PALETTE, faceMaterial, lineMaterial, neonLines } from './neon.js';
import { DISK } from './disk.js';

/** Sizes in units. */
export const REFILL = {
  /** Height of the center above the floor. */
  hover: 0.45,
  /** Edge of one voxel of the integrity plus. */
  voxel: 0.12,
  /** Radius of the energy crystal. */
  crystal: 0.2,
  /** Color by what it refills (the HUD bars' colors). */
  colors: { integrity: PALETTE.cyan, energy: PALETTE.lime },
  width: 2,
  brightness: 1.7,
  /** Share of the color in the faces. */
  tint: 0.3,
};

/** The plus: a center voxel and four arms, in the x-y plane. */
const PLUS = [[1, 1, 0], [0, 1, 0], [2, 1, 0], [1, 0, 0], [1, 2, 0]];

/**
 * A refill model, centered at its hover height; pose it like a disk
 * (poseDisk(diskMotion()), with REFILL.hover as the height).
 * @param {'integrity'|'energy'} stat what it refills
 */
export function createRefill(stat) {
  const color = REFILL.colors[stat];
  const faces = faceMaterial(new Color(PALETTE.face).lerp(new Color(color), REFILL.tint));
  const lines = lineMaterial({ color, width: REFILL.width, brightness: REFILL.brightness });
  const spin = new Group();

  if (stat === 'integrity') {
    // Outline of the five voxels as one shape, in a group scaled to voxel size and centered.
    const shape = new Group();
    const box = new BoxGeometry(1, 1, 1);
    for (const [x, y, z] of PLUS) {
      const voxel = new Mesh(box, faces);
      voxel.position.set(x + 0.5, y + 0.5, z + 0.5);
      shape.add(voxel);
    }
    const outline = neonLines(blockEdges(PLUS), lines);
    outline.renderOrder = 2;
    shape.add(outline);
    shape.scale.setScalar(REFILL.voxel);
    shape.position.set(-1.5 * REFILL.voxel, -1.5 * REFILL.voxel, -0.5 * REFILL.voxel);
    spin.add(shape);
  } else {
    const geometry = new OctahedronGeometry(REFILL.crystal);
    geometry.scale(0.8, 1.2, 0.8);
    const edges = new EdgesGeometry(geometry).attributes.position.array;
    const segments = [];
    for (let i = 0; i < edges.length; i += 6) segments.push([[edges[i], edges[i + 1], edges[i + 2]], [edges[i + 3], edges[i + 4], edges[i + 5]]]);
    const outline = neonLines(segments, lines);
    outline.renderOrder = 2;
    spin.add(new Mesh(geometry, faces), outline);
  }

  spin.position.y = REFILL.hover;
  const model = new Group().add(spin);
  model.userData = { spin, color, bitColor: color };
  return model;
}

/**
 * A refill's motion: a disk's (diskMotion()), lowered to its own hover height.
 * @param {ReturnType<import('./disk.js').diskMotion>} motion
 */
export function refillMotion(motion) {
  return { ...motion, y: motion.y - DISK.hover + REFILL.hover };
}
