/**
 * Exit effect: a data stream flowing out of the room through every exit.
 *
 * - Stream: dashes run along lanes on the exit floor, from inside the room
 *   out through the opening, fading in and out at the lane ends. Back
 *   doorways also get dashes climbing the jambs and meeting in the middle
 *   of the lintel.
 * - Destination color: the stream has the color of the room it leads to.
 * - Proximity: dim and slow while the wizard is far; brighter, faster and
 *   pulsing when he comes close.
 *
 * Layout and glow are pure (tested); ExitView turns them into animated
 * dashed neon lines (LineMaterial dashes moved with dashOffset).
 */
import { Color, Group } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { sideAxes } from '../data/room-data.js';
import { flattenSegments } from './edges.js';
import { lineMaterial } from './neon.js';

/** Tuning values (units, seconds). */
export const EXIT_FX = {
  /** Lanes per unit of exit width. */
  lanesPerUnit: 2,
  /** How far a lane starts inside the room and ends outside it. */
  laneInside: 1.5,
  laneOutside: 1,
  /** Dash and gap length: short packets with room between them. */
  dash: 0.16,
  gap: 0.34,
  /** Distances (feet to threshold center) where the glow starts and is full. */
  far: 4.5,
  near: 1.5,
  /** Brightness far away and close up; flow speed far and close (units/s). */
  dim: 0.5,
  bright: 1.6,
  slow: 0.5,
  fast: 1.6,
  /** Pulse when close: share of the brightness and speed in cycles per second. */
  pulse: 0.25,
  pulseRate: 1.5,
};

/** Lift above the floor, so lanes never fight with it. */
const FLOOR_LIFT = 0.015;

/**
 * World point of exit coordinates: `a` along the side, `c` inwards from it
 * (negative = outside the room), `y` height.
 */
function exitPoint({ side }, size, a, c, y) {
  const { cross, along } = sideAxes(side);
  const point = [0, y, 0];
  point[along] = a;
  point[cross] = side.startsWith('-') ? c : size[cross] - c;
  return point;
}

/** Middle of the exit's threshold (on its floor, at the side). */
export function exitCenter(exit, size) {
  return exitPoint(exit, size, exit.at + exit.width / 2, 0, exit.y);
}

/**
 * Stream paths of one exit. Every segment points the way the dashes flow;
 * `fade` gives the brightness (0–1) at the start and end of each segment.
 * @param {{ side: string, at: number, width: number, y: number, height: number }} exit defaults applied
 * @param {number[]} size room size [x, y, z]
 * @returns {{ segments: number[][][], fade: number[][] }}
 */
export function exitStreamLayout(exit, size) {
  const segments = [];
  const fade = [];
  const add = (from, to, f0, f1) => {
    segments.push([from, to]);
    fade.push([f0, f1]);
  };
  const point = (a, c, y) => exitPoint(exit, size, a, c, y);

  // Floor lanes: fade in, full brightness at the threshold, fade out beyond.
  const lanes = Math.max(1, Math.round(exit.width * EXIT_FX.lanesPerUnit));
  const y = exit.y + FLOOR_LIFT;
  for (let i = 0; i < lanes; i++) {
    const a = exit.at + ((i + 0.5) * exit.width) / lanes;
    add(point(a, EXIT_FX.laneInside, y), point(a, 0, y), 0, 1);
    add(point(a, 0, y), point(a, -EXIT_FX.laneOutside, y), 1, 0);
  }

  // Back doorways: up both jambs and along the lintel to its middle.
  if (exit.side.startsWith('-')) {
    const top = exit.y + exit.height;
    const middle = exit.at + exit.width / 2;
    for (const a of [exit.at, exit.at + exit.width]) {
      add(point(a, 0, exit.y), point(a, 0, top), 0.3, 1);
      add(point(a, 0, top), point(middle, 0, top), 1, 1);
    }
  }
  return { segments, fade };
}

/**
 * Glow of an exit for a wizard `distance` units from its threshold center.
 * @param {number} distance
 * @param {number} time seconds, for the pulse
 * @returns {{ brightness: number, speed: number }}
 */
export function exitGlow(distance, time) {
  const t = Math.min(Math.max((EXIT_FX.far - distance) / (EXIT_FX.far - EXIT_FX.near), 0), 1);
  const near = t * t * (3 - 2 * t); // smoothstep
  const pulse = 1 + EXIT_FX.pulse * near * Math.sin(time * EXIT_FX.pulseRate * 2 * Math.PI);
  return {
    brightness: (EXIT_FX.dim + (EXIT_FX.bright - EXIT_FX.dim) * near) * pulse,
    speed: EXIT_FX.slow + (EXIT_FX.fast - EXIT_FX.slow) * near,
  };
}

export class ExitView {
  /**
   * @param {object} exit exit with defaults applied
   * @param {number[]} size room size [x, y, z]
   * @param {number|string} color color of the room the exit leads to
   */
  constructor(exit, size, color) {
    this.center = exitCenter(exit, size);
    this.color = new Color(color);
    this.phase = 0;

    const { segments, fade } = exitStreamLayout(exit, size);
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(flattenSegments(segments));
    geometry.setColors(fade.flatMap(([f0, f1]) => [f0, f0, f0, f1, f1, f1]));
    this.material = lineMaterial({ color: 0xffffff, width: 2.5, dashed: true });
    this.material.vertexColors = true;
    this.material.dashSize = EXIT_FX.dash;
    this.material.gapSize = EXIT_FX.gap;
    const stream = new LineSegments2(geometry, this.material);
    stream.computeLineDistances();
    stream.renderOrder = 3; // over the doorway frame lying in the same spot

    this.group = new Group().add(stream);
    this.update(0, 0, Infinity);
  }

  /** Distance from a point (the wizard's feet) to the threshold center. */
  distanceTo(pos) {
    return Math.hypot(...pos.map((v, i) => v - this.center[i]));
  }

  /**
   * @param {number} dt seconds since the last frame
   * @param {number} time seconds, for the pulse
   * @param {number} distance wizard to the threshold center (see distanceTo)
   */
  update(dt, time, distance) {
    const { brightness, speed } = exitGlow(distance, time);
    this.material.color.copy(this.color).multiplyScalar(brightness);
    // Moving the dash pattern back makes the dashes flow forward.
    const period = EXIT_FX.dash + EXIT_FX.gap;
    this.phase = (this.phase + speed * dt) % period;
    this.material.dashOffset = -this.phase;
  }
}
