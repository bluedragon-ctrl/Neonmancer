/**
 * Exit effect, in the color of the room the exit leads to. Two copies of a
 * shape glide out of the room, fading in and out, one after the other:
 * - back doorways: the doorway frame, gliding from the wall into the dark
 *   tunnel behind it;
 * - front exits: an arrow on the exit floor, gliding out to the edge.
 *
 * Layout and timing are pure (tested); ExitView moves and fades the copies
 * every frame.
 *
 * Doorways have a second style under review, `stream`: dashes flow along
 * the tunnel's corner edges and two lanes on its floor, from the doorway
 * into the dark, fading out.
 */
import { Color, Group } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { sideAxes } from '../data/room-data.js';
import { flattenSegments } from './edges.js';
import { lineMaterial } from './neon.js';
import { frontChevrons } from './walls.js';

/** Tuning values (units, seconds). */
export const EXIT_FX = {
  /** Seconds for one copy to glide out. */
  period: 0.9,
  /** How far an arrow glides, and a doorway frame (into the tunnel). */
  arrowTravel: 0.6,
  frameTravel: 0.9,
  /** Brightness of a copy at its brightest. */
  brightness: 1.4,
  /** Stream style: dash, gap, how deep the edges run into the tunnel. */
  streamDash: 0.15,
  streamGap: 0.2,
  streamDepth: 1.1,
};

/** Lift of floor lanes above the tunnel floor, so they never fight with it. */
const FLOOR_LIFT = 0.015;

/** Is the exit on a back side (a doorway in a wall)? */
const isBack = ({ side }) => side.startsWith('-');

/**
 * The doorway frame of a back exit (a rectangle in the wall plane); front
 * exits have none.
 * @param {{ side: string, at: number, width: number, y: number, height: number }} exit defaults applied
 * @returns {number[][][]} segments
 */
export function exitFrameLayout(exit) {
  if (!isBack(exit)) return [];
  const { along } = sideAxes(exit.side);
  const point = (a, y) => {
    const p = [0, y, 0];
    p[along] = a;
    return p;
  };
  const [a0, a1, y0, y1] = [exit.at, exit.at + exit.width, exit.y, exit.y + exit.height];
  return [
    [point(a0, y0), point(a0, y1)],
    [point(a0, y1), point(a1, y1)],
    [point(a1, y1), point(a1, y0)],
    [point(a1, y0), point(a0, y0)],
  ];
}

/**
 * Stream paths of a back exit: the tunnel's four corner edges from the
 * doorway corners, and two lanes on the tunnel floor, all running into the
 * tunnel (the way the dashes flow). Front exits
 * have none.
 * @param {{ side: string, at: number, width: number, y: number, height: number }} exit defaults applied
 * @returns {number[][][]} segments
 */
export function exitStreamLayout(exit) {
  if (!isBack(exit)) return [];
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
 * A gliding copy at `f` (0–1 through its glide): how far out of the room
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
   * @param {{ style?: 'frames' | 'stream' }} [options] doorway style (front exits always glide arrows)
   */
  constructor(exit, size, color, { style = 'frames' } = {}) {
    this.color = new Color(color);
    this.group = new Group();
    this.time = 0;
    this.copies = [];

    if (style === 'stream' && isBack(exit)) {
      // Dashes fading from the doorway (bright) into the tunnel (black).
      const segments = exitStreamLayout(exit);
      const geometry = new LineSegmentsGeometry().setPositions(flattenSegments(segments));
      geometry.setColors(segments.flatMap(() => [1, 1, 1, 0, 0, 0]));
      this.streamMaterial = lineMaterial({ color, width: 2.5, brightness: EXIT_FX.brightness, dashed: true });
      this.streamMaterial.vertexColors = true;
      this.streamMaterial.dashSize = EXIT_FX.streamDash;
      this.streamMaterial.gapSize = EXIT_FX.streamGap;
      const stream = new LineSegments2(geometry, this.streamMaterial);
      stream.computeLineDistances();
      stream.renderOrder = 3; // over the tunnel's own corner lines
      this.group.add(stream);
      this.update(0);
      return;
    }

    const { cross } = sideAxes(exit.side);
    /** Unit vector out of the room through this exit. */
    this.outward = [0, 0, 0];
    this.outward[cross] = isBack(exit) ? -1 : 1;

    // Back exits: the doorway frame, starting in the wall plane. Front exits:
    // an arrow (the outer of the two chevrons), starting `arrowTravel` inside
    // the edge so it ends right at it.
    let shape;
    if (isBack(exit)) {
      shape = exitFrameLayout(exit);
      this.start = 0;
      this.travel = EXIT_FX.frameTravel;
    } else {
      shape = frontChevrons(size, [exit]).slice(0, 2);
      this.start = -EXIT_FX.arrowTravel;
      this.travel = EXIT_FX.arrowTravel;
    }

    for (let i = 0; i < 2; i++) {
      const material = lineMaterial({ color, width: 2.5 });
      const line = new LineSegments2(new LineSegmentsGeometry().setPositions(flattenSegments(shape)), material);
      line.renderOrder = 3; // over the doorway frame lying in the same spot
      this.copies.push({ line, material, offset: i / 2 });
      this.group.add(line);
    }
    this.update(0);
  }

  /** @param {number} dt seconds since the last frame */
  update(dt) {
    this.time += dt;
    if (this.streamMaterial) {
      // Same speed as the gliding frames. Moving the dash pattern back makes
      // the dashes flow forward.
      const speed = EXIT_FX.frameTravel / EXIT_FX.period;
      this.streamMaterial.dashOffset = -((this.time * speed) % (EXIT_FX.streamDash + EXIT_FX.streamGap));
    }
    for (const { line, material, offset } of this.copies) {
      const { out, brightness } = glideState((this.time / EXIT_FX.period + offset) % 1, this.travel);
      line.position.set(...this.outward.map((v) => v * (this.start + out)));
      material.color.copy(this.color).multiplyScalar(EXIT_FX.brightness * brightness);
    }
  }
}
