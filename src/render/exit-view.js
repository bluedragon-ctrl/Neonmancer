/**
 * Exit effect, in the color of the room the exit leads to:
 * - back doorways: dashes run up both jambs and meet in the middle of the
 *   lintel, over the doorway frame;
 * - front exits: two arrows on the exit floor glide out of the room, fading
 *   in and out, one after the other.
 *
 * Layout and timing are pure (tested); ExitView animates them (dashes moved
 * with LineMaterial's dashOffset, arrows moved and faded per frame).
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
  /** Frame dashes: length, gap and speed in units per second. */
  dash: 0.18,
  gap: 0.22,
  frameSpeed: 1.6,
  /** Frame dash brightness. */
  frameBrightness: 1.4,
  /** Arrows: seconds for one arrow to glide out, and how far it glides. */
  arrowPeriod: 0.9,
  arrowTravel: 0.6,
  /** Arrow brightness at its brightest. */
  arrowBrightness: 1.4,
};

/** Is the exit on a back side (a doorway in a wall)? */
const isBack = ({ side }) => side.startsWith('-');

/**
 * Doorway frame paths of a back exit, pointing the way the dashes flow: up
 * each jamb, then along the lintel to its middle. Front exits have none.
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
  const top = exit.y + exit.height;
  const middle = exit.at + exit.width / 2;
  const segments = [];
  for (const a of [exit.at, exit.at + exit.width]) {
    segments.push([point(a, exit.y), point(a, top)], [point(a, top), point(middle, top)]);
  }
  return segments;
}

/**
 * Where an arrow is in its glide: `f` 0–1 through the glide. It starts
 * `arrowTravel` inside its rest spot and ends there, fading in and out.
 * @param {number} f
 * @returns {{ inside: number, brightness: number }} distance inwards from the rest spot, 0–1 brightness
 */
export function arrowState(f) {
  return { inside: EXIT_FX.arrowTravel * (1 - f), brightness: Math.sin(Math.PI * f) };
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

    const frame = exitFrameLayout(exit);
    if (frame.length > 0) {
      this.frameMaterial = lineMaterial({ color, width: 2.5, brightness: EXIT_FX.frameBrightness, dashed: true });
      this.frameMaterial.dashSize = EXIT_FX.dash;
      this.frameMaterial.gapSize = EXIT_FX.gap;
      const lines = new LineSegments2(new LineSegmentsGeometry().setPositions(flattenSegments(frame)), this.frameMaterial);
      lines.computeLineDistances();
      lines.renderOrder = 3; // over the doorway frame lying in the same spot
      this.group.add(lines);
    }

    this.arrows = [];
    if (!isBack(exit)) {
      // One arrow (the outer of the two chevrons), drawn twice, half a glide apart.
      const chevron = frontChevrons(size, [exit]).slice(0, 2);
      const { cross } = sideAxes(exit.side);
      this.inward = [0, 0, 0];
      this.inward[cross] = -1; // front sides are +x / +z: inwards is negative
      for (let i = 0; i < 2; i++) {
        const material = lineMaterial({ color, width: 2.5 });
        const arrow = new LineSegments2(new LineSegmentsGeometry().setPositions(flattenSegments(chevron)), material);
        this.arrows.push({ arrow, material, offset: i / 2 });
        this.group.add(arrow);
      }
    }
    this.update(0);
  }

  /** @param {number} dt seconds since the last frame */
  update(dt) {
    this.time += dt;
    if (this.frameMaterial) {
      // Moving the dash pattern back makes the dashes flow forward.
      const period = EXIT_FX.dash + EXIT_FX.gap;
      this.frameMaterial.dashOffset = -((this.time * EXIT_FX.frameSpeed) % period);
    }
    for (const { arrow, material, offset } of this.arrows) {
      const { inside, brightness } = arrowState((this.time / EXIT_FX.arrowPeriod + offset) % 1);
      arrow.position.set(...this.inward.map((v) => v * inside));
      material.color.copy(this.color).multiplyScalar(EXIT_FX.arrowBrightness * brightness);
    }
  }
}
