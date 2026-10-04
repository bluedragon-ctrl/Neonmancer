/**
 * Layout of the fence look (D167; pure, tested): a see-through block
 * drawn as horizontal streams of light, with no faces, so it never hides
 * what is behind it.
 *
 * Fence cells next to each other on the same level link up. Each cell carries two beams along the line of its
 * run, through the middle of the cell, at half and full height; the beam
 * at the top of a stack is the rail, brightest, as it reads as a ledge (he
 * can stand on a fence). A straight run's beams reach the cell's edge at a
 * free end, where a post stands, unless a block or a back wall is there to
 * meet them. A corner, T or cross joins its beams at the middle of the
 * cell, round a post. A lone fence cell runs along x, or along z when
 * only a z side meets a block or wall. fence-view.js draws it as streams
 * of light, with a glowing node where a beam meets a post.
 */
import { mergeUnitSegments } from './edges.js';
import { cellKey } from '../data/room-data.js';

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
