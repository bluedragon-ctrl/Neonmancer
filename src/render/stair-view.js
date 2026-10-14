/**
 * The blocks that fill only part of their cell (D221): the stair and the
 * slab. Like plain blocks they are room structure in the room color, dark
 * faces with neon edges, but each draws its own outline, outside the plain
 * blocks' mass (room-view.js), so a stair beside a ledge still reads as
 * steps.
 *
 * - Stair: STAIR.steps steps rising across the cell the way of its `rise`
 *   (the wizard walks a slope over them, Grid.span()); edges along every
 *   step's nosing and both side profiles.
 * - Slab: a thin walkway at the top of its cell (SLAB_HEIGHT), with a
 *   dashed center line along it so it reads as a path, not a block.
 */
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh } from 'three';
import { RISES, SLAB_HEIGHT } from '../world/grid.js';
import { blockEdges } from './edges.js';
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
export function stairSlices(steps = STAIR.steps) {
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
 * The slabs of one block type: thin walkways at the tops of their cells,
 * neighbours drawn as one (no edge between them), with a dashed line down
 * the middle of each.
 * @param {number[][]} cells [x, y, z]
 * @param {number|string} color
 */
export function createSlabView(cells, color) {
  const group = new Group();
  const thin = SLAB_HEIGHT;
  const geometry = new BoxGeometry(1, thin, 1).translate(0.5, 1 - thin / 2, 0.5).toNonIndexed();
  const unit = geometry.getAttribute('position').array;
  const positions = [];
  for (const [x, y, z] of cells) for (let i = 0; i < unit.length; i += 3) positions.push(unit[i] + x, unit[i + 1] + y, unit[i + 2] + z);
  geometry.dispose();
  const faces = new BufferGeometry();
  faces.setAttribute('position', new Float32BufferAttribute(positions, 3));
  group.add(new Mesh(faces, faceMaterial()));

  // The outline of the slabs as one mass: block edges, squashed into the slab's height.
  const squash = ([x, y, z]) => [x, isTop(y, cells) ? y : y + 1 - thin, z];
  const segments = blockEdges(cells).map(([a, b]) => [squash(a), squash(b)]);
  const edges = neonLines(segments, lineMaterial({ color, width: STAIR.width, brightness: STAIR.brightness }));
  edges.renderOrder = 2;
  group.add(edges);
  const middle = neonLines(slabCenterLines(cells), lineMaterial({ color, width: 1.5, brightness: 0.9, dashed: true }));
  middle.renderOrder = 2;
  group.add(middle);
  return group;
}

/** Is height `y` the top of some slab cell (rather than its bottom)? */
function isTop(y, cells) {
  return cells.some((cell) => cell[1] + 1 === y);
}

/**
 * A short dashed mark across the middle of each slab's top, along the way
 * the run of slabs goes (along x unless it runs along z).
 * @param {number[][]} cells
 */
export function slabCenterLines(cells) {
  const keys = new Set(cells.map((cell) => cell.join()));
  const lift = 0.004;
  return cells.map(([x, y, z]) => {
    const alongZ = keys.has(`${x},${y},${z - 1}`) || keys.has(`${x},${y},${z + 1}`);
    const top = y + 1 + lift;
    return alongZ
      ? [
          [x + 0.5, top, z],
          [x + 0.5, top, z + 1],
        ]
      : [
          [x, top, z + 0.5],
          [x + 1, top, z + 0.5],
        ];
  });
}
