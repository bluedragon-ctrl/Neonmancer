/**
 * Switches and locked exits (D75). Both switches
 * carry a square bull's-eye, a small square inside a bigger one, so they
 * read as switches by shape and not only by color; switched on, the inner
 * square fills with light.
 *
 * Both are white frosted glass like the switch gates (GLASS.gate, D116):
 * white is a mechanism (D99), and what switches and what is switched
 * share one material. Switched on, the glass glows brighter.
 *
 * - Target: a fixed glass block with solid edges and the bull's-eye on
 *   the faces the camera sees (top, +x, +z; the glass would show the
 *   hidden ones through); a Zap switches it on or off.
 * - Plate: a floor tile, a thin glass slab flush with the floor, with a
 *   dashed outline and the bull's-eye on top; pressed, the outline turns
 *   solid, brackets light up just outside its corners and a glow spills
 *   onto the floor round it, so it shows round a crate standing on it.
 * - Lock: the barrier across a locked exit, on back doorways and front
 *   exits alike: a white glass pane that sinks into the threshold. It carries
 *   one small bull's-eye light per switch linked to it (D140), glowing red
 *   while that switch is off and green once it is on; an access lock its level as a small Roman numeral
 *   in the top corner, red while his level is too low and green once it is enough
 *   (D101).
 * - Timed switches (D140): the outer square of the bull's-eye is dashed;
 *   counting down, the switch blinks, faster as its time runs out.
 *
 * Each view has `userData.set(...)` and `userData.update(dt)`; states ease
 * in over a few frames. Reviewed in the asset showcase (`?asset=switches`).
 */
import {
  AdditiveBlending,
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
import { fadingDrops } from './hole-view.js';
import { GLASS, glassBox } from './glass.js';
import { PALETTE, lineMaterial, neonLines, roomLook } from './neon.js';
import { linkedSwitches, switchesOn } from '../switches.js';

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
  /**
   * The glass of a target or plate: its tint off (dark, clearly unlit) and
   * on (bright), what a hit's flash adds, and the brightness of its edges
   * and marks while off (on: `on` below).
   */
  glassOff: 0.06,
  glassOn: 0.7,
  glassFlash: 0.5,
  bodyOff: 0.4,
  /** Plate: height of its glass slab. */
  slab: 0.03,
  /** White flash and jolt on a bolt hit, seconds. */
  flash: 0.1,
  jolt: 0.06,
  /** Plate: lines float this far above its slab; the glow reaches this far out; bracket arm length. */
  lift: 0.008,
  spill: 0.35,
  spillBrightness: 0.45,
  bracket: 0.3,
  /** Lock: seconds to open or close; brightness and flicker. */
  open: 0.35,
  lockBrightness: 1.6,
  flicker: 0.08,
  /** Lock lights: half size of the outer square, gap between lights. */
  light: 0.1,
  lightGap: 0.3,
  /**
   * Access lock (D101): the level as a Roman numeral (red or green, see
   * numeralScale below): its height, stroke and bar
   * thickness, a V's or an X's width, the gap between letters, brightness.
   */
  numeral: 0.8,
  /** On a lock it is drawn at this share of that size, this far from the top corner. */
  numeralScale: 0.55,
  numeralMargin: 0.2,
  stroke: 0.11,
  serif: 0.075,
  letter: 0.36,
  letterGap: 0.08,
  numeralBrightness: 2.2,
  /**
   * A timed switch counting down (D140) blinks: seconds per blink with its
   * whole time left and at the very end, the lit share of a blink and how
   * bright it dips in between (0..1 of on).
   */
  blinkSlow: 0.6,
  blinkFast: 0.12,
  blinkLit: 0.6,
  blinkDip: 0.25,
  /**
   * A heavy plate (D200): in place of the one inner square, two of this
   * side overlapping in a corner (for two bodies), their lower left corners
   * this far apart along each axis; and, under too little weight, how bright it flickers (0..1
   * of on, dark and half-lit) and how fast (stutters per second, the
   * eased value follows within this many seconds).
   */
  heavyPair: 0.26,
  heavyShift: 0.12,
  /** Its two squares stay visible with nothing on it: line brightness and fill opacity at rest. */
  heavyOff: 0.95,
  heavyFillOff: 0.14,
  partialLo: 0.05,
  partialHi: 0.5,
  partialRate: 9,
  partialEase: 0.03,
};

