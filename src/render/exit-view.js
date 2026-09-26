/**
 * Exit effect, in the color of the room the exit leads to:
 * - back doorways: dashes flow along the tunnel's corner edges and two lanes
 *   on its floor, from the doorway into the dark, fading out;
 * - front exits: small arrows on the exit floor (one per tile of width)
 *   glide out to the edge, fading in and out, in two waves.
 *
 * Layout and timing are pure (tested); ExitView animates them (dashes moved
 * with LineMaterial's dashOffset, arrows moved and faded per frame).
 */
import { Color, Group } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { isBackSide, sideAxes } from '../data/room-data.js';
import { fadingLines, lineMaterial, neonLines } from './neon.js';
import { frontChevrons } from './walls.js';

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

export class ExitView {
  /**
   * @param {object} exit exit with defaults applied
   * @param {number[]} size room size [x, y, z]
   * @param {number|string} color color of the room the exit leads to
   */
  constructor(exit, size, color) {
    this.color = new Color(color);
    this.group = new Group();
    this.time = 0;
    this.arrows = [];

    if (isBackSide(exit.side)) {
      // Dashes fading from the doorway (bright) into the tunnel (black).
      const stream = fadingLines(exitStreamLayout(exit), { color, width: 2.5, brightness: EXIT_FX.brightness, dashed: true });
      this.streamMaterial = stream.material;
      this.streamMaterial.dashSize = EXIT_FX.streamDash;
      this.streamMaterial.gapSize = EXIT_FX.streamGap;
      stream.renderOrder = 3; // over the tunnel's own corner lines
      this.group.add(stream);
    } else {
      // The row of arrows (one per tile), drawn twice, half a glide apart; it
      // starts arrowTravel inside its spot by the edge and ends there.
      const { cross } = sideAxes(exit.side);
      this.outward = [0, 0, 0];
      this.outward[cross] = 1; // front sides are +x / +z
      const first = neonLines(frontChevrons(size, [exit]), lineMaterial({ color, width: 2.5 }));
      const second = new LineSegments2(first.geometry, lineMaterial({ color, width: 2.5 }));
      [first, second].forEach((line, i) => {
        this.arrows.push({ line, material: line.material, offset: i / 2 });
        this.group.add(line);
      });
    }
    this.update(0);
  }

  /** @param {number} dt seconds since the last frame */
  update(dt) {
    this.time += dt;
    if (this.streamMaterial) {
      // Moving the dash pattern back makes the dashes flow forward.
      const period = EXIT_FX.streamDash + EXIT_FX.streamGap;
      this.streamMaterial.dashOffset = -((this.time * EXIT_FX.streamSpeed) % period);
    }
    for (const { line, material, offset } of this.arrows) {
      const { out, brightness } = glideState((this.time / EXIT_FX.arrowPeriod + offset) % 1, EXIT_FX.arrowTravel);
      line.position.set(...this.outward.map((v) => v * (out - EXIT_FX.arrowTravel)));
      material.color.copy(this.color).multiplyScalar(EXIT_FX.brightness * brightness);
    }
  }
}
