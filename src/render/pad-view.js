/**
 * A jump pad (D221, look D225): a trampoline in the room's color: a low
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
 * animates it.
 */
import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { glassBox } from './glass.js';
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
export function meshHeight(x, z, time, since = Infinity) {
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

/**
 * The mesh's line segments at the given moment (pure): `lines` lines along
 * x and along z across the open middle, each cut into `steps` pieces.
 * @param {number} time seconds
 * @param {number} [since] seconds since the last launch
 * @returns {number[]} flat positions, two points per segment
 */
export function meshPositions(time, since = Infinity) {
  const { lines, steps, rimWidth, sheet } = PAD_FX;
  const [a, b] = [rimWidth, 1 - rimWidth];
  const out = [];
  const point = (x, z) => out.push(x, sheet + meshHeight(x, z, time, since), z);
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

/** A square outline inset `m` from the unit cell's edges, at height y. */
function square(m, y) {
  const [a, b] = [m, 1 - m];
  const c = [[a, y, a], [b, y, a], [b, y, b], [a, y, b]];
  return c.map((p, i) => [p, c[(i + 1) % 4]]);
}

/**
 * A pad's look, at the origin (the lower corner of its cell).
 * @param {number|string|Color} color the room's color
 * @returns {Group} with `userData.update(dt)` and `userData.launch()` (it threw him up)
 */
export function createPad(color) {
  const base = new Color(color);
  const group = new Group();
  const { rim, rimWidth: w } = PAD_FX;
  // The rim: four glass strips round the mesh, with a neon edge on top.
  group.add(
    glassBox([0, 0, 0], [1, rim, w], base, PAD_GLASS),
    glassBox([0, 0, 1 - w], [1, rim, w], base, PAD_GLASS),
    glassBox([0, 0, w], [w, rim, 1 - 2 * w], base, PAD_GLASS),
    glassBox([1 - w, 0, w], [w, rim, 1 - 2 * w], base, PAD_GLASS),
  );
  const rimMat = lineMaterial({ color: base, width: 2.4, brightness: PAD_FX.glow });
  const rimLines = neonLines([...square(0.02, rim + 0.003), ...square(w, rim + 0.003)], rimMat);
  rimLines.renderOrder = 2;
  const meshMat = lineMaterial({ color: base, width: 3, brightness: PAD_FX.meshGlow });
  const mesh = neonLines([], meshMat);
  mesh.renderOrder = 2;
  // A dark sheet under the mesh (a very dark tint, not black: black is a pit,
  // D99) so the grid stands out from the floor's own lines.
  const dark = new Mesh(
    new PlaneGeometry(1 - 2 * w, 1 - 2 * w),
    new MeshBasicMaterial({ color: base.clone().multiplyScalar(0.05), side: DoubleSide }),
  );
  dark.rotation.x = -Math.PI / 2;
  dark.position.set(0.5, 0.012, 0.5);
  group.add(dark, rimLines, mesh);

  // Streaks: short bright dashes rising off the mesh, each at its own place and phase.
  const streaks = Array.from({ length: PAD_FX.streaks }, (_, i) => {
    const x = 0.3 + 0.4 * ((i * 0.618034 + 0.2) % 1);
    const z = 0.3 + 0.4 * ((i * 0.381966 + 0.5) % 1);
    const material = lineMaterial({ color: base, width: 2.2, brightness: PAD_FX.streakGlow });
    const line = neonLines([[[x, 0, z], [x, PAD_FX.streakLength, z]]], material);
    line.renderOrder = 2;
    group.add(line);
    return { line, material, phase: (i * 0.618034) % 1 };
  });

  let time = 0;
  let since = Infinity;
  group.userData.launch = () => {
    since = 0;
  };
  group.userData.update = (dt) => {
    time += dt;
    since += dt;
    mesh.geometry.setPositions(meshPositions(time, since));
    const lit = since < PAD_FX.flash ? 1 - since / PAD_FX.flash : 0;
    rimMat.color.copy(base).multiplyScalar(PAD_FX.glow * (1 + PAD_FX.flashGlow * lit));
    meshMat.color.copy(base).multiplyScalar(PAD_FX.meshGlow * (1 + PAD_FX.flashGlow * 1.5 * lit));
    // A launch sends them up faster and brighter.
    const speed = 1 + 2 * lit;
    for (const streak of streaks) {
      streak.phase = (streak.phase + (dt * speed) / PAD_FX.streakTime) % 1;
      const t = streak.phase;
      streak.line.position.y = PAD_FX.sheet + t * PAD_FX.reach;
      streak.material.color
        .copy(base)
        .multiplyScalar(PAD_FX.streakGlow * Math.min(1, t * 6) * (1 - t) * (1 + PAD_FX.flashGlow * lit));
    }
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
