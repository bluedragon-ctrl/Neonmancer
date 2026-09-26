/**
 * The shared path format (D46): moving platforms follow one, and patrolling
 * enemies will too. Pure logic.
 *
 * A path starts at the object's own `at` and runs through `points` (grid
 * cells, the object's lower corner), one axis at a time. `pingpong` runs
 * there and back; `loop` runs on from the last point back to the start.
 * It pauses `pause` seconds at the ends: both ends of a ping-pong path, the
 * start of a loop.
 *
 * The path is a list of legs (buildTrack()); where an object is on it is a
 * small state { leg, along, pause } that advance() moves on by a distance,
 * without changing the old state, so the caller can drop a move that is
 * blocked.
 */
import { DT } from '../core/loop.js';
import { PATH_DEFAULTS } from '../data/room-data.js';

/** Distances closer than this to a path point count as on it. */
const SNAP = 1e-9;

/**
 * @typedef {object} Leg
 * @property {number[]} from start point [x, y, z]
 * @property {number[]} to end point
 * @property {number} axis the one axis it runs along (0, 1 or 2)
 * @property {number} length in units
 * @property {boolean} stop whether the path pauses at its end
 */

/**
 * @typedef {object} PathState
 * @property {number} leg index of the current leg
 * @property {number} along distance covered on it
 * @property {number} pause ticks left to wait at a stop before moving on
 */

/**
 * The legs of a path, in the order it runs them, looping back to the first.
 * @param {number[]} at start point (the object's `at`)
 * @param {{ points: number[][], mode?: string, pause?: number }} path
 * @returns {{ legs: Leg[], speed: number, pauseTicks: number }}
 */
export function buildTrack(at, path) {
  const { points, mode, speed, pause } = { ...PATH_DEFAULTS, ...path };
  const stops = [at, ...points];
  const route = mode === 'loop' ? [...stops, at] : [...stops, ...stops.slice(0, -1).reverse()];
  // Ping-pong stops at the far end (index stops.length − 1) and back at the start.
  const stopAt = new Set(mode === 'loop' ? [route.length - 1] : [stops.length - 1, route.length - 1]);
  const legs = [];
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1];
    const to = route[i];
    const axis = legAxis(from, to);
    legs.push({ from, to, axis, length: Math.abs(to[axis] - from[axis]), stop: stopAt.has(i) });
  }
  return { legs, speed, pauseTicks: Math.round(pause / DT) };
}

/**
 * The axis two path points differ on, or −1 unless they differ on exactly
 * one (a leg must run along one axis).
 * @param {number[]} a
 * @param {number[]} b
 */
export function legAxis(a, b) {
  const differ = [0, 1, 2].filter((i) => a[i] !== b[i]);
  return differ.length === 1 ? differ[0] : -1;
}

/**
 * Every grid cell an object of size 1 sweeps along a path (the points
 * included), each once.
 * @param {number[]} at
 * @param {{ points: number[][], mode?: string }} path
 * @returns {number[][]} cells [x, y, z]
 */
export function pathCells(at, path) {
  const cells = new Map();
  for (const { from, to, axis } of buildTrack(at, path).legs) {
    const step = Math.sign(to[axis] - from[axis]);
    const cell = [...from];
    for (let v = from[axis]; v !== to[axis] + step; v += step) {
      cell[axis] = v;
      cells.set(cell.join(','), [...cell]);
    }
  }
  return [...cells.values()];
}

/** Where a path starts: on the first leg, not waiting. @returns {PathState} */
export function startState() {
  return { leg: 0, along: 0, pause: 0 };
}

/**
 * The state after moving `distance` units on from `state`: a stop waits out
 * its pause first, and distance left at the end of a leg carries on into
 * the next, so corners keep the speed.
 * @param {ReturnType<typeof buildTrack>} track
 * @param {PathState} state
 * @param {number} distance units per tick
 * @returns {PathState} a new state
 */
export function advance({ legs, pauseTicks }, state, distance) {
  let { leg, along, pause } = state;
  if (pause > 0) return { leg, along, pause: pause - 1 };
  along += distance;
  // A hair short of the end counts as there, so the float sum of many small
  // steps still lands exactly on the point.
  while (along >= legs[leg].length - SNAP) {
    along = Math.max(along - legs[leg].length, 0);
    if (along < SNAP) along = 0;
    const stop = legs[leg].stop && pauseTicks > 0;
    leg = (leg + 1) % legs.length;
    if (stop) return { leg, along: 0, pause: pauseTicks };
  }
  return { leg, along, pause: 0 };
}

/**
 * Position on the path: exactly the point at the start of a leg, so a
 * resting platform sits on whole cells.
 * @param {ReturnType<typeof buildTrack>} track
 * @param {PathState} state
 * @returns {number[]} [x, y, z]
 */
export function positionOf({ legs }, { leg, along }) {
  const { from, to, axis } = legs[leg];
  const pos = [...from];
  pos[axis] += Math.sign(to[axis] - from[axis]) * along;
  return pos;
}
