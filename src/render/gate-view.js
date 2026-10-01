/**
 * Gate blocks (D140, D141), one look language for both triggers: going,
 * the block sinks into its cell's floor; gone, a dim dashed outline shows
 * where it will rise again (only if it will); coming back, it rises.
 *
 * - Switch gates and bridges: a white mechanism block (D99) with bars
 *   across the two sides the camera sees (D115) and a small bull's-eye
 *   light on top of a stack per switch that powers it, lit for each one
 *   on (like a lock's lights). A bridge looks the same.
 * - Step gates (collapsing blocks, D47): the block type's own look
 *   (room color, dashed edges, tinted faces); stood on, it rattles harder
 *   and harder (gateShake()) before it sinks.
 *
 * `userData.set({ closed, lit, shake, outline })` and `userData.update(dt)`;
 * states ease in. Reviewed in the asset showcase (`?asset=gates`,
 * `?asset=collapsing-cycle`).
 */
import { BoxGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { blockEdges } from './edges.js';
import { faceMaterial, lineMaterial, neonLines, shared, PALETTE } from './neon.js';
import { createObjectView } from './room-view.js';
import { SWITCH_FX } from './switch-view.js';
import { GATE } from '../entities/gate.js';
import { linkedSwitches } from '../switches.js';

/** Tuning (units, seconds, brightness). */
export const GATE_FX = {
  /** Seconds to sink or rise. */
  move: 0.25,
  /** Edge and bar brightness of the block. */
  edges: 1.6,
  /** Brightness of the dashed outline while open. */
  ghost: 0.45,
  /** Heights of the bars across a side face. */
  bars: [0.3, 0.5, 0.7],
  /** How far the bars stay in from the face's edges. */
  inset: 0.15,
  /** Top lights: half size of the outer square, gap between lights. */
  light: 0.07,
  lightGap: 0.2,
  /** A step gate's sideways rattle at the start and at the end of its shaking. */
  shakeFrom: 0.015,
  shakeTo: 0.07,
};

/**
 * A step gate's rattle this frame (pure, tested): [x, 0, z] off its cell,
 * growing while it shakes; none in any other state.
 * @param {{ state: string, timer: number }} gate see entities/gate.js
 * @param {number} alpha interpolation factor 0..1 between the last two ticks
 */
export function gateShake({ state, timer }, alpha) {
  if (state !== 'shake') return [0, 0, 0];
  // Two out-of-step wobbles, so it rattles rather than swings.
  const tick = timer + alpha;
  const t = Math.min(tick / GATE.shakeTicks, 1);
  const amount = GATE_FX.shakeFrom + (GATE_FX.shakeTo - GATE_FX.shakeFrom) * t;
  return [amount * Math.sin(tick * 2.1), 0, amount * Math.sin(tick * 2.9 + 1)];
}

const UNIT_BOX = shared(new BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5));
const FACE = new Color(PALETTE.face);

/**
 * The bars on the +x and +z faces of the unit cube (pure, tested).
 * @returns {number[][][]} segments
 */
export function gateBars() {
  const { bars, inset } = GATE_FX;
  const segments = [];
  for (const h of bars) {
    segments.push([[1, h, inset], [1, h, 1 - inset]]);
    segments.push([[inset, h, 1], [1 - inset, h, 1]]);
  }
  return segments;
}

/**
 * Centers [x, z] of the lights on a gate's top, a row along x (pure, tested).
 * @param {number} count
 * @returns {number[][]}
 */
export function gateLightSpots(count) {
  return Array.from({ length: count }, (_, i) => [0.5 + (i - (count - 1) / 2) * GATE_FX.lightGap, 0.5]);
}

/** An eased 0..1 value. */
function ease(value, target, dt, time) {
  const step = Math.min(1, dt / time);
  return value + Math.sign(target - value) * Math.min(Math.abs(target - value), step);
}

/**
 * A gate block, its lower corner at the origin.
 * @param {number|string} color
 * @param {object} [options]
 * @param {object|null} [options.style] a step gate's object style (edges, faces, tint...); null: a switch gate's barred look
 * @param {number} [options.lights] switches that power it (one light each on top)
 * @param {boolean} [options.closed] solid to start with
 */
