/**
 * A jump pad (D221, look D226): a trampoline in the room's color: a low
 * glass rim round a taut mesh of light over a dark sheet, with short
 * streaks of light rising off it. Idle, the mesh breathes and a faint
 * ripple crosses it now and then; a launch presses it down and it rebounds
 * past flat and rings out, flashing, the streaks shooting up, as it throws
 * the wizard up.
 *
 * It is room color on purpose: magenta is the wizard's (D98) and belongs to
 * the backup shrine, which this pad used to resemble (square outline, corner
 * light, a square ring floating up). The pad has no rune, no beams, no
 * rings and no motes; its mesh and rim are its own. Reviewed in the asset
 * showcase (`?asset=pad`).
 *
 * The mesh's shape is pure (meshHeight(), meshPositions()); createPad()
 * animates it, writing the points into buffers it keeps (no new geometry
 * per frame).
 */
import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { insetSquare } from './edges.js';
import { glassBoxes } from './glass.js';
import { lineMaterial, neonLines } from './neon.js';

/** Tuning (units, seconds). */
export const PAD_FX = {
  /** The rim: its height, its width and the mesh's height inside it. */
  rim: 0.1,
  rimWidth: 0.1,
  sheet: 0.035,
  /** The mesh: lines each way and segments per line. */
  lines: 5,
  steps: 8,
  /** Idle breathing: amplitude and seconds per breath. */
  breath: 0.012,
  breathTime: 2.2,
  /** Idle ripple: seconds between, amplitude, how fast it runs out. */
  rippleEvery: 3.2,
  rippleAmp: 0.022,
  rippleTime: 1.4,
  /** A launch: the press (how deep), how fast it rings, how fast it dies, seconds shown. */
  press: 0.17,
  ring: 17,
  damp: 5,
  flash: 0.5,
  /** Rising streaks: how many, their length, how high they go, seconds to rise, brightness. */
  streaks: 6,
  streakLength: 0.3,
  reach: 1.7,
  streakTime: 1.3,
  streakGlow: 1.8,
  /** Line brightness: rim, mesh idle, extra on a launch. */
  glow: 1.4,
  meshGlow: 2.1,
  flashGlow: 1.2,
};

/** The pad's glass: the room's color, clearer and less milky than a switch's. */
const PAD_GLASS = { alpha: 0.5, tint: 0.4, milk: 0.15 };

/**
 * Height of the mesh at (x, z) of the cell, `time` seconds in and `since`
 * seconds after a launch (pure): 0 at the rim, a bowl in the middle, plus an
 * idle breath and ripple, and the press and rebound of a launch.
 * @param {number} x 0..1 across the cell
 * @param {number} z 0..1 across the cell
 * @param {number} time seconds
 * @param {number} [since] seconds since the last launch (Infinity: not lately)
 * @returns {number} height above the mesh's rest height
 */
function meshHeight(x, z, time, since = Infinity) {
  const half = 0.5 - PAD_FX.rimWidth;
  const u = (x - 0.5) / half;
  const v = (z - 0.5) / half;
  // 1 in the middle, 0 at the rim: the membrane is pinned there.
  const bowl = Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v);
  const breath = PAD_FX.breath * Math.sin((2 * Math.PI * time) / PAD_FX.breathTime);
  const wave = time % PAD_FX.rippleEvery;
  const dist = Math.hypot(u, v);
  const ripple =
    wave < PAD_FX.rippleTime
      ? PAD_FX.rippleAmp * Math.sin(10 * dist - 9 * wave) * (1 - wave / PAD_FX.rippleTime) * Math.max(0, 1 - dist * 0.6)
      : 0;
  const rebound = since < 2 ? -PAD_FX.press * Math.exp(-PAD_FX.damp * since) * Math.cos(PAD_FX.ring * since) : 0;
  return bowl * (breath + rebound) + ripple * bowl;
}

/** Points of the mesh: `lines` lines each way, `steps` segments each, two points per segment. */
const MESH_POINTS = PAD_FX.lines * PAD_FX.steps * 4;

/**
 * The mesh's line segments at the given moment, written into `out` (pure
 * but for `out`): `lines` lines along x and along z across the open middle,
 * each cut into `steps` pieces.
 * @param {Float32Array} out MESH_POINTS × 3 numbers, two points per segment
 * @param {number} time seconds
 * @param {number} [since] seconds since the last launch
 * @returns {Float32Array} `out`
 */
function meshPositions(out, time, since = Infinity) {
  const { lines, steps, rimWidth, sheet } = PAD_FX;
  const [a, b] = [rimWidth, 1 - rimWidth];
  let k = 0;
  const point = (x, z) => {
    out[k++] = x;
    out[k++] = sheet + meshHeight(x, z, time, since);
    out[k++] = z;
  };
  for (let i = 0; i < lines; i++) {
    const fixed = a + ((b - a) * i) / (lines - 1);
    for (let s = 0; s < steps; s++) {
      const [p, q] = [a + ((b - a) * s) / steps, a + ((b - a) * (s + 1)) / steps];
      point(p, fixed);
      point(q, fixed);
      point(fixed, p);
      point(fixed, q);
    }
  }
  return out;
}

/** Tell the GPU a line set's points (and colors) changed in place. */
function linesChanged(line) {
  line.geometry.getAttribute('instanceStart').data.needsUpdate = true;
  const colors = line.geometry.getAttribute('instanceColorStart');
  if (colors) colors.data.needsUpdate = true;
}

