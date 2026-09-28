/**
 * Switches and locked exits (Phase 3 step 4, D69, D75). Both switches
 * carry a square bull's-eye, a small square inside a bigger one, so they
 * read as switches by shape and not only by color; switched on, the inner
 * square fills with light.
 *
 * - Target: a fixed block (plain crate look: solid edges, dark faces) with
 *   the bull's-eye on every face; a Zap switches it on or off.
 * - Plate: a floor tile, flush like a hole, with a dashed outline and the
 *   bull's-eye; pressed, the outline turns solid, brackets light up just
 *   outside its corners and a glow spills onto the floor round it, so it
 *   shows round a crate standing on it.
 * - Lock: the barrier across a locked exit. A back doorway gets a dark
 *   panel that sinks into the threshold; a front exit gets bars that
 *   retract into the frame (a panel there would hide the room behind it).
 *   Both carry one small bull's-eye light per switch in the room, lit when
 *   that many switches are on.
 *
 * Each view has `userData.set(...)` and `userData.update(dt)`; states ease
 * in over a few frames. Reviewed in the asset showcase (`?asset=switches`).
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
import { PALETTE, faceMaterial, lineMaterial, neonLines, shadedFaces, shared } from './neon.js';

/** Tuning (units, seconds). */
export const SWITCH_FX = {
  /** Seconds to ease between off and on. */
  ease: 0.12,
  /** Line brightness of edges and marks, off and on. */
  off: 0.7,
  on: 1.9,
  /** The bull's-eye: margins of its outer and inner square from the face edge. */
  outer: 0.2,
  inner: 0.36,
  /** Glow of the filled inner square when on. */
  fill: 1.6,
  /** Share of the color in a target's faces when on. */
  tint: 0.25,
  /** White flash and jolt on a bolt hit, seconds. */
  flash: 0.1,
  jolt: 0.06,
  /** Plate: lines float this far above the floor; the glow reaches this far out; bracket arm length. */
  lift: 0.012,
  spill: 0.35,
  spillBrightness: 0.45,
  bracket: 0.3,
  /** Lock: bars across a front exit; seconds to open or close; brightness and flicker. */
  bars: 4,
  open: 0.35,
  lockBrightness: 1.6,
  flicker: 0.08,
  /** Lock lights: half size of the outer square, gap between lights. */
  light: 0.1,
  lightGap: 0.3,
};

const FACE = new Color(PALETTE.face);
const WHITE = new Color(0xffffff);

/** Unit cube with its corner at the origin. */
const UNIT_BOX = shared(new BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5));

/** Square outline in 2D from (a, a) to (b, b), as four segments. */
function square2d(a, b) {
  return [
    [[a, a], [b, a]],
    [[b, a], [b, b]],
    [[b, b], [a, b]],
    [[a, b], [a, a]],
  ];
}

/**
 * The bull's-eye (outer and inner square) on every face of the unit cube
 * (pure, tested).
 * @returns {{ outer: number[][][], inner: number[][][] }} segments
 */
export function targetMarks() {
  const onFaces = (segments2d) => {
    const segments = [];
    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      for (const side of [0, 1]) {
        const p = ([pu, pv]) => {
          const q = [0, 0, 0];
          q[axis] = side;
          q[u] = pu;
          q[v] = pv;
          return q;
        };
        for (const [a, b] of segments2d) segments.push([p(a), p(b)]);
      }
    }
    return segments;
  };
  const { outer, inner } = SWITCH_FX;
  return { outer: onFaces(square2d(outer, 1 - outer)), inner: onFaces(square2d(inner, 1 - inner)) };
}

/**
 * A plate's lines on the floor tile (pure, tested): the dashed tile
 * outline, the bull's-eye, and the corner brackets just outside the tile.
 * @param {number} y height to draw at
 */
