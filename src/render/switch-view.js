/**
 * Switches and locked exits (Phase 3 step 4, D69): the looks, in variants
 * for review in the asset showcase (`?asset=switches`). The chosen ones go
 * into the game; the rest are dropped.
 *
 * - Target: a fixed block in the plain crate look (solid edges, no mark)
 *   that a Zap bolt switches on or off.
 * - Plate: a tile flush with the floor (like a hole) in the dashed crate
 *   look, on while a crate, an enemy or the wizard stands on it.
 * - Lock: the barrier across a locked exit, open while every switch in
 *   the room is on; small lights show how many are on.
 *
 * Each view has `userData.set(state)` and `userData.update(dt)`; states
 * ease in over a few frames.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { blockEdges } from './edges.js';
import { PALETTE, faceMaterial, lineMaterial, neonLines, shadedFaces } from './neon.js';

/** Candidate switch colors: [off, on]. */
export const SWITCH_COLORS = {
  yellow: [0xffe23a, 0xffe23a],
  white: [0xeef3ff, 0xeef3ff],
  redGreen: [0xff4040, 0x40ff78],
};

/** Tuning (units, seconds). */
export const SWITCH_FX = {
  /** Seconds to ease between off and on. */
  ease: 0.12,
  /** Line brightness off and on. */
  offBrightness: 0.45,
  onBrightness: 1.9,
  /** Share of the color in the faces when on. */
  onTint: 0.4,
  /** White flash on a bolt hit, seconds. */
  flash: 0.1,
  /** Plate lines float this far above the floor. */
  lift: 0.012,
  /** Lock: bars across the opening, seconds to open or close. */
  bars: 4,
  open: 0.35,
};

const face = new Color(PALETTE.face);
const white = new Color(0xffffff);

/** Square outline in the plane y, from (a, a) to (b, b) of the tile. */
function floorSquare(a, b, y) {
  return [
    [[a, y, a], [b, y, a]],
    [[b, y, a], [b, y, b]],
    [[b, y, b], [a, y, b]],
    [[a, y, b], [a, y, a]],
  ];
}

/** Square outlines centered on every face of the unit cube (margin from the face edges). */
function faceSquares(margin) {
  const segments = [];
  const [a, b] = [margin, 1 - margin];
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    for (const side of [0, 1]) {
      const p = (pu, pv) => {
        const q = [0, 0, 0];
        q[axis] = side;
        q[u] = pu;
        q[v] = pv;
        return q;
      };
      segments.push([p(a, a), p(b, a)], [p(b, a), p(b, b)], [p(b, b), p(a, b)], [p(a, b), p(a, a)]);
    }
  }
  return segments;
}

/** A filled square on every face of the unit cube, just outside it. */
function faceFills(margin, material) {
  const group = new Group();
  const size = 1 - 2 * margin;
  const out = 0.004;
  const place = [
    [[1 + out, 0.5, 0.5], [0, Math.PI / 2, 0]],
    [[-out, 0.5, 0.5], [0, -Math.PI / 2, 0]],
    [[0.5, 1 + out, 0.5], [-Math.PI / 2, 0, 0]],
    [[0.5, -out, 0.5], [Math.PI / 2, 0, 0]],
    [[0.5, 0.5, 1 + out], [0, 0, 0]],
    [[0.5, 0.5, -out], [0, Math.PI, 0]],
  ];
  for (const [pos, rot] of place) {
    const quad = new Mesh(new PlaneGeometry(size, size), material);
    quad.position.set(...pos);
    quad.rotation.set(...rot);
    group.add(quad);
  }
  return group;
}

/**
 * A glow spilling onto the floor round a tile: a square ring from the tile
 * edge (full color) out to `reach` (black), drawn additively, so it shows
 * round a crate standing on the tile.
 */
