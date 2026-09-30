/**
 * Data pillar: a decoration, a frosted glass shaft in one grid cell (like
 * the crates, D96), one segment per block, on a plinth under a cap. Inside
 * stands a slimmer dark core; one of its faces carries four cables over a
 * glowing panel, dashes of data climbing them, seen through the glass.
 * Glass, core and cables are in the room's color (the biome's), the data a
 * brighter, whiter tint of it.
 *
 * The camera never turns (it looks from +x +y +z, D115), so only the top
 * and the +x and +z faces are ever seen: the data face is one of those two.
 * Showcase `?asset=pillars`.
 *
 * Packet timing is pure (packetT(), packetFade()); createDataPillar()
 * animates it.
 */
import { AdditiveBlending, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { boxEdges, boxFaces, lightBoxes, placeLight } from './deco.js';
import { GLASS, glassBox } from './glass.js';
import { hash } from './hash.js';
import { lineMaterial, neonLines } from './neon.js';

/** Tuning (units, seconds). */
export const PILLAR_FX = {
  /** Default height in blocks. */
  height: 3,
  /** Plinth and cap: height, margin from the cell's sides. */
  plinth: 0.14,
  plinthMargin: 0.07,
  /** Margin of the glass shaft from the cell's sides; of the core inside it. */
  margin: 0.2,
  coreMargin: 0.3,
  /** Where the cables lie across the data face (0..1). */
  cables: [0.14, 0.38, 0.62, 0.86],
  /** Packets per cable, their size [across, up]. */
  packets: 3,
  packetSize: [0.04, 0.16],
  /** Line brightness of the structure and of the cables. */
  edge: 1.2,
  cable: 0.8,
  /** Packets climb this fast (units per second, varied per cable). */
  speed: [0.7, 1.3],
  /** Core panel glow: seconds per pulse, opacity at its low and high. */
  pulse: 2.2,
  glowLow: 0.12,
  glowHigh: 0.3,
  /** Share of the run a packet grows in at the bottom and shrinks away at the top. */
  fadeIn: 0.08,
  fadeOut: 0.15,
};

/**
 * How far up its run (0..1) packet `k` of cable `lane` is at `time` (pure).
 * @param {number} time seconds
 * @param {number} lane
 * @param {number} k packet index on the cable
 * @param {number} perLane packets per cable
 * @param {number} run length of the run, units
 */
export function packetT(time, lane, k, perLane, run) {
  const [lo, hi] = PILLAR_FX.speed;
  const speed = lo + (hi - lo) * hash(lane, 1);
  const phase = hash(lane, 2) + k / perLane + (0.3 * (hash(lane, k + 3) - 0.5)) / perLane;
  const t = (time * speed) / run + phase;
  return t - Math.floor(t);
}

/**
 * Size of a packet `t` up its run: grows in at the bottom, shrinks away at
 * the top (pure).
 * @param {number} t 0..1
 */
export function packetFade(t) {
  return Math.max(0, Math.min(1, t / PILLAR_FX.fadeIn, (1 - t) / PILLAR_FX.fadeOut));
}

/**
 * A data pillar, its lower corner at the origin, 1×height×1.
 * `userData.update(dt)` animates it.
 * @param {object} [options]
 * @param {number|string} [options.color] the room's (biome's) color
 * @param {number} [options.height] in blocks
 * @param {'+x'|'+z'} [options.face] the face the data runs up
 */
export function createDataPillar({ color = '#ffb020', height = PILLAR_FX.height, face = '+z' } = {}) {
  const base = new Color(color);
  const data = base.clone().lerp(new Color(0xffffff), 0.5).multiplyScalar(1.8);
  const { plinth: p, plinthMargin: pm, margin: m, coreMargin: c } = PILLAR_FX;
  const top = height - p;
  const group = new Group();

  // Plinth, cap and core: dark boxes with edges.
  const boxes = [[[pm, 0, pm], [1 - pm, p, 1 - pm]], [[pm, top, pm], [1 - pm, height, 1 - pm]], [[c, p, c], [1 - c, top, 1 - c]]];
  const edges = boxes.flatMap(([a, b]) => boxEdges(a, b));
  group.add(...boxes.map(([a, b]) => boxFaces(a, b)));
  // Glass segments round the core, split at every block.
  const breaks = [p, ...Array.from({ length: Math.max(0, Math.ceil(top - 0.3) - 1) }, (_, i) => i + 1), top];
  breaks.slice(1).forEach((y1, i) => {
    group.add(glassBox([m, breaks[i], m], [1 - m, y1, 1 - m], base, GLASS.deco));
    edges.push(...boxEdges([m, breaks[i], m], [1 - m, y1, 1 - m]));
  });
  group.add(neonLines(edges, lineMaterial({ color: base, width: 2, brightness: PILLAR_FX.edge })));

  // A point on the core's data face: `u` across it (0..1, left to right on screen), at height `y`.
  const [lo, hi] = [c, 1 - c];
  const out = hi + 0.006;
  const onFace = (u, y) => {
    const along = lo + (hi - lo) * u;
    return face === '+x' ? [out, y, hi - (along - lo)] : [along, y, out];
  };
  const glow = new MeshBasicMaterial({ color: base, transparent: true, opacity: PILLAR_FX.glowHigh, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const panel = new Mesh(new PlaneGeometry((hi - lo) * 0.86, top - p), glow);
  panel.position.set(...onFace(0.5, height / 2));
  if (face === '+x') panel.rotation.y = Math.PI / 2;
  group.add(panel);
  const cables = PILLAR_FX.cables.map((u) => [onFace(u, p), onFace(u, top)]);
  group.add(neonLines(cables, lineMaterial({ color: base, width: 1.6, brightness: PILLAR_FX.cable })));

  const perLane = PILLAR_FX.packets;
  const packets = lightBoxes(cables.length * perLane, data);
  group.add(packets);

  const run = top - p;
  const [w, h] = PILLAR_FX.packetSize;
  let time = 0;
  group.userData.update = (dt) => {
    time += dt;
    PILLAR_FX.cables.forEach((u, l) => {
      for (let k = 0; k < perLane; k++) {
        const t = packetT(time, l, k, perLane, run);
        const s = packetFade(t);
        placeLight(packets, l * perLane + k, onFace(u, p + t * run), [w * s, h * s, w * s]);
      }
    });
    packets.instanceMatrix.needsUpdate = true;
    const pulse = 0.5 + 0.5 * Math.sin((time / PILLAR_FX.pulse) * 2 * Math.PI);
    glow.opacity = PILLAR_FX.glowLow + (PILLAR_FX.glowHigh - PILLAR_FX.glowLow) * pulse;
  };
  group.userData.update(0);
  return group;
}
