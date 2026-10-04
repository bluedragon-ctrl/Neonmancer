/**
 * The fence look (D167): a see-through block drawn as horizontal data
 * streams, with no faces, so it never hides what is behind it.
 *
 * fenceLayout() is pure (tested): fence cells next to each other on the
 * same level link up. Each cell carries two beams along the line of its
 * run, through the middle of the cell, at half and full height; the beam
 * at the top of a stack is the rail, brightest, as it reads as a ledge (he
 * can stand on a fence). A straight run's beams reach the cell's edge at a
 * free end, where a post stands, unless a block or a back wall is there to
 * meet them. A corner, T or cross joins its beams at the middle of the
 * cell, round a post. A lone fence cell runs along x, or along z when
 * only a z side meets a block or wall.
 * createFenceView() draws it: posts dim, beams steady, the rail bright,
 * and pulses of data flowing along the beams.
 */
import { Color, Group } from 'three';
import { mergeUnitSegments } from './edges.js';
import { HOLO_TIME } from './holo.js';
import { lineMaterial, neonLines } from './neon.js';
import { cellKey } from '../data/room-data.js';

/** Tuning: widths in pixels at 1080p, brightness as for lineMaterial(). */
export const FENCE = {
  post: { width: 1.5, brightness: 0.8 },
  beam: { width: 2, brightness: 1.1 },
  rail: { width: 2.5, brightness: 1.6 },
  /** Data pulses along the beams: length and spacing in units, speed in units per second. */
  pulse: { width: 3.5, brightness: 2.6, whiten: 0.35, length: 0.16, spacing: 1, speed: 1.2 },
};

/** The four level directions [dx, dz]: −x, +x, −z, +z. */
const SIDES = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * @param {Iterable<number[]>} cells fence cells [x, y, z]
 * @param {(x: number, y: number, z: number) => boolean} [solid] does a
 *   block or wall fill the cell (a run ending there needs no post)?
 * @returns {{ beams: number[][][], rails: number[][][], posts: number[][][] }}
 *   merged segments [[x, y, z], [x, y, z]]
 */
export function fenceLayout(cells, solid = () => false) {
  const list = [...cells];
  const fence = new Set(list.map(cellKey));
  const has = (x, y, z) => fence.has(cellKey([x, y, z]));
  // Worked out in half units (doubled coordinates), so every piece is one
  // unit long there and mergeUnitSegments() joins them.
  const beams = [];
  const rails = [];
  const posts = [];
  const post = (px, y, pz) => posts.push([[px, 2 * y, pz], [px, 2 * y + 1, pz]], [[px, 2 * y + 1, pz], [px, 2 * y + 2, pz]]);

  for (const [x, y, z] of list) {
    const linked = SIDES.map(([dx, dz]) => has(x + dx, y, z + dz));
    const walled = SIDES.map(([dx, dz]) => solid(x + dx, y, z + dz));
    let alongX = linked[0] || linked[1];
    const alongZ = linked[2] || linked[3];
    // A lone cell: along x, or along z when only a z side meets a wall.
    const lone = !alongX && !alongZ;
    const loneZ = lone && !walled[0] && !walled[1] && (walled[2] || walled[3]);
    if (lone && !loneZ) alongX = true;
    const axes = [alongX, alongZ || loneZ];
    // A straight run (one axis only) reaches the cell's edges; a corner or
    // a junction only reaches out to its links, round a post in the middle.
    const straight = axes[0] !== axes[1];
    const cx = 2 * x + 1;
    const cz = 2 * z + 1;
    const top = !has(x, y + 1, z);
    SIDES.forEach(([dx, dz], i) => {
      if (!axes[dx !== 0 ? 0 : 1] || !(linked[i] || straight)) return;
      const edge = [cx + dx, cz + dz];
      for (const [level, out] of [[2 * y + 1, beams], [2 * y + 2, top ? rails : beams]]) {
        out.push([[cx, level, cz], [edge[0], level, edge[1]]]);
      }
      if (!linked[i] && !walled[i]) post(edge[0], y, edge[1]);
    });
    if (!straight) post(cx, y, cz);
  }
  const half = (segments) => mergeUnitSegments(segments).map((segment) => segment.map((point) => point.map((v) => v / 2)));
  return { beams: half(beams), rails: half(rails), posts: half(posts) };
}

/**
 * The fence cells of a room in their look.
 * @param {number[][]} cells [x, y, z]
 * @param {number|string} color edges (the room color by default, structure, D99)
 * @param {(x: number, y: number, z: number) => boolean} [solid] see fenceLayout()
 */
export function createFenceView(cells, color, solid) {
  const { beams, rails, posts } = fenceLayout(cells, solid);
  const group = new Group();
  for (const [segments, style] of [[posts, FENCE.post], [beams, FENCE.beam], [rails, FENCE.rail]]) {
    if (segments.length === 0) continue;
    const lines = neonLines(segments, lineMaterial({ color, ...style }));
    lines.renderOrder = 2;
    group.add(lines);
  }
  // Pulses: short dashes on the beams and rail, flowing the way they run
  // (towards +x or +z), moved on every frame with the shared time.
  const streams = [...beams, ...rails];
  if (streams.length > 0) {
    const { width, brightness, whiten, length, spacing, speed } = FENCE.pulse;
    const material = lineMaterial({ color: new Color(color).lerp(new Color(0xffffff), whiten), width, brightness, dashed: true });
    material.dashSize = length;
    material.gapSize = spacing - length;
    const pulses = neonLines(streams, material);
    pulses.renderOrder = 3;
    // LineSegments2 sets its resolution here too: keep that.
    const setResolution = pulses.onBeforeRender.bind(pulses);
    pulses.onBeforeRender = (renderer, ...rest) => {
      material.dashOffset = -((HOLO_TIME.value * speed) % spacing);
      setResolution(renderer, ...rest);
    };
    group.add(pulses);
  }
  return group;
}