/**
 * A pad's look, at the origin (the lower corner of its cell). Five draws:
 * the rim's glass (instanced), the dark sheet, the rim's lines, the mesh and
 * the streaks; mesh and streaks move by rewriting their points in place.
 * @param {number|string|Color} color the room's color
 * @returns {Group} with `userData.update(dt)` and `userData.launch()` (it threw him up)
 */
export function createPad(color) {
  const base = new Color(color);
  const group = new Group();
  const { rim, rimWidth: w } = PAD_FX;
  // The rim: four glass strips round the mesh, one draw, with a neon edge on top.
  const strips = [
    [[0, 0, 0], [1, rim, w]],
    [[0, 0, 1 - w], [1, rim, 1]],
    [[0, 0, w], [w, rim, 1 - w]],
    [[1 - w, 0, w], [1, rim, 1 - w]],
  ];
  group.add(glassBoxes(strips, base, PAD_GLASS));
  const rimMat = lineMaterial({ color: base, width: 2.4, brightness: PAD_FX.glow });
  const rimLines = neonLines([...insetSquare(0.02, rim + 0.003), ...insetSquare(w, rim + 0.003)], rimMat);
  rimLines.renderOrder = 2;
  // The mesh: its points live in one buffer, rewritten each frame.
  const meshMat = lineMaterial({ color: base, width: 3, brightness: PAD_FX.meshGlow });
  const meshPoints = new Float32Array(MESH_POINTS * 3);
  const mesh = new LineSegments2(new LineSegmentsGeometry().setPositions(meshPoints), meshMat);
  mesh.renderOrder = 2;
  // A dark sheet under the mesh (a very dark tint, not black: black is a pit,
  // D99) so the grid stands out from the floor's own lines.
  const dark = new Mesh(
    new PlaneGeometry(1 - 2 * w, 1 - 2 * w),
    new MeshBasicMaterial({ color: base.clone().multiplyScalar(0.05), side: DoubleSide }),
  );
  dark.rotation.x = -Math.PI / 2;
  dark.position.set(0.5, 0.012, 0.5);

  // Streaks: short bright dashes rising off the mesh, each at its own place
  // and phase, one line set whose points and colors are rewritten each frame.
  const streaks = Array.from({ length: PAD_FX.streaks }, (_, i) => ({
    x: 0.3 + 0.4 * ((i * 0.618034 + 0.2) % 1),
    z: 0.3 + 0.4 * ((i * 0.381966 + 0.5) % 1),
    phase: (i * 0.618034) % 1,
  }));
  const streakMat = lineMaterial({ color: base, width: 2.2, brightness: PAD_FX.streakGlow });
  streakMat.vertexColors = true;
  const streakPoints = new Float32Array(PAD_FX.streaks * 6);
  const streakColors = new Float32Array(PAD_FX.streaks * 6);
  const streakLines = new LineSegments2(new LineSegmentsGeometry().setPositions(streakPoints).setColors(streakColors), streakMat);
  streakLines.renderOrder = 2;
  // Both move within the pad's cell and the streaks' reach; the bounds
  // computed from their first points would be wrong, so they are never
  // culled (a room always fits the view anyway).
  mesh.frustumCulled = false;
  streakLines.frustumCulled = false;
  group.add(dark, rimLines, mesh, streakLines);

  let time = 0;
  let since = Infinity;
  group.userData.launch = () => {
    since = 0;
  };
  group.userData.update = (dt) => {
    time += dt;
    since += dt;
    meshPositions(meshPoints, time, since);
    const lit = since < PAD_FX.flash ? 1 - since / PAD_FX.flash : 0;
    rimMat.color.copy(base).multiplyScalar(PAD_FX.glow * (1 + PAD_FX.flashGlow * lit));
    meshMat.color.copy(base).multiplyScalar(PAD_FX.meshGlow * (1 + PAD_FX.flashGlow * 1.5 * lit));
    streakMat.color.copy(base).multiplyScalar(PAD_FX.streakGlow * (1 + PAD_FX.flashGlow * lit));
    // A launch sends them up faster and brighter.
    const speed = 1 + 2 * lit;
    streaks.forEach((streak, i) => {
      streak.phase = (streak.phase + (dt * speed) / PAD_FX.streakTime) % 1;
      const t = streak.phase;
      const y = PAD_FX.sheet + t * PAD_FX.reach;
      streakPoints.set([streak.x, y, streak.z, streak.x, y + PAD_FX.streakLength, streak.z], i * 6);
      streakColors.fill(Math.min(1, t * 6) * (1 - t), i * 6, i * 6 + 6);
    });
    linesChanged(mesh);
    linesChanged(streakLines);
  };
  group.userData.update(0);
  return group;
}

/** A jump pad in the room, in the room's color. */
export class PadView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/pad.js').Pad} pad
   */
  constructor(game, pad) {
    this.pad = pad;
    this.group = createPad(game.room?.color ?? pad.object.color);
    this.group.position.set(...pad.pos);
    this.launches = pad.launches;
  }

  /**
   * @param {number} alpha unused: it never moves
   * @param {number} [dt] seconds since the last frame
   */
  sync(alpha, dt = 0) {
    if (this.pad.launches !== this.launches) this.group.userData.launch();
    this.launches = this.pad.launches;
    this.group.userData.update(dt);
  }
}