const WHITE = new Color(0xffffff);

/** Lock lights: red while the switch is off, green once on (readable at a glance). */
const LOCK_RED = new Color(PALETTE.danger);
const LOCK_GREEN = new Color(PALETTE.neonGreen);

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
 * The bull's-eye (outer and inner square) on the faces of the unit cube
 * (pure, tested): every face, or only the ones the camera sees.
 * @param {{ seen?: boolean }} [options] seen: top, +x and +z only (D115)
 * @returns {{ outer: number[][][], inner: number[][][] }} segments
 */
export function targetMarks({ seen = false } = {}) {
  const onFaces = (segments2d) => {
    const segments = [];
    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      for (const side of seen ? [1] : [0, 1]) {
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

/** The two squares [from, to] of a heavy plate's centre (D200): side `heavyPair`, overlapping in a corner, the pair centred on the tile. */
export function heavyPairSquares() {
  const { heavyPair: side, heavyShift: shift } = SWITCH_FX;
  const a = 0.5 - (side + shift) / 2;
  return [[a, a + side], [a + shift, a + shift + side]];
}

/**
 * A plate's lines on the floor tile (pure, tested): the dashed tile
 * outline, the bull's-eye, and the corner brackets just outside the tile.
 * A heavy plate (D200) has `pair`, two squares overlapping in a corner, in place of `inner`.
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
    pair: heavyPairSquares().map((square) => lift(square2d(...square))),
    brackets,
  };
}

/** A filled square on the seen faces of the unit cube (top, +x, +z), just outside it. */
function faceFills(margin, material) {
  const group = new Group();
  const size = 1 - 2 * margin;
  const out = 0.004;
  const place = [
    [[1 + out, 0.5, 0.5], [0, Math.PI / 2, 0]],
    [[0.5, 1 + out, 0.5], [-Math.PI / 2, 0, 0]],
    [[0.5, 0.5, 1 + out], [0, 0, 0]],
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

/** Line brightness of a switch's own edges and marks: darker off than lock lights. */
const bodyBrightness = (t) => SWITCH_FX.bodyOff + (SWITCH_FX.on - SWITCH_FX.bodyOff) * t;

/** Glass tint of a switch for an on-ness of 0..1. */
const glassTint = (t) => SWITCH_FX.glassOff + (SWITCH_FX.glassOn - SWITCH_FX.glassOff) * t;

/**
 * How lit a switch is (0..1, pure): on or off, and while a timed one
 * counts down (D140) blinking, faster as `countdown` (share of its time
 * left) runs out.
 * @param {boolean} on
 * @param {number|null} countdown 1 → 0 while counting down, else null
 * @param {number} time seconds, for the blink phase
 */
export function switchLight(on, countdown, time) {
  if (!on) return 0;
  if (countdown === null) return 1;
  const { blinkSlow, blinkFast, blinkLit, blinkDip } = SWITCH_FX;
  const period = blinkFast + (blinkSlow - blinkFast) * countdown;
  return (time % period) / period < blinkLit ? 1 : blinkDip;
}

/**
 * How lit a heavy plate is under too little weight (D200, pure): it
 * stutters between dark and half-lit, never fully on.
 * @param {number} time seconds
 */
export function partialLight(time) {
  const { partialLo, partialHi, partialRate } = SWITCH_FX;
  const wave = Math.sin(time * partialRate * 2.1) + Math.sin(time * partialRate * 3.7 + 1);
  return wave > 0.3 ? partialHi : partialLo;
}

/**
 * The Zap target, its lower corner at the origin.
 * `userData.set(on, { hit })`: switch it (on: 0..1, see switchLight());
 * `hit` flashes and jolts it.
 * @param {number|string} color
 * @param {{ timed?: boolean }} [options] a timed target (D140): dashed outer squares
 */
export function createTarget(color, { timed = false } = {}) {
  const base = new Color(color);
  const group = new Group();
  // Built round its center, so the jolt scales it in place.
  const body = new Group();
  body.position.set(0.5, 0.5, 0.5);
  const inner = new Group();
  inner.position.set(-0.5, -0.5, -0.5);
  body.add(inner);
  group.add(body);

  const glass = glassBox([0, 0, 0], [1, 1, 1], base, GLASS.gate);
  inner.add(glass);
  const tint = glass.material.uniforms.uTint;
  const edgeMat = lineMaterial({ color: base, width: 2.5 });
  const markMat = lineMaterial({ color: base, width: 1.8 });
  const outerMat = timed ? lineMaterial({ color: base, width: 1.8, dashed: true }) : markMat;
  const fillMat = glowMaterial(base);
  const marks = targetMarks({ seen: true });
  for (const line of [neonLines(blockEdges([[0, 0, 0]]), edgeMat), neonLines(marks.outer, outerMat), neonLines(marks.inner, markMat)]) {
    line.renderOrder = 2;
    inner.add(line);
  }
  inner.add(faceFills(SWITCH_FX.inner, fillMat));

  const on = new Ease();
  let flash = 0;
  const color_ = new Color();
  group.userData.set = (state, { hit = false } = {}) => {
    on.target = Number(state);
    if (hit) flash = SWITCH_FX.flash;
  };
  group.userData.update = (dt) => {
    const t = on.step(dt);
    flash = Math.max(0, flash - dt);
    const f = flash / SWITCH_FX.flash;
    const lit = (b) => color_.copy(base).lerp(WHITE, f).multiplyScalar(b + f * 1.5);
    edgeMat.color.copy(lit(bodyBrightness(t)));
    markMat.color.copy(lit(bodyBrightness(t)));
    outerMat.color.copy(markMat.color);
    fillMat.opacity = t;
    fillMat.color.copy(base).multiplyScalar(SWITCH_FX.fill);
    tint.value = glassTint(t) + SWITCH_FX.glassFlash * f;
    body.scale.setScalar(1 + SWITCH_FX.jolt * f);
  };
  group.userData.update(0);
  return group;
}

/**
 * The pressure plate, its tile corner at the origin (floor level).
 * `userData.set(pressed, { partial })` (0..1, see switchLight()); a heavy
 * plate under too little weight is `partial`: it flickers half-lit (D200).
 * @param {number|string} color
 * @param {{ timed?: boolean, heavy?: boolean }} [options] a timed plate (D140): a dashed outer square; a heavy one (D200): a solid square round the bull's-eye
 */
export function createPlate(color, { timed = false, heavy = false } = {}) {
  const base = new Color(color);
  const group = new Group();
  const slab = glassBox([0, 0, 0], [1, SWITCH_FX.slab, 1], base, GLASS.gate);
  const slabTint = slab.material.uniforms.uTint;
  group.add(slab);
  const y = SWITCH_FX.slab + SWITCH_FX.lift;
  const marks = plateMarks(y);
  const line = (segments, material) => {
    const lines = neonLines(segments, material);
    lines.renderOrder = 2;
    group.add(lines);
    return lines;
  };
  const tileMat = lineMaterial({ color: base, width: 2.2, dashed: true });
  const markMat = lineMaterial({ color: base, width: 1.8 });
  const outerMat = timed ? lineMaterial({ color: base, width: 1.8, dashed: true }) : markMat;
  const bracketMat = lineMaterial({ color: base, width: 2.2 });
  line(marks.tile, tileMat);
  line(marks.outer, outerMat);
  // A heavy plate has two squares overlapping in a corner where a plain one has one (D200).
  const pairMat = lineMaterial({ color: base, width: 1.8 });
  if (heavy) for (const square of marks.pair) line([square], pairMat);
  else line(marks.inner, markMat);
  line(marks.brackets, bracketMat);
  const fillMat = glowMaterial(base);
  const fills = heavy ? heavyPairSquares().map(([a, b]) => [(a + b) / 2, b - a]) : [[0.5, 1 - 2 * SWITCH_FX.inner]];
  const fill = new Group();
  for (const [mid, side] of fills) {
    const plane = new Mesh(new PlaneGeometry(side, side), fillMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(mid, y, mid);
    fill.add(plane);
  }
  const spillMat = new MeshBasicMaterial({ vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false });
  group.add(fill, floorSpill(SWITCH_FX.spill, SWITCH_FX.lift, spillMat));

  const on = new Ease();
  let partial = false;
  let time = 0;
  group.userData.set = (pressed, { partial: part = false } = {}) => {
    partial = part && !pressed;
    on.target = Number(pressed);
  };
  group.userData.update = (dt) => {
    time += dt;
    // Too little weight (D200): stutter between dark and half-lit.
    if (partial) on.target = partialLight(time);
    const t = on.step(dt, partial ? SWITCH_FX.partialEase : SWITCH_FX.ease);
    tileMat.color.copy(base).multiplyScalar(bodyBrightness(t));
    markMat.color.copy(base).multiplyScalar(bodyBrightness(t));
    outerMat.color.copy(markMat.color);
    // A heavy plate's two squares show even with nothing on it (D200).
    pairMat.color.copy(base).multiplyScalar(heavy ? Math.max(bodyBrightness(t), SWITCH_FX.heavyOff) : bodyBrightness(t));
    bracketMat.color.copy(base).multiplyScalar(SWITCH_FX.on * t);
    fillMat.opacity = heavy ? Math.max(t, SWITCH_FX.heavyFillOff) : t;
    fillMat.color.copy(base).multiplyScalar(SWITCH_FX.fill);
    spillMat.color.copy(base).multiplyScalar(SWITCH_FX.spillBrightness * t);
    slabTint.value = glassTint(t);
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
 * A socket (D194), its lower corner at the origin: a hole (the hole view
 * draws the pit) framed as a mechanism, a dashed white rim on the tile
 * edge, the plate's corner brackets and white lines fading down its
 * corners into the pit, like a hole's. Filled, the rim turns solid and
 * the plate's bull's-eye lights on the crate's top, flush with the floor.
 * `userData.set(filled)` (0..1).
 * @param {number|string} color
 */
export function createSocket(color) {
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
  const eye = new Group().add(line(marks.outer, markMat), line(marks.inner, markMat));
  line(marks.brackets, bracketMat);
  const drops = fadingDrops([[0, 0], [1, 0], [1, 1], [0, 1]], 0, base, SWITCH_FX.on);
  const fillMat = glowMaterial(base);
  const fill = new Mesh(new PlaneGeometry(1 - 2 * SWITCH_FX.inner, 1 - 2 * SWITCH_FX.inner), fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(0.5, y, 0.5);
  const spillMat = new MeshBasicMaterial({ vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false });
  group.add(drops, eye, fill, floorSpill(SWITCH_FX.spill, y, spillMat));

  const on = new Ease();
  group.userData.set = (filled) => {
    on.target = Number(filled);
  };
  group.userData.update = (dt) => {
    const t = on.step(dt);
    // Off, the rim and brackets show a mechanism; the bull's-eye waits for the crate.
    tileMat.color.copy(base).multiplyScalar(brightness(t));
    bracketMat.color.copy(base).multiplyScalar(brightness(t));
    markMat.color.copy(base).multiplyScalar(SWITCH_FX.on * t);
    eye.visible = t > 0;
    // Filled, there is no pit left to show.
    drops.visible = t < 0.5;
    fillMat.opacity = t;
    fillMat.color.copy(base).multiplyScalar(SWITCH_FX.fill);
    spillMat.color.copy(base).multiplyScalar(SWITCH_FX.spillBrightness * t);
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
 * @param {{ color: number|string, switches: number, access?: number, dark?: number|string }} options switches linked to it (one light
 *   each; 0 for an access lock alone) and the access level it asks for (D101, shown as a Roman numeral in the top corner);
 *   `dark`: the color of a dark glass pane with a frame in `color`, for a door into a star-exit biome (D183)
 */
export function createLock(exit, size, { color, switches, access = 0, dark }) {
  const base = new Color(color);
  const glass = dark === undefined ? base : new Color(dark);
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
  // A thin pane of white glass like the switch gates (GLASS.gate) with an
  // outline, sinking into the threshold (scaled down from its foot, so its
  // parts are relative to y0).
  const barrier = new Group();
  barrier.position.y = y0;
  group.add(barrier);
  const p = (a, h) => point(a, h - y0);
  const [lo, hi] = [p(a0, y0), p(a1, y1)];
  hi[cross] = lo[cross] + (back ? 0.06 : -0.06);
  const span = [0, 1, 2].map((i) => [Math.min(lo[i], hi[i]), Math.max(lo[i], hi[i])]);
  barrier.add(glassBox(span.map(([l]) => l), span.map(([, h]) => h), glass, dark === undefined ? GLASS.gate : { ...GLASS.gate, ...GLASS.darkGate }));
  const m = 0.1;
  const outline = [
    [p(a0 + m, y0 + m), p(a1 - m, y0 + m)],
    [p(a1 - m, y0 + m), p(a1 - m, y1 - m)],
    [p(a1 - m, y1 - m), p(a0 + m, y1 - m)],
    [p(a0 + m, y1 - m), p(a0 + m, y0 + m)],
  ];
  const frame = neonLines(outline, lineMat);
  frame.renderOrder = 3;
  barrier.add(frame);

  // Lights: a small bull's-eye per switch in a row across the middle; the
  // inner square fills for each switch that is on.
  // With both, the numeral sits above the lights.
  const lights = createLockLights(switches, { base, center: [mid, (y0 + y1) / 2], p, along });
  for (const { light } of lights) barrier.add(light);
  // The access level it asks for, a small Roman numeral in the top corner
  // (D101): red while his level is too low, green once it is enough.
  let digits = null;
  if (access > 0) {
    // Filled glowing bars, a hair in front of the barrier's plane.
    const { numeralScale: k, numeralMargin: margin } = SWITCH_FX;
    const bars = romanBars(access, [0, 0], k);
    const xs = bars.flat().map(([a]) => a);
    const top = Math.max(...bars.flat().map(([, h]) => h));
    const shift = [a0 + margin - Math.min(...xs), y1 - margin - top];
    const quads = bars.map((quad) => quad.map(([a, h]) => p(a + shift[0], h + shift[1])));
    const lift = back ? 0.004 : -0.004;
    const positions = quads.flatMap((q) => [q[0], q[1], q[2], q[0], q[2], q[3]]).flatMap((pt) => {
      const out = [...pt];
      out[cross] += lift;
      return out;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const fill = new MeshBasicMaterial({ color: LOCK_RED, side: DoubleSide });
    digits = new Mesh(geometry, fill);
    digits.renderOrder = 4;
    barrier.add(digits);
  }

  const opening = new Ease();
  const levelOk = new Ease();
  group.userData.set = ({ lit = 0, open = false, accessOk = false } = {}) => {
    lights.forEach((light, i) => (light.on.target = i < lit ? 1 : 0));
    levelOk.target = Number(accessOk);
    opening.target = open ? 1 : 0;
  };
  let time = 0;
  group.userData.update = (dt) => {
    time += dt;
    const t = opening.step(dt, SWITCH_FX.open);
    const eased = t * t * (3 - 2 * t);
    const flicker = 1 + SWITCH_FX.flicker * Math.sin(time * 37) * Math.sin(time * 11);
    lineMat.color.copy(base).multiplyScalar(SWITCH_FX.lockBrightness * flicker);
    barrier.scale.y = Math.max(0.001, 1 - eased);
    barrier.visible = eased < 0.99;
    if (digits) digits.material.color.copy(LOCK_RED).lerp(LOCK_GREEN, levelOk.step(dt)).multiplyScalar(SWITCH_FX.numeralBrightness);
    for (const { light, mat, fillMat, on } of lights) {
      const l = on.step(dt);
      // Glowing red while locked, green once its switch is on.
      mat.color.copy(LOCK_RED).lerp(LOCK_GREEN, l).multiplyScalar(brightness(l));
      fillMat.color.copy(LOCK_RED).lerp(LOCK_GREEN, l).multiplyScalar(SWITCH_FX.fill);
    }
    group.userData.openness = eased;
  };
  group.userData.update(0);
  return group;
}

/**
 * A lock's lights, a small bull's-eye per switch in a row centered on
 * `center`, each with its own brightness ease (see createLock()).
 * @param {number} count switches linked to the lock
 * @param {object} at
 * @param {Color} at.base the lock's color
 * @param {number[]} at.center [a, h]: along the side, and height
 * @param {(a: number, h: number) => number[]} at.p a point on the lock's plane
 * @param {0|2} at.along the axis along the side
 */
function createLockLights(count, { base, center: [mid, lightH], p, along }) {
  const lights = [];
  const s = SWITCH_FX.light;
  const r = (s * (1 - 2 * SWITCH_FX.inner)) / (1 - 2 * SWITCH_FX.outer);
  for (let i = 0; i < count; i++) {
    const a = mid + (i - (count - 1) / 2) * SWITCH_FX.lightGap;
    const box = (k) => [
      [p(a - k, lightH - k), p(a + k, lightH - k)],
      [p(a + k, lightH - k), p(a + k, lightH + k)],
      [p(a + k, lightH + k), p(a - k, lightH + k)],
      [p(a - k, lightH + k), p(a - k, lightH - k)],
    ];
    const mat = lineMaterial({ color: LOCK_RED, width: 1.6 });
    const outline = neonLines([...box(s), ...box(r)], mat);
    outline.renderOrder = 4;
    const fillMat = glowMaterial(LOCK_RED);
    fillMat.opacity = 1;
    const fill = new Mesh(new PlaneGeometry(2 * r, 2 * r), fillMat);
    fill.position.set(...p(a, lightH));
    if (along === 2) fill.rotation.y = Math.PI / 2;
    fill.renderOrder = 4;
    lights.push({ light: new Group().add(outline, fill), mat, fillMat, on: new Ease() });
  }
  return lights;
}

/** A target in the room (entities/switch.js): a bolt switching it makes it flash. */
export class TargetView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/switch.js').Target} target
   */
  constructor(game, target) {
    this.target = target;
    this.group = createTarget(target.object.color, { timed: target.timed });
    this.group.position.set(...target.pos);
    this.hits = target.hits ?? 0;
    this.time = 0;
    this.group.userData.set(target.on);
  }

  /**
   * @param {number} alpha unused: it never moves
   * @param {number} [dt] seconds since the last frame
   */
  sync(alpha, dt = 0) {
    this.time += dt;
    // A bolt hitting it flashes it (a timed one going off by itself does not).
    const hits = this.target.hits ?? 0;
    const hit = hits !== this.hits;
    this.hits = hits;
    this.group.userData.set(switchLight(this.target.on, this.target.countdown ?? null, this.time), { hit });
    this.group.userData.update(dt);
  }
}

/** A plate in the room: lit while pressed. */
export class PlateView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/switch.js').Plate} plate
   */
  constructor(game, plate) {
    this.plate = plate;
    this.group = createPlate(plate.object.color, { timed: plate.timed, heavy: plate.weight > 1 });
    this.group.position.set(...plate.pos);
    this.time = 0;
  }

  /**
   * @param {number} alpha unused: it never moves
   * @param {number} [dt] seconds since the last frame
   */
  sync(alpha, dt = 0) {
    this.time += dt;
    this.group.userData.set(switchLight(this.plate.on, this.plate.countdown ?? null, this.time), { partial: this.plate.partial });
    this.group.userData.update(dt);
  }
}

/** A socket in the room (D194): lit while a crate fills its hole. */
export class SocketView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/switch.js').Socket} socket
   */
  constructor(game, socket) {
    this.socket = socket;
    this.group = createSocket(socket.object.color);
    this.group.position.set(...socket.pos);
  }

  /**
   * @param {number} alpha unused: it never moves
   * @param {number} [dt] seconds since the last frame
   */
  sync(alpha, dt = 0) {
    this.group.userData.set(this.socket.on);
    this.group.userData.update(dt);
  }
}

/**
 * A number in Roman numerals (1–15: I … XV).
 * @param {number} value
 */
export function romanNumeral(value) {
  const tens = 'X'.repeat(Math.floor(value / 10));
  const ones = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][value % 10];
  return tens + ones;
}

/**
 * The access level as a thick Roman numeral (pure), centered on `center`
 * in a lock's plane: filled bars as quads of [a, h] corners (a along the
 * side, h up). The letters stand between a bar across the top and one
 * across the bottom, as on a clock face, so a lone I reads as a numeral.
 * @param {number} value 1–15
 * @param {number[]} center [a, h]
 * @param {number} [scale] size factor (1 = full size)
 * @returns {number[][][]} quads, 4 corners each
 */
export function romanBars(value, [a, h], scale = 1) {
  const { numeral, stroke, letter, letterGap, serif: serifFull } = SWITCH_FX;
  const [height, t, w, gap, serif] = [numeral, stroke, letter, letterGap, serifFull].map((v) => v * scale);
  const letters = [...romanNumeral(value)];
  const widths = letters.map((letter) => (letter === 'I' ? t : w));
  const total = widths.reduce((sum, x) => sum + x, 0) + gap * (letters.length - 1);
  const [top, bottom] = [h + height / 2, h - height / 2];
  // A bar from (a0, h0) to (a1, h1), `t` thick across its length.
  const bar = ([a0, h0], [a1, h1], thick = t) => {
    const len = Math.hypot(a1 - a0, h1 - h0);
    const [na, nh] = [(-(h1 - h0) / len) * (thick / 2), ((a1 - a0) / len) * (thick / 2)];
    return [[a0 + na, h0 + nh], [a1 + na, h1 + nh], [a1 - na, h1 - nh], [a0 - na, h0 - nh]];
  };
  const quads = [];
  let x = a - total / 2;
  letters.forEach((letter, i) => {
    const [x0, x1] = [x, x + widths[i]];
    const inner = [top - serif, bottom + serif];
    if (letter === 'I') quads.push(bar([(x0 + x1) / 2, inner[1]], [(x0 + x1) / 2, inner[0]]));
    if (letter === 'V') quads.push(bar([x0 + t / 2, inner[0]], [(x0 + x1) / 2, inner[1]]), bar([(x0 + x1) / 2, inner[1]], [x1 - t / 2, inner[0]]));
    if (letter === 'X') quads.push(bar([x0 + t / 2, inner[0]], [x1 - t / 2, inner[1]]), bar([x0 + t / 2, inner[1]], [x1 - t / 2, inner[0]]));
    x = x1 + gap;
  });
  const ends = [a - total / 2 - serif, a + total / 2 + serif];
  quads.push(bar([ends[0], top - serif / 2], [ends[1], top - serif / 2], serif), bar([ends[0], bottom + serif / 2], [ends[1], bottom + serif / 2], serif));
  return quads;
}

/** A locked exit of the room (Game.locks): its barrier, one light per switch linked to it (D140) and the access level it asks for. */
export class LockView {
  /**
   * @param {import('../game.js').Game} game
   * @param {{ exit: object, open: boolean }} lock
   */
  constructor(game, lock) {
    this.game = game;
    this.lock = lock;
    const { exit } = lock;
    // A door into a star-exit biome (D183, the Outer Buffer): dark glass in that biome's color, its frame brighter.
    const biome = game.destinationBiome(exit);
    const dark = roomLook(biome.look).starExits;
    const color = dark ? biome.color : game.switches[0]?.object.color ?? game.content.objectTypes.target?.color ?? 0xffffff;
    this.group = createLock(exit, game.room.size, {
      color,
      switches: exit.locked ? linkedSwitches(game, exit.switches).length : 0,
      access: exit.access ?? 0,
      dark: dark ? new Color(biome.color).multiplyScalar(0.28) : undefined,
    });
    this.sync(0);
  }

  /** How far it has opened, 0..1. */
  get openness() {
    return this.group.userData.openness;
  }

  /** @param {number} dt seconds since the last frame */
  sync(dt) {
    const { exit } = this.lock;
    this.group.userData.set({
      lit: switchesOn(this.game, exit.switches),
      open: this.lock.open,
      accessOk: this.game.progress.accessLevel >= (exit.access ?? 0),
    });
    this.group.userData.update(dt);
  }
}
