/**
 * The cage (D202): a one-cell box of light bars round a pickup, a switch
 * gate (gate-view.js createGate()) drawn like a fence (fence-view.js: the
 * same streams of light and glowing nodes) so the pickup shows from the
 * camera. It reads as a cage, not a wall: a frame of beams round all four
 * sides, a post in each corner, a bar up the middle of each side and a
 * lid of two bars over the top, the room's color (structure that opens,
 * D99), the lid's rail brightest as it is a standable top.
 *
 * Local coordinates, the cell's lower corner at the origin, so a gate's
 * body can scale it down as it sinks.
 */
import { Color, Group } from 'three';
import { FENCE, beamMesh, flowing, nodeMesh, nodePoints } from './fence-view.js';

/** Tuning: how far the bars sit inside the cell's edge, and how bright the side bars are. */
export const CAGE = {
  inset: 0.08,
  /** The vertical bars: a post's look, brighter so they read as bars. */
  bar: { ...FENCE.post, glow: 0.8, halo: 0.3, width: 0.09 },
};

/**
 * Bar segments of a cage cell (pure, tested), in the cell's local units.
 * @returns {{ beams: number[][][], rails: number[][][], posts: number[][][], bars: number[][][] }}
 *   beams: the ring at half height; rails: the ring at the top and the lid
 *   bars; posts: the four corners; bars: the middle of each side
 */
export function cageLayout(inset = CAGE.inset) {
  const a = inset;
  const b = 1 - inset;
  const m = 0.5;
  const ring = (y) => [
    [[a, y, a], [b, y, a]],
    [[b, y, a], [b, y, b]],
    [[a, y, b], [b, y, b]],
    [[a, y, a], [a, y, b]],
  ];
  // Segments run from the low end to the high end of x and z, as flowing() expects.
  const lid = [[[a, 1, 0.3], [b, 1, 0.3]], [[a, 1, 0.7], [b, 1, 0.7]]];
  const posts = [[a, a], [a, b], [b, a], [b, b]].map(([x, z]) => [[x, 0, z], [x, 1, z]]);
  const bars = [[a, m], [b, m], [m, a], [m, b]].map(([x, z]) => [[x, 0, z], [x, 1, z]]);
  return { beams: ring(0.5), rails: [...ring(1), ...lid], posts, bars };
}

/**
 * The cage's body: bars and nodes in one group.
 * @param {number|string|Color} color
 */
export function createCageBody(color) {
  const tint = new Color(color);
  const { beams, rails, posts, bars } = cageLayout();
  const group = new Group();
  group.add(beamMesh(flowing(beams), tint, {}));
  group.add(beamMesh(flowing(rails), tint, FENCE.rail));
  group.add(beamMesh(posts.map((segment) => ({ segment, flow: 1 })), tint, FENCE.post));
  group.add(beamMesh(bars.map((segment) => ({ segment, flow: 1 })), tint, CAGE.bar));
  group.add(nodeMesh(nodePoints(posts), tint));
  return group;
}
