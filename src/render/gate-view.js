/**
 * Gate blocks (D140, D141), one look language for both triggers: going,
 * the block sinks into its cell's floor; coming back, it rises. Gone, a
 * dim dashed outline shows where it will rise again: for a collapsing
 * block that will, in play and in the room editor; for a switch gate only
 * in the room editor (in play a switched-off block is not shown at all).
 *
 * - Switch gates and bridges: a white glass box (D99 white is a mechanism;
 *   glassBox() with GLASS.gate, D116) with neon edges and a small bull's-eye
 *   light on top of a stack per switch that powers it, lit for each one
 *   on (like a lock's lights).
 * - Bridges (look `sheet`, D224): a single sheet of the same white glass,
 *   flush with its cell's floor, outlined round its top, with the same
 *   lights; it grows out of its middle as it comes and shrinks back as it
 *   goes, and its dashed outline is a square on the floor.
 * - Step gates (collapsing blocks, D47): the block type's own look
 *   (room color, dashed edges, tinted faces); stood on, it rattles harder
 *   and harder (gateShake()) before it sinks.
 *
 * `userData.set({ closed, lit, shake, outline })` and `userData.update(dt)`;
 * states ease in. Reviewed in the asset showcase (`?asset=gates`,
 * `?asset=collapsing-cycle`).
 */
import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { blockEdges } from './edges.js';
import { createCageBody } from './cage-view.js';
import { glassBox, GLASS } from './glass.js';
import { lineMaterial, neonLines } from './neon.js';
import { SLAB_HEIGHT } from '../world/grid.js';
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
 * @param {object|null} [options.style] a step gate's object style (edges, faces, tint...); null: a switch gate's white glass
 * @param {number} [options.lights] switches that power it (one light each on top)
 * @param {boolean} [options.closed] solid to start with
 * @param {boolean} [options.cage] a cage (D202): bars of light, no faces, in `color`
 * @param {boolean} [options.sheet] a bridge's sheet (D224): flat, flush with the cell's floor
 */
export function createGate(color, { style = null, lights = 0, closed = true, cage = false, sheet = false } = {}) {
  const base = new Color(color);
  const group = new Group();
  // The block, scaled down from its foot as it sinks; `shaker` rattles it.
  const shaker = new Group();
  const body = new Group();
  shaker.add(body);
  group.add(shaker);
  const edgeMat = lineMaterial({ color: base, width: 2.5 });
  // A sheet is drawn just over its cell's floor, so the floor grid round a hole doesn't flicker through it.
  const lift = 0.004;
  // A sheet grows out of its middle: its body is centered on the cell's.
  if (sheet) body.position.set(0.5, 0, 0.5);
  if (style) body.add(createObjectView({ ...style, color, at: [0, 0, 0] }));
  else if (cage) body.add(createCageBody(base));
  else if (sheet) {
    body.add(glassBox([-0.5, lift - SLAB_HEIGHT, -0.5], [0.5, lift, 0.5], base, GLASS.gate));
    const edges = neonLines(squareAt(0, lift, 0.5), edgeMat);
    edges.renderOrder = 2;
    body.add(edges);
  }
  else {
    body.add(glassBox([0, 0, 0], [1, 1, 1], base, GLASS.gate));
    const edges = neonLines(blockEdges([[0, 0, 0]]), edgeMat);
    edges.renderOrder = 2;
    body.add(edges);
  }
  // The lights on top: an outline square each, filling with light when its switch is on.
  const { light: s } = GATE_FX;
  const r = (s * (1 - 2 * SWITCH_FX.inner)) / (1 - 2 * SWITCH_FX.outer);
  const top = sheet ? lift + 0.002 : 1.002;
  // On a sheet the body's origin is the cell's middle.
  const at = ([x, z]) => (sheet ? [x - 0.5, z - 0.5] : [x, z]);
  const square = ([x, z], k) => [
    [[x - k, top, z - k], [x + k, top, z - k]],
    [[x + k, top, z - k], [x + k, top, z + k]],
    [[x + k, top, z + k], [x - k, top, z + k]],
    [[x - k, top, z + k], [x - k, top, z - k]],
  ];
  const lightMat = lineMaterial({ color: base, width: 1.5 });
  const spots = gateLightSpots(lights).map(at);
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
  // Where it rises again: a dim dashed outline of its cell (a sheet's square on the floor).
  const ghostMat = lineMaterial({ color: base, width: 1.5, dashed: true });
  const ghost = neonLines(sheet ? squareAt(0.5, lift, 0.5, 0.5) : blockEdges([[0, 0, 0]]), ghostMat);
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
    if (sheet) body.scale.set(Math.max(0.001, eased), 1, Math.max(0.001, eased));
    else body.scale.y = Math.max(0.001, eased);
    body.visible = eased > 0.01;
    edgeMat.color.copy(base).multiplyScalar(GATE_FX.edges);
    lightMat.color.copy(base).multiplyScalar(SWITCH_FX.off);
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
 * The four sides of a square at height `y`, centered on [c, cz] with half
 * size `k`: a sheet's outline (D224).
 */
function squareAt(c, y, k, cz = c) {
  return [
    [[c - k, y, cz - k], [c + k, y, cz - k]],
    [[c + k, y, cz - k], [c + k, y, cz + k]],
    [[c + k, y, cz + k], [c - k, y, cz + k]],
    [[c - k, y, cz + k], [c - k, y, cz - k]],
  ];
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
   * @param {{ editing?: boolean }} [options] shown in the room editor
   */
  constructor(game, gate, { editing = false } = {}) {
    this.gate = gate;
    /** In the room editor a gone switch gate shows its outline; in play it is not shown at all. */
    this.editing = editing;
    const switched = gate.trigger === 'switch';
    this.linked = switched && game && showsLights(gate, game.objects) ? linkedSwitches(game, gate.switches) : [];
    const { object } = gate;
    this.group = createGate(object.color, { style: switched ? null : { ...object, kind: 'gate' }, lights: this.linked.length, closed: gate.state !== 'gone', cage: object.look === 'cage', sheet: object.look === 'sheet' });
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
      outline: gate.trigger === 'switch' ? this.editing : gate.returns,
    });
    this.group.userData.update(dt);
  }
}