function floorSpill(reach, y, material) {
  const [a, b, A, B] = [0, 1, -reach, 1 + reach];
  const ring = [
    [[a, a], [b, a], [B, A], [A, A]],
    [[b, a], [b, b], [B, B], [B, A]],
    [[b, b], [a, b], [A, B], [B, B]],
    [[a, b], [a, a], [A, A], [A, B]],
  ];
  const positions = [];
  const colors = [];
  for (const quad of ring) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(quad[i][0], y, quad[i][1]);
      const c = i < 2 ? 1 : 0;
      colors.push(c, c, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return new Mesh(geometry, material);
}

/** An eased 0..1 value following a target. */
class Ease {
  constructor(value = 0) {
    this.value = value;
    this.target = value;
  }
  step(dt, time = SWITCH_FX.ease) {
    const k = Math.min(1, dt / time);
    this.value += Math.sign(this.target - this.value) * Math.min(Math.abs(this.target - this.value), k);
    return this.value;
  }
}

/**
 * The Zap target: a fixed block, plain crate look.
 * Variants: 'glow' (edges and faces light up), 'led' (a square on each face
 * fills), 'bullseye' (two nested squares on each face light up, faces tint).
 * @param {{ variant?: string, colors?: number[] }} [options]
 */
export function createTarget({ variant = 'glow', colors = SWITCH_COLORS.yellow } = {}) {
  const group = new Group();
  // Built round its center, so the jolt on a hit scales it in place.
  const body = new Group();
  body.position.set(0.5, 0.5, 0.5);
  const [offColor, onColor] = colors.map((c) => new Color(c));
  const faces = [0, 1, 2].map(() => faceMaterial());
  const box = new Mesh(UNIT_BOX, [faces[1], faces[1], faces[0], faces[0], faces[2], faces[2]]);
  group.add(box);
  const edgeMat = lineMaterial({ color: offColor, width: 2.5 });
  const edges = neonLines(blockEdges([[0, 0, 0]]), edgeMat);
  edges.renderOrder = 2;
  group.add(edges);

  const markMats = [];
  if (variant === 'led') {
    const mat = lineMaterial({ color: offColor, width: 1.8 });
    markMats.push(mat);
    const marks = neonLines(faceSquares(0.33), mat);
    marks.renderOrder = 2;
    group.add(marks);
  } else if (variant === 'bullseye') {
    for (const margin of [0.18, 0.36]) {
      const mat = lineMaterial({ color: offColor, width: 1.6 });
      markMats.push(mat);
      const marks = neonLines(faceSquares(margin), mat);
      marks.renderOrder = 2;
      group.add(marks);
    }
  }
  const fillMat = new MeshBasicMaterial({ color: onColor, side: DoubleSide, transparent: true, opacity: 0 });
  if (variant === 'led') group.add(faceFills(0.33, fillMat));

  for (const child of [...group.children]) {
    child.position.sub({ x: 0.5, y: 0.5, z: 0.5 });
    body.add(child);
  }
  group.add(body);

  const on = new Ease();
  let flash = 0;
  const tintFaces = variant !== 'led';
  group.userData.set = (state, { hit = false } = {}) => {
    on.target = state ? 1 : 0;
    if (hit) flash = SWITCH_FX.flash;
  };
  group.userData.update = (dt) => {
    const t = on.step(dt);
    flash = Math.max(0, flash - dt);
    const f = flash / SWITCH_FX.flash;
    const color = offColor.clone().lerp(onColor, t);
    const bright = SWITCH_FX.offBrightness + (SWITCH_FX.onBrightness - SWITCH_FX.offBrightness) * t;
    const lit = (c, b) => c.clone().lerp(white, f).multiplyScalar(b + f * 1.5);
    edgeMat.color.copy(lit(color, variant === 'glow' ? bright : 0.6 + 0.9 * t));
    for (const mat of markMats) mat.color.copy(lit(color, bright));
    fillMat.opacity = t;
    fillMat.color.copy(color).multiplyScalar(1.6);
    const tint = tintFaces ? SWITCH_FX.onTint * t : 0;
    [1, 0.6, 0.4].forEach((share, i) => faces[i].color.copy(face).lerp(color, tint * share).lerp(white, f * 0.3 * share));
    // A little jolt on a hit.
    body.scale.setScalar(1 + 0.06 * f);
  };
  group.userData.update(0);
  return group;
}

/** Unit cube with its corner at the origin. */
const UNIT_BOX = new BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);