export function plateMarks(y) {
  const lift = (segments2d) => segments2d.map((segment) => segment.map(([x, z]) => [x, y, z]));
  const { outer, inner, bracket } = SWITCH_FX;
  const o = -0.1;
  const brackets = [[o, o, 1, 1], [1 - o, o, -1, 1], [1 - o, 1 - o, -1, -1], [o, 1 - o, 1, -1]].flatMap(([x, z, dx, dz]) => [
    [[x, y, z], [x + bracket * dx, y, z]],
    [[x, y, z], [x, y, z + bracket * dz]],
  ]);
  return {
    tile: lift(square2d(0, 1)),
    outer: lift(square2d(outer, 1 - outer)),
    inner: lift(square2d(inner, 1 - inner)),
    brackets,
  };
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
  const geometry = new PlaneGeometry(size, size);
  for (const [pos, rot] of place) {
    const quad = new Mesh(geometry, material);
    quad.position.set(...pos);
    quad.rotation.set(...rot);
    group.add(quad);
  }
  return group;
}

/**
 * A glow spilling onto the floor round a tile: a square ring from the tile
 * edge (full color) out to `reach` (black), drawn additively.
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

/** A glowing, see-through material for filled squares. */
function glowMaterial(color) {
  return new MeshBasicMaterial({ color, side: DoubleSide, transparent: true, opacity: 0, depthWrite: false });
}

/** An eased 0..1 value following a target. */
class Ease {
  constructor(value = 0) {
    this.value = value;
    this.target = value;
  }

  step(dt, time = SWITCH_FX.ease) {
    const k = Math.min(1, dt / time);
    const gap = this.target - this.value;
    this.value += Math.sign(gap) * Math.min(Math.abs(gap), k);
    return this.value;
  }
}

/** Line brightness for an on-ness of 0..1. */
const brightness = (t) => SWITCH_FX.off + (SWITCH_FX.on - SWITCH_FX.off) * t;

/**
 * The Zap target, its lower corner at the origin.
 * `userData.set(on, { hit })`: switch it; `hit` flashes and jolts it.
 * @param {number|string} color
 */
export function createTarget(color) {
  const base = new Color(color);
  const group = new Group();
  // Built round its center, so the jolt scales it in place.
  const body = new Group();
  body.position.set(0.5, 0.5, 0.5);
  const inner = new Group();
  inner.position.set(-0.5, -0.5, -0.5);
  body.add(inner);
  group.add(body);

  const faces = [0, 1, 2].map(() => faceMaterial());
  inner.add(new Mesh(UNIT_BOX, [faces[1], faces[1], faces[0], faces[0], faces[2], faces[2]]));
  const edgeMat = lineMaterial({ color: base, width: 2.5 });
  const markMat = lineMaterial({ color: base, width: 1.8 });
  const fillMat = glowMaterial(base);
  const marks = targetMarks();
  for (const line of [neonLines(blockEdges([[0, 0, 0]]), edgeMat), neonLines([...marks.outer, ...marks.inner], markMat)]) {
    line.renderOrder = 2;
    inner.add(line);
  }
  inner.add(faceFills(SWITCH_FX.inner, fillMat));

  const on = new Ease();
  let flash = 0;
  const color_ = new Color();
  group.userData.set = (state, { hit = false } = {}) => {
    on.target = state ? 1 : 0;
    if (hit) flash = SWITCH_FX.flash;
  };
  group.userData.update = (dt) => {
    const t = on.step(dt);
    flash = Math.max(0, flash - dt);
    const f = flash / SWITCH_FX.flash;
    const lit = (b) => color_.copy(base).lerp(WHITE, f).multiplyScalar(b + f * 1.5);
    edgeMat.color.copy(lit(brightness(t)));
    markMat.color.copy(lit(brightness(t)));
    fillMat.opacity = t;
    fillMat.color.copy(base).multiplyScalar(SWITCH_FX.fill);
    [1, 0.6, 0.4].forEach((share, i) => faces[i].color.copy(FACE).lerp(base, SWITCH_FX.tint * t * share).lerp(WHITE, f * 0.3 * share));
    body.scale.setScalar(1 + SWITCH_FX.jolt * f);
  };
  group.userData.update(0);
  return group;
}

