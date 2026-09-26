/**
 * Layout and timing of the exit effect (pure, tested; see exit-view.js for
 * how it is drawn and animated).
 */
import { isBackSide, sideAxes } from '../data/room-data.js';

/** Tuning values (units, seconds). */
export const EXIT_FX = {
  /** Brightness of the stream at the doorway and of an arrow at its brightest. */
  brightness: 1.4,
  /** Doorway stream: dash, gap, speed (units per second), how deep it runs into the tunnel. */
  streamDash: 0.15,
  streamGap: 0.2,
  streamSpeed: 1,
  streamDepth: 1.1,
  /** Arrows: seconds for one arrow to glide out, and how far it glides. */
  arrowPeriod: 0.9,
  arrowTravel: 0.45,
};

/** Lift of floor lanes above the tunnel floor, so they never fight with it. */
const FLOOR_LIFT = 0.015;

/**
 * Stream paths of a back exit: the tunnel's four corner edges from the
 * doorway corners, and two lanes on the tunnel floor, all running into the
 * tunnel (the way the dashes flow). Front exits have none.
 * @param {{ side: string, at: number, width: number, y: number, height: number }} exit defaults applied
 * @returns {number[][][]} segments
 */
export function exitStreamLayout(exit) {
  if (!isBackSide(exit.side)) return [];
  const { cross, along } = sideAxes(exit.side);
  const point = (a, out, y) => {
    const p = [0, y, 0];
    p[along] = a;
    p[cross] = 0 - out; // back sides: out of the room is negative (0 - out: no -0)
    return p;
  };
  const segments = [];
  for (const a of [exit.at, exit.at + exit.width]) {
    for (const y of [exit.y, exit.y + exit.height]) segments.push([point(a, 0, y), point(a, EXIT_FX.streamDepth, y)]);
  }
  // Two lanes on the tunnel floor (only the floor shows well through the doorway).
  for (const k of [1, 2]) {
    const a = exit.at + (k * exit.width) / 3;
    segments.push([point(a, 0, exit.y + FLOOR_LIFT), point(a, EXIT_FX.streamDepth, exit.y + FLOOR_LIFT)]);
  }
  return segments;
}

/**
 * A gliding arrow at `f` (0–1 through its glide): how far out of the room
 * it has moved (0 to `travel`) and how bright it is (fading in and out).
 * @param {number} f
 * @param {number} travel
 * @returns {{ out: number, brightness: number }}
 */
export function glideState(f, travel) {
  return { out: travel * f, brightness: Math.sin(Math.PI * f) };
}