export function createGate(color, { style = null, lights = 0, closed = true } = {}) {
  const base = new Color(color);
  const group = new Group();
  // The block, scaled down from its foot as it sinks; `shaker` rattles it.
  const shaker = new Group();
  const body = new Group();
  shaker.add(body);
  group.add(shaker);
  const faces = [faceMaterial(), faceMaterial(), faceMaterial()];
  const edgeMat = lineMaterial({ color: base, width: 2.5 });
  const barMat = lineMaterial({ color: base, width: 1.8 });
  if (style) body.add(createObjectView({ ...style, color, at: [0, 0, 0] }));
  else {
    body.add(new Mesh(UNIT_BOX, [faces[1], faces[1], faces[0], faces[0], faces[2], faces[2]]));
    for (const line of [neonLines(blockEdges([[0, 0, 0]]), edgeMat), neonLines(gateBars(), barMat)]) {
      line.renderOrder = 2;
      body.add(line);
    }
  }
  // The lights on top: an outline square each, filling with light when its switch is on.
  const { light: s } = GATE_FX;
  const r = (s * (1 - 2 * SWITCH_FX.inner)) / (1 - 2 * SWITCH_FX.outer);
  const top = 1.002;
  const square = ([x, z], k) => [
    [[x - k, top, z - k], [x + k, top, z - k]],
    [[x + k, top, z - k], [x + k, top, z + k]],
    [[x + k, top, z + k], [x - k, top, z + k]],
    [[x - k, top, z + k], [x - k, top, z - k]],
  ];
  const lightMat = lineMaterial({ color: base, width: 1.5 });
  const spots = gateLightSpots(lights);
  if (spots.length > 0) {
    const outlines = neonLines(spots.flatMap((spot) => [...square(spot, s), ...square(spot, r)]), lightMat);
    outlines.renderOrder = 3;
    body.add(outlines);
  }
  const fills = spots.map(([x, z]) => {
    const material = new MeshBasicMaterial({ color: base, side: DoubleSide, transparent: true, opacity: 0, depthWrite: false });
    const fill = new Mesh(new PlaneGeometry(2 * r, 2 * r), material);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(x, top, z);
    fill.renderOrder = 3;
    body.add(fill);
    return { material, value: 0, target: 0 };
  });
  // Where it rises again: a dim dashed outline of its cell.
  const ghostMat = lineMaterial({ color: base, width: 1.5, dashed: true });
  const ghost = neonLines(blockEdges([[0, 0, 0]]), ghostMat);
  group.add(ghost);

  let shut = closed ? 1 : 0;
  let shutTarget = shut;
  let outlined = true;
  group.userData.set = ({ closed: isClosed = true, lit = 0, shake = [0, 0, 0], outline = true } = {}) => {
    shutTarget = isClosed ? 1 : 0;
    fills.forEach((fill, i) => (fill.target = i < lit ? 1 : 0));
    shaker.position.set(...shake);
    outlined = outline;
  };
  group.userData.update = (dt) => {
    shut = ease(shut, shutTarget, dt, GATE_FX.move);
    const eased = shut * shut * (3 - 2 * shut);
    body.scale.y = Math.max(0.001, eased);
    body.visible = eased > 0.01;
    edgeMat.color.copy(base).multiplyScalar(GATE_FX.edges);
    barMat.color.copy(base).multiplyScalar(GATE_FX.edges);
    lightMat.color.copy(base).multiplyScalar(SWITCH_FX.off);
    [1, 0.6, 0.4].forEach((share, i) => faces[i].color.copy(FACE).lerp(base, 0.12 * share));
    for (const fill of fills) {
      fill.value = ease(fill.value, fill.target, dt, SWITCH_FX.ease);
      fill.material.opacity = fill.value;
      fill.material.color.copy(base).multiplyScalar(SWITCH_FX.fill);
    }
    ghostMat.color.copy(base).multiplyScalar(GATE_FX.ghost * (1 - eased));
    ghost.visible = outlined && eased < 0.99;
    group.userData.closedness = eased;
  };
  group.userData.update(0);
  return group;
}

/**
 * Does a switch gate show its lights: on the top of a stack only (no
 * switch gate right above it), so a wall of gates isn't covered in them.
 * @param {{ pos: number[] }} gate
 * @param {{ kind: string, trigger?: string, pos: number[] }[]} objects the room's objects
 */
export function showsLights(gate, objects) {
  const [x, y, z] = gate.pos;
  return !objects.some((o) => o.kind === 'gate' && o.trigger === 'switch' && o.pos[0] === x && o.pos[1] === y + 1 && o.pos[2] === z);
}

/** A gate block in the room (entities/gate.js): a switch gate, a bridge or a step gate. */
export class GateView {
  /**
   * @param {import('../game.js').Game|null} game null in the showcase (no lights)
   * @param {import('../entities/gate.js').Gate} gate (or anything with its `trigger`, `state`, `timer`, `returns`, `pos` and `object`)
   */
  constructor(game, gate) {
    this.gate = gate;
    const switched = gate.trigger === 'switch';
    this.linked = switched && game && showsLights(gate, game.objects) ? linkedSwitches(game, gate.switches) : [];
    const { object } = gate;
    this.group = createGate(object.color, { style: switched ? null : { ...object, kind: 'gate' }, lights: this.linked.length, closed: gate.state !== 'gone' });
    this.group.position.set(...gate.pos);
  }

  /**
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} [dt] seconds since the last frame
   */
  sync(alpha, dt = 0) {
    const { gate } = this;
    this.group.userData.set({
      closed: gate.state !== 'gone',
      lit: this.linked.filter((object) => object.on).length,
      shake: gateShake(gate, alpha),
      outline: gate.returns,
    });
    this.group.userData.update(dt);
  }
}