/**
 * The pressure plate, its tile corner at the origin (floor level).
 * `userData.set(pressed)`.
 * @param {number|string} color
 */
export function createPlate(color) {
  const base = new Color(color);
  const group = new Group();
  const y = SWITCH_FX.lift;
  const marks = plateMarks(y);
  const line = (segments, material) => {
    const lines = neonLines(segments, material);
    lines.renderOrder = 2;
    group.add(lines);
    return lines;
  };
  const tileMat = lineMaterial({ color: base, width: 2.2, dashed: true });
  const markMat = lineMaterial({ color: base, width: 1.8 });
  const bracketMat = lineMaterial({ color: base, width: 2.2 });
  line(marks.tile, tileMat);
  line([...marks.outer, ...marks.inner], markMat);
  line(marks.brackets, bracketMat);
  const fillMat = glowMaterial(base);
  const fill = new Mesh(new PlaneGeometry(1 - 2 * SWITCH_FX.inner, 1 - 2 * SWITCH_FX.inner), fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(0.5, y / 2, 0.5);
  const spillMat = new MeshBasicMaterial({ vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false });
  group.add(fill, floorSpill(SWITCH_FX.spill, y / 2, spillMat));

  const on = new Ease();
  group.userData.set = (pressed) => {
    on.target = pressed ? 1 : 0;
  };
  group.userData.update = (dt) => {
    const t = on.step(dt);
    tileMat.color.copy(base).multiplyScalar(brightness(t));
    markMat.color.copy(base).multiplyScalar(brightness(t));
    bracketMat.color.copy(base).multiplyScalar(SWITCH_FX.on * t);
    fillMat.opacity = t;
    fillMat.color.copy(base).multiplyScalar(SWITCH_FX.fill);
    spillMat.color.copy(base).multiplyScalar(SWITCH_FX.spillBrightness * t);
    // Pressed, the dashed outline turns solid.
    if (tileMat.dashed !== t < 0.5) {
      tileMat.dashed = t < 0.5;
      tileMat.needsUpdate = true;
    }
  };
  group.userData.update(0);
  return group;
}

/**
 * The barrier across a locked exit, in room coordinates.
 * `userData.set({ lit, open })`: how many switches are on, whether it is open.
 * `userData.openness` (0..1) tells how far it has opened.
 * @param {{ side: string, at: number, width: number, y: number, height: number }} exit defaults applied
 * @param {number[]} size room size
 * @param {{ color: number|string, switches: number }} options switches in the room (one light each)
 */
export function createLock(exit, size, { color, switches }) {
  const base = new Color(color);
  const group = new Group();
  const back = exit.side.startsWith('-');
  const along = exit.side.endsWith('x') ? 2 : 0;
  const cross = 2 - along;
  // (a, h): a along the side, h height; a hair inside the room.
  const plane = back ? 0.02 : size[cross] - 0.02;
  const point = (a, h) => {
    const p = [0, h, 0];
    p[along] = a;
    p[cross] = plane;
    return p;
  };
  const [a0, a1, y0, y1] = [exit.at, exit.at + exit.width, exit.y, exit.y + exit.height];
  const mid = (a0 + a1) / 2;
  const lineMat = lineMaterial({ color: base, width: 2.2 });

  // Back doorway: a dark panel with an outline, sinking into the threshold
  // (scaled down from its foot, so its parts are relative to y0).
  const barrier = new Group();
  barrier.position.y = y0;
  group.add(barrier);
  const p = (a, h) => point(a, h - y0);
  const bars = [];
  if (back) {
    const quad = [p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1)];
    const positions = [0, 1, 2, 0, 2, 3].flatMap((i) => quad[i]);
    barrier.add(shadedFaces(positions, positions.map(() => 0.03)));
    const m = 0.1;
    const outline = [
      [p(a0 + m, y0 + m), p(a1 - m, y0 + m)],
      [p(a1 - m, y0 + m), p(a1 - m, y1 - m)],
      [p(a1 - m, y1 - m), p(a0 + m, y1 - m)],
      [p(a0 + m, y1 - m), p(a0 + m, y0 + m)],
    ];
    const lines = neonLines(outline, lineMat);
    lines.renderOrder = 3;
    barrier.add(lines);
  } else {
    // Front exit: bars, each two halves meeting in the middle that retract to the sides.
    for (let i = 0; i < SWITCH_FX.bars; i++) {
      const h = y0 + ((i + 0.5) / SWITCH_FX.bars) * (y1 - y0);
      for (const from of [a0, a1]) {
        const holder = new Group().add(neonLines([[point(0, 0), point(mid - from, 0)]], lineMat));
        holder.position.setComponent(along, from);
        holder.position.y = h;
        group.add(holder);
        bars.push(holder);
      }
    }
  }

  // Lights: a small bull's-eye per switch in a row across the middle; the
  // inner square fills for each switch that is on. On a front exit they sit
  // between the middle bars.
  const lights = [];
  const s = SWITCH_FX.light;
  const r = (s * (1 - 2 * SWITCH_FX.inner)) / (1 - 2 * SWITCH_FX.outer);
  const lightH = (y0 + y1) / 2;
  for (let i = 0; i < switches; i++) {
    const a = mid + (i - (switches - 1) / 2) * SWITCH_FX.lightGap;
    const box = (k) => [
      [p(a - k, lightH - k), p(a + k, lightH - k)],
      [p(a + k, lightH - k), p(a + k, lightH + k)],
      [p(a + k, lightH + k), p(a - k, lightH + k)],
      [p(a - k, lightH + k), p(a - k, lightH - k)],
    ];
    const mat = lineMaterial({ color: base, width: 1.6 });
    const outline = neonLines([...box(s), ...box(r)], mat);
    outline.renderOrder = 4;
    const fillMat = glowMaterial(base);
    const fill = new Mesh(new PlaneGeometry(2 * r, 2 * r), fillMat);
    fill.position.set(...p(a, lightH));
    if (along === 2) fill.rotation.y = Math.PI / 2;
    fill.renderOrder = 4;
    const light = new Group().add(outline, fill);
    barrier.add(light);
    lights.push({ light, mat, fillMat, on: new Ease() });
  }

  const opening = new Ease();
  group.userData.set = ({ lit = 0, open = false } = {}) => {
    lights.forEach((light, i) => (light.on.target = i < lit ? 1 : 0));
    opening.target = open ? 1 : 0;
  };
  let time = 0;
  group.userData.update = (dt) => {
    time += dt;
    const t = opening.step(dt, SWITCH_FX.open);
    const eased = t * t * (3 - 2 * t);
    const flicker = 1 + SWITCH_FX.flicker * Math.sin(time * 37) * Math.sin(time * 11);
    lineMat.color.copy(base).multiplyScalar(SWITCH_FX.lockBrightness * flicker);
    for (const holder of bars) {
      holder.scale.setComponent(along, Math.max(0.001, 1 - eased));
      holder.visible = eased < 0.99;
    }
    if (back) barrier.scale.y = Math.max(0.001, 1 - eased);
    barrier.visible = eased < 0.99;
    for (const { light, mat, fillMat, on } of lights) {
      // On a front exit the lights just go out with the bars.
      if (!back) light.visible = eased < 0.5;
      const l = on.step(dt);
      mat.color.copy(base).multiplyScalar(brightness(l));
      fillMat.opacity = l;
      fillMat.color.copy(base).multiplyScalar(SWITCH_FX.fill);
    }
    group.userData.openness = eased;
  };
  group.userData.update(0);
  return group;
}