/**
 * The pressure plate: a floor tile, dashed crate look.
 * Variants: 'halo' (a dashed square inside the tile; pressed, a solid
 * square and a halo just outside the tile, so it shows round a crate),
 * 'brackets' (dashed tile outline and an inner square; pressed, the square
 * fills and brackets light up just outside the corners), 'slab' (a thin raised slab
 * that sinks flush and lights up).
 * @param {{ variant?: string, colors?: number[] }} [options]
 */
export function createPlate({ variant = 'halo', colors = SWITCH_COLORS.yellow } = {}) {
  const group = new Group();
  const [offColor, onColor] = colors.map((c) => new Color(c));
  const y = SWITCH_FX.lift;
  const parts = [];
  const add = (segments, { width = 2, dashed = false, phase = 'both' }) => {
    const mat = lineMaterial({ color: offColor, width, dashed });
    const line = neonLines(segments, mat);
    line.renderOrder = 2;
    group.add(line);
    parts.push({ mat, line, phase });
    return line;
  };
  const fillMat = new MeshBasicMaterial({ color: onColor, transparent: true, opacity: 0, depthWrite: false });
  const fill = (size) => {
    const quad = new Mesh(new PlaneGeometry(size, size), fillMat);
    quad.rotation.x = -Math.PI / 2;
    quad.position.set(0.5, y / 2, 0.5);
    group.add(quad);
  };

  // Pressed, every look lights the floor round the tile, so it shows round a crate.
  const spillMat = new MeshBasicMaterial({ vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false });
  group.add(floorSpill(0.35, y / 2, spillMat));

  let slab = null;
  let slabFaces = null;
  if (variant === 'halo') {
    add(floorSquare(0.1, 0.9, y), { dashed: true, phase: 'off' });
    add(floorSquare(0, 1, y), { width: 2.5, phase: 'on' });
    add(floorSquare(-0.1, 1.1, y), { width: 1.5, phase: 'on' });
    fill(0.98);
  } else if (variant === 'brackets') {
    add(floorSquare(0, 1, y), { width: 2.2, dashed: true, phase: 'both' });
    add(floorSquare(0.3, 0.7, y), { width: 1.8, phase: 'both' });
    fill(0.4);
    // Corner brackets just outside the tile, lit when pressed.
    const o = -0.1;
    const l = 0.3;
    const brackets = [[o, o, 1, 1], [1 - o, o, -1, 1], [1 - o, 1 - o, -1, -1], [o, 1 - o, 1, -1]].flatMap(([x, z, dx, dz]) => [
      [[x, y, z], [x + l * dx, y, z]],
      [[x, y, z], [x, y, z + l * dz]],
    ]);
    add(brackets, { width: 2.2, phase: 'on' });
  } else {
    slabFaces = faceMaterial();
    slab = new Group();
    const body = new Mesh(new BoxGeometry(0.9, 0.08, 0.9).translate(0.5, 0.04, 0.5), slabFaces);
    slab.add(body);
    const mat = lineMaterial({ color: offColor, width: 2, dashed: true });
    const edges = neonLines(blockEdges([[0, 0, 0]]).map((s) => s.map(([px, py, pz]) => [0.05 + px * 0.9, py * 0.08, 0.05 + pz * 0.9])), mat);
    edges.renderOrder = 2;
    slab.add(edges);
    parts.push({ mat, line: edges, phase: 'slab' });
    group.add(slab);
    add(floorSquare(0, 1, y), { width: 2, phase: 'on' });
  }

  const on = new Ease();
  group.userData.set = (pressed) => {
    on.target = pressed ? 1 : 0;
  };
  group.userData.update = (dt) => {
    const t = on.step(dt);
    const color = offColor.clone().lerp(onColor, t);
    const bright = SWITCH_FX.offBrightness + (SWITCH_FX.onBrightness - SWITCH_FX.offBrightness) * t;
    for (const { mat, phase } of parts) {
      if (phase === 'off') mat.color.copy(color).multiplyScalar(SWITCH_FX.offBrightness * 1.6 * (1 - t));
      else if (phase === 'on') mat.color.copy(color).multiplyScalar(SWITCH_FX.onBrightness * t);
      else mat.color.copy(color).multiplyScalar(bright);
      // Pressed, a dashed outline turns solid.
      if ((phase === 'both' || phase === 'slab') && mat.dashed !== t < 0.5) {
        mat.dashed = t < 0.5;
        mat.needsUpdate = true;
      }
    }
    fillMat.opacity = 0.35 * t;
    spillMat.color.copy(color).multiplyScalar(0.45 * t);
    if (slab) {
      slab.scale.y = 1 - 0.85 * t;
      slabFaces.color.copy(face).lerp(color, 0.35 * t);
    }
  };
  group.userData.update(0);
  return group;
}

