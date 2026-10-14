/**
 * The blocks that fill only part of their cell (D221): the stair and the
 * slab. Like plain blocks they are room structure in the room color, but
 * each draws its own outline, outside the plain blocks' mass
 * (room-view.js), so a stair beside a ledge still reads as steps.
 *
 * - Stair: STAIR.steps steps rising across the cell the way of its `rise`
 *   (the wizard walks a slope over them, Grid.span()); edges along every
 *   step's nosing and both side profiles; dark faces, like a block.
 * - Slab: a single sheet of glass at the top of its cell (SLAB_HEIGHT), in
 *   the room color (GLASS.slab), outlined round its top, so it reads as a
 *   bridge, not a block, and what passes under it shows.
 */
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh } from 'three';
import { RISES, SLAB_HEIGHT } from '../world/grid.js';
import { blockEdges } from './edges.js';
import { GLASS, glassBoxes } from './glass.js';
import { faceMaterial, lineMaterial, neonLines } from './neon.js';

/** Tuning. */
export const STAIR = {
  /** Steps in one stair (one cell up). */
  steps: 4,
  /** Outline: line width and brightness, as plain blocks'. */
  width: 2.5,
  brightness: 1.6,
};

/**
 * Where a point of a stair rising +x lands in a stair rising `rise`: a turn
 * about the cell's vertical middle, so faces keep their winding.
 * @param {string} rise '+x', '-x', '+z' or '-z'
 * @returns {(p: number[]) => number[]}
 */
export function riseTurn(rise) {
  const [axis, sign] = RISES[rise];
  if (axis === 0) return sign > 0 ? ([x, y, z]) => [x, y, z] : ([x, y, z]) => [1 - x, y, 1 - z];
  return sign > 0 ? ([x, y, z]) => [1 - z, y, x] : ([x, y, z]) => [z, y, 1 - x];
}

/**
 * The boxes a stair rising +x is made of in its unit cell: one slice per
 * step, from its nosing to the back, as [lo, hi] corners.
 */
function stairSlices(steps = STAIR.steps) {
  return Array.from({ length: steps }, (_, i) => [
    [i / steps, i / steps, 0],
    [1, (i + 1) / steps, 1],
  ]);
}

/**
 * Edges of a stair rising +x in its unit cell (pure): the step profile on
 * both sides, a line across at each of its corners, and the bottom edges.
 * @returns {number[][][]} segments [from, to]
 */
export function stairSegments(steps = STAIR.steps) {
  // The side profile, (x, y), closed: up the front, the steps, down the back.
  const profile = [[0, 0]];
  for (let i = 0; i < steps; i++) profile.push([i / steps, (i + 1) / steps], [(i + 1) / steps, (i + 1) / steps]);
  profile.push([1, 0]);
  const segments = [];
  profile.forEach(([x, y], i) => {
    const [nx, ny] = profile[(i + 1) % profile.length];
    for (const z of [0, 1]) segments.push([[x, y, z], [nx, ny, z]]);
    segments.push([[x, y, 0], [x, y, 1]]);
  });
  return segments;
}

/** Dark faces of a stair rising +x in its unit cell, as a flat triangle list. */
function stairTriangles(steps = STAIR.steps) {
  const out = [];
  for (const [lo, hi] of stairSlices(steps)) {
    const box = new BoxGeometry(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
      .translate((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2)
      .toNonIndexed();
    const { array } = box.getAttribute('position');
    for (let i = 0; i < array.length; i += 3) out.push([array[i], array[i + 1], array[i + 2]]);
    box.dispose();
  }
  return out;
}

/**
 * The stairs of one block type: dark faces and neon edges for each cell.
 * @param {number[][]} cells [x, y, z]
 * @param {string} rise the type's rise
 * @param {number|string} color
 */
export function createStairView(cells, rise, color) {
  const turn = riseTurn(rise);
  const place = ([x, y, z], p) => {
    const [px, py, pz] = turn(p);
    return [x + px, y + py, z + pz];
  };
  const triangles = stairTriangles();
  const positions = cells.flatMap((cell) => triangles.flatMap((p) => place(cell, p)));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const group = new Group();
  group.add(new Mesh(geometry, faceMaterial()));
  const local = stairSegments();
  const segments = cells.flatMap((cell) => local.map(([a, b]) => [place(cell, a), place(cell, b)]));
  const edges = neonLines(segments, lineMaterial({ color, width: STAIR.width, brightness: STAIR.brightness }));
  edges.renderOrder = 2;
  group.add(edges);
  return group;
}

/**
 * The slabs of one block type: glass sheets at the tops of their cells,
 * neighbours outlined as one (no edge between them), only round the top.
 * @param {number[][]} cells [x, y, z]
 * @param {number|string} color
 */
export function createSlabView(cells, color) {
  const thin = SLAB_HEIGHT;
  const group = new Group();
  group.add(glassBoxes(cells.map(([x, y, z]) => [[x, y + 1 - thin, z], [x + 1, y + 1, z + 1]]), color, GLASS.slab));
  // The outline of the slabs as one mass: the block edges round their tops.
  const segments = blockEdges(cells).filter(([a, b]) => a[1] === b[1] && isTop(a[1], cells));
  const edges = neonLines(segments, lineMaterial({ color, width: STAIR.width, brightness: STAIR.brightness }));
  edges.renderOrder = 2;
  group.add(edges);
  return group;
}

/** Is height `y` the top of some slab cell (rather than its bottom)? */
function isTop(y, cells) {
  return cells.some((cell) => cell[1] + 1 === y);
}
