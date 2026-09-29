/**
 * The backup shrine (D97): a floor tile, flush like a plate, that glows.
 * A square outline with a rune (a diamond round a small square), a pulsing
 * glow on the tile, light rising from its corners, pixel motes drifting up
 * and a faint square ring floating up now and then. Used (stepped on, or
 * rebooted on after a crash), it flares: brighter, with rings sweeping up
 * fast.
 *
 * It is in the wizard's magenta, like the backups in the HUD: it is where he
 * is backed up. Reviewed in the asset showcase (`?asset=shrine`).
 *
 * Layout and timing are pure (shrineMotes(), shrineRings(), shrinePulse());
 * createShrine() animates them.
 */
import { AdditiveBlending, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { createPixelBurst, placePixels } from './entity-view.js';
import { PALETTE, fadingLines, lineMaterial, neonLines } from './neon.js';

export const SHRINE_FX = {
  /** The wizard's magenta, his body's color (D97). */
  color: PALETTE.magenta,
  /** Lines float this far above the floor. */
  lift: 0.012,
  /** Margin of the outline from the tile edge; of the rune's diamond; half the rune's inner square. */
  inset: 0.07,
  diamond: 0.2,
  core: 0.09,
  /** How high the corner light and the motes rise, in blocks. */
  height: 1.6,
  /** Pixel motes: how many, their size, seconds to rise all the way. */
  motes: 10,
  moteSize: 0.05,
  riseTime: 2.6,
  /** Seconds per glow pulse; line brightness at its low and high. */
  pulse: 2.4,
  dim: 1.1,
  bright: 1.8,
  /** Glow of the tile fill at the pulse's low and high. */
  fillLow: 0.12,
  fillHigh: 0.3,
  /** Idle rings: one every `ringEvery` seconds, `ringTime` to rise, their brightness. */
  ringEvery: 3,
  ringTime: 2.2,
  ringBrightness: 0.8,
  /** Used: seconds the flare lasts, rings sweeping up (count, seconds apart, seconds to rise), extra brightness. */
  useTime: 1.2,
  useRings: 3,
  useRingGap: 0.12,
  useRingTime: 0.6,
  useBoost: 1.6,
};

/**
 * Where the motes are at `time`: spread over the tile, each rising at its
 * own phase and shrinking away near the top (pure).
 * @param {number} time seconds
 * @param {number} [count]
 * @returns {{ offset: number[], scale: number }[]} offsets from the tile's corner
 */
export function shrineMotes(time, count = SHRINE_FX.motes) {
  const motes = [];
  for (let i = 0; i < count; i++) {
    // Golden-ratio spread: phases and places that never line up.
    const phase = (i * 0.618034) % 1;
    const t = (time / SHRINE_FX.riseTime + phase) % 1;
    const x = 0.2 + 0.6 * ((i * 0.381966 + 0.13) % 1);
    const z = 0.2 + 0.6 * ((i * 0.7548776 + 0.41) % 1);
    motes.push({ offset: [x, SHRINE_FX.lift + t * SHRINE_FX.height, z], scale: Math.sin(Math.PI * t) });
  }
  return motes;
}

/**
 * The square rings floating up at `time` (pure): the idle ones, and the
 * fast bright sweep of a use `since` seconds ago.
 * @param {number} time seconds
 * @param {number} [since] seconds since the shrine was used (Infinity: not lately)
 * @returns {{ y: number, brightness: number }[]}
 */
export function shrineRings(time, since = Infinity) {
  const rings = [];
  const idle = time % SHRINE_FX.ringEvery;
  if (idle < SHRINE_FX.ringTime) {
    const t = idle / SHRINE_FX.ringTime;
    rings.push({ y: t * SHRINE_FX.height, brightness: SHRINE_FX.ringBrightness * (1 - t) });
  }
  for (let i = 0; i < SHRINE_FX.useRings; i++) {
    const t = (since - i * SHRINE_FX.useRingGap) / SHRINE_FX.useRingTime;
    if (t >= 0 && t < 1) rings.push({ y: t * SHRINE_FX.height * 1.3, brightness: SHRINE_FX.bright * 1.4 * (1 - t) });
  }
  return rings;
}

/**
 * How lit the shrine is at `time` (pure): 0..1 along the pulse, plus the
 * flare of a use `since` seconds ago (0..1, fading).
 * @returns {{ pulse: number, flare: number }}
 */
export function shrinePulse(time, since = Infinity) {
  const pulse = 0.5 - 0.5 * Math.cos((2 * Math.PI * time) / SHRINE_FX.pulse);
  const flare = since >= 0 && since < SHRINE_FX.useTime ? (1 - since / SHRINE_FX.useTime) ** 2 : 0;
  return { pulse, flare };
}

/** The outline of a square inset `m` from the tile's edges, at height y. */
function square(m, y) {
  const [a, b] = [m, 1 - m];
  return [
    [[a, y, a], [b, y, a]],
    [[b, y, a], [b, y, b]],
    [[b, y, b], [a, y, b]],
    [[a, y, b], [a, y, a]],
  ];
}

/** The rune: a diamond touching the middle of each side, round a small square. */
function rune(y) {
  const { diamond: d, core: c } = SHRINE_FX;
  const [n, s, w, e] = [[0.5, y, d], [0.5, y, 1 - d], [d, y, 0.5], [1 - d, y, 0.5]];
  return [[n, e], [e, s], [s, w], [w, n], ...square(0.5 - c, y)];
}

/**
 * A backup shrine, its tile's lower corner at the origin. `userData.update(dt)`
 * animates it; `userData.use()` makes it flare.
 */
export function createShrine() {
  const group = new Group();
  const y = SHRINE_FX.lift;
  const base = new Color(SHRINE_FX.color);

  const outlineMat = lineMaterial({ color: base, width: 2.5 });
  const runeMat = lineMaterial({ color: base, width: 1.8 });
  const outline = neonLines(square(SHRINE_FX.inset, y), outlineMat);
  const runeLines = neonLines(rune(y), runeMat);
  // Light rising from the outline's corners, fading as it goes up.
  const m = SHRINE_FX.inset;
  const corners = [[m, m], [1 - m, m], [1 - m, 1 - m], [m, 1 - m]];
  const beams = fadingLines(corners.map(([x, z]) => [[x, y, z], [x, SHRINE_FX.height, z]]), { color: base, width: 2 });
  const beamMat = beams.material;
  for (const line of [outline, runeLines, beams]) line.renderOrder = 2;

  const fillMat = new MeshBasicMaterial({ color: base, side: DoubleSide, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const fill = new Mesh(new PlaneGeometry(1 - 2 * m, 1 - 2 * m), fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.position.set(0.5, y / 2, 0.5);

  // White pixels tinted by the material: pale magenta sparks.
  const motes = createPixelBurst(SHRINE_FX.motes, SHRINE_FX.moteSize, [0xffffff]);
  // Rings: a few reused squares, placed and lit each frame.
  const rings = Array.from({ length: SHRINE_FX.useRings + 1 }, () => {
    const material = lineMaterial({ color: base, width: 2 });
    const line = neonLines(square(SHRINE_FX.inset, 0), material);
    line.renderOrder = 2;
    return { line, material };
  });
  group.add(fill, outline, runeLines, beams, motes, ...rings.map((ring) => ring.line));

  let time = 0;
  let since = Infinity;

  group.userData.use = () => {
    since = 0;
  };
  group.userData.update = (dt) => {
    time += dt;
    since += dt;
    const { pulse, flare } = shrinePulse(time, since);
    const lit = SHRINE_FX.dim + (SHRINE_FX.bright - SHRINE_FX.dim) * pulse + SHRINE_FX.useBoost * flare;
    outlineMat.color.copy(base).multiplyScalar(lit);
    runeMat.color.copy(base).multiplyScalar(lit * 0.9);
    beamMat.color.copy(base).multiplyScalar(0.5 + 0.5 * pulse + SHRINE_FX.useBoost * flare);
    fillMat.color.copy(base).multiplyScalar(SHRINE_FX.fillLow + (SHRINE_FX.fillHigh - SHRINE_FX.fillLow) * pulse + flare);

    const shown = shrineRings(time, since);
    rings.forEach(({ line, material }, i) => {
      const ring = shown[i];
      line.visible = !!ring;
      if (!ring) return;
      line.position.y = ring.y;
      material.color.copy(base).multiplyScalar(ring.brightness);
    });

    placePixels(motes, shrineMotes(time).map(({ offset, scale: s }) => ({ offset, scale: s * (1 + flare) })), [0, 0, 0]);
    motes.material.color.copy(base).multiplyScalar(1 + flare);
  };
  group.userData.update(0);
  return group;
}