/**
 * The barrier across a locked exit (defaults applied), with a light per
 * switch in the room. Variants: 'bars' (bars across the opening that
 * retract into the frame), 'panel' (a dark panel with an outline and the
 * lights, sinking into the threshold; on a front exit it stays bars, since a
 * panel there would hide the room behind it), 'grid' (bars and uprights, the
 * lights on the middle bar).
 * @param {{ side: string, at: number, width: number, y: number, height: number }} exit
 * @param {number[]} size room size
 * @param {{ variant?: string, colors?: number[], switches?: number }} [options]
 */
export function createLock(exit, size, { variant = 'bars', colors = SWITCH_COLORS.yellow, switches = 2 } = {}) {
  const group = new Group();
  const [offColor, onColor] = colors.map((c) => new Color(c));
  const back = exit.side.startsWith('-');
  const along = exit.side.endsWith('x') ? 2 : 0;
  const cross = 2 - along;
  const plane = back ? 0 : size[cross];
  // (a, h): a along the side, h height; a hair inside the room.
  const inset = back ? 0.02 : -0.02;
  const point = (a, h) => {
    const p = [0, h, 0];
    p[along] = a;
    p[cross] = plane + inset;
    return p;
  };
  const [a0, a1, y0, y1] = [exit.at, exit.at + exit.width, exit.y, exit.y + exit.height];
  const mid = (a0 + a1) / 2;
  const kind = variant === 'panel' && !back ? 'bars' : variant;

  const barMat = lineMaterial({ color: offColor, width: 2.2 });
  const bars = [];
  if (kind !== 'panel') {
    const n = SWITCH_FX.bars;
    for (let i = 0; i < n; i++) {
      const h = y0 + ((i + 0.5) / n) * (y1 - y0);
      // Two halves meeting in the middle, so they can retract to the sides.
      for (const [from, to] of [[a0, mid], [a1, mid]]) {
        // Local: along from 0 to the middle, at height 0; the holder places it.
        const line = neonLines([[point(0, 0), point(to - from, 0)]], barMat);
        const holder = new Group().add(line);
        holder.position.setComponent(along, from);
        holder.position.y = h;
        group.add(holder);
        bars.push({ holder, dir: Math.sign(to - from) });
      }
    }
    if (kind === 'grid') {
      for (const a of [a0 + (a1 - a0) / 3, a0 + (2 * (a1 - a0)) / 3]) {
        const line = neonLines([[point(a, y0), point(a, y1)]], barMat);
        group.add(line);
        bars.push({ upright: line });
      }
    }
  }

  let panel = null;
  let panelMat = null;
  if (kind === 'panel') {
    panel = new Group();
    const p = (a, h) => point(a, h - y0);
    const quad = [p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1)];
    panelMat = faceMaterial();
    const positions = [0, 1, 2, 0, 2, 3].flatMap((i) => quad[i]);
    const faceMesh = shadedFaces(positions, positions.map(() => 0.03));
    panel.add(faceMesh);
    const m = 0.1;
    const outline = [
      [p(a0 + m, y0 + m), p(a1 - m, y0 + m)],
      [p(a1 - m, y0 + m), p(a1 - m, y1 - m)],
      [p(a1 - m, y1 - m), p(a0 + m, y1 - m)],
      [p(a0 + m, y1 - m), p(a0 + m, y0 + m)],
    ];
    const line = neonLines(outline, barMat);
    line.renderOrder = 3;
    panel.add(line);
    panel.position.y = y0;
    group.add(panel);
  }

  // Lights: a small square per switch, hollow while off, filled when on.
  const lights = [];
  const lightH = kind === 'grid' ? y0 + ((Math.floor(SWITCH_FX.bars / 2) + 0) / SWITCH_FX.bars) * (y1 - y0) : (y0 + y1) / 2;
  if (variant !== 'bars') {
    const s = 0.09;
    const gap = 0.28;
    for (let i = 0; i < switches; i++) {
      const a = mid + (i - (switches - 1) / 2) * gap;
      const mat = lineMaterial({ color: offColor, width: 1.8 });
      const outline = neonLines(
        [
          [point(a - s, -s), point(a + s, -s)],
          [point(a + s, -s), point(a + s, s)],
          [point(a + s, s), point(a - s, s)],
          [point(a - s, s), point(a - s, -s)],
        ],
        mat,
      );
      outline.renderOrder = 4;
      const fillMat = new MeshBasicMaterial({ color: onColor, side: DoubleSide, transparent: true, opacity: 0, depthWrite: false });
      const fillQuad = new Mesh(new PlaneGeometry(2 * s, 2 * s), fillMat);
      fillQuad.position.set(...point(a, 0));
      if (along === 2) fillQuad.rotation.y = Math.PI / 2;
      const light = new Group().add(outline, fillQuad);
      light.position.y = lightH;
      (panel ?? group).add(light);
      if (panel) light.position.y = lightH - y0;
      lights.push({ group: light, mat, fillMat, on: new Ease() });
    }
  }

  const open = new Ease();
  group.userData.set = ({ lit = 0 } = {}) => {
    lights.forEach((light, i) => (light.on.target = i < lit ? 1 : 0));
    open.target = lit >= switches ? 1 : 0;
  };
  let time = 0;
  group.userData.update = (dt) => {
    time += dt;
    const t = open.step(dt, SWITCH_FX.open);
    const eased = t * t * (3 - 2 * t);
    const flicker = 1 + 0.08 * Math.sin(time * 37) * Math.sin(time * 11);
    barMat.color.copy(offColor).multiplyScalar(1.6 * flicker * (1 - 0.5 * eased));
    for (const bar of bars) {
      if (bar.upright) {
        bar.upright.visible = eased < 0.3;
        continue;
      }
      // Retract: shrink towards the frame.
      bar.holder.scale.setComponent(along, Math.max(0.001, 1 - eased));
      bar.holder.visible = eased < 0.99;
    }
    if (panel) {
      panel.scale.y = Math.max(0.001, 1 - eased);
      panel.visible = eased < 0.99;
    }
    for (const light of lights) {
      light.group.visible = eased < 0.5;
      const l = light.on.step(dt);
      light.mat.color.copy(offColor.clone().lerp(onColor, l)).multiplyScalar(0.7 + 1.3 * l);
      light.fillMat.opacity = l;
      light.fillMat.color.copy(onColor).multiplyScalar(1.8);
    }
    group.userData.openness = eased;
  };
  group.userData.update(0);
  return group;
}
