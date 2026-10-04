/**
 * Memory stack: a decoration (D117), 1×1×1: four glass plates with memory
 * chips on them, held by a spine at the back. A read/write light rises past
 * the plates, and now and then one plate's lights write along its front
 * edge. In the room's color; the light a brighter, whiter tint of it.
 * Showcase `?asset=memory`.
 *
 * Stacks set side by side or on top of each other make a memory wall: the
 * plates run on from cell to cell, and the rising light takes its timing
 * from the stack's cell (sweepY()), so it climbs from a stack into the one
 * above and runs along the wall as a slow wave. There is no wall object
 * and no height option: a wall is just stacks.
 *
 * The camera never turns (D115): built facing +z (the lights' side), turned
 * for +x; the spine is at the back, out of sight.
 */
import { Color, Group } from 'three';
import { boxEdges, boxFaces, facing, lightBoxes, placeLight } from './deco.js';
import { GLASS, glassBoxes } from './glass.js';
import { hash } from './hash.js';
import { lineMaterial, neonLines } from './neon.js';

/** Tuning (units, seconds). */
export const MEMORY_FX = {
  /** Margin from the cell's sides along the plates: small, so neighbors run on. */
  margin: 0.03,
  /** The plates' lower faces, their thickness; where they end at the front; the spine. */
  plates: [0.07, 0.31, 0.55, 0.79],
  thick: 0.1,
  front: 0.94,
  spine: [0.06, 0.18],
  /** Line brightness of the structure and of the chips. */
  edge: 1.2,
  chipEdge: 0.7,
  /** Lights along each plate's front edge. */
  lights: 6,
  /** The rising light: blocks per second, and the height it repeats over (a 2-high wall shows it once). */
  rise: 0.45,
  period: 2,
  /** How far behind (share of a run) the light is per cell along the wall. */
  lag: 0.12,
  /** How close (units) the rising light must be to light a plate. */
  reach: 0.12,
  /** A plate writes every `writeEvery` s, its lights coming on over `writeTime` s; then they fade over `writeFade` s. */
  writeEvery: 3,
  writeTime: 1.2,
  writeFade: 0.5,
};

/**
 * Height of the rising light in the stack at cell `[x, y, z]` at `time`,
 * from its floor; outside 0..1 it is in another stack of the wall (pure).
 * @param {number} time seconds
 * @param {number[]} cell
 */
export function sweepY(time, [x, y, z]) {
  const { rise, period, lag } = MEMORY_FX;
  const w = (time * rise) / period - (x + z) * lag;
  return (w - Math.floor(w)) * period - (((y % period) + period) % period);
}

/**
 * How lit a plate's lights are (0..1) from the rising light at `sweep`,
 * the plate's middle at `mid` (pure).
 * @param {number} sweep
 * @param {number} mid
 */
export function sweepGlow(sweep, mid) {
  return Math.max(0, 1 - Math.abs(sweep - mid) / MEMORY_FX.reach);
}

/**
 * A memory stack, its lower corner at the origin, 1×1×1.
 * `userData.update(dt)` animates it.
 * @param {object} [options]
 * @param {number|string} [options.color] the room's (biome's) color
 * @param {'+x'|'+z'} [options.face] the side its lights are on
 * @param {number[]} [options.cell] its cell in the room: the light's timing in a wall
 */
export function createMemoryStack({ color = '#ffb020', face = '+z', cell = [0, 0, 0] } = {}) {
  const base = new Color(color);
  const light = base.clone().lerp(new Color(0xffffff), 0.5).multiplyScalar(1.8);
  const { margin: m, plates, thick, front, spine: [s0, s1] } = MEMORY_FX;
  const body = new Group();

  const spine = [[m, 0, s0], [1 - m, 1, s1]];
  const slab = (y) => [[m, y, s1], [1 - m, y + thick, front]];
  const chips = plates.flatMap((y) => [0, 1, 2, 3].map((j) => [[0.1 + j * 0.215, y + thick, 0.36], [0.24 + j * 0.215, y + thick + 0.035, 0.72]]));
  body.add(boxFaces([spine, ...chips]));
  body.add(glassBoxes(plates.map(slab), base, GLASS.deco));
  body.add(neonLines([...boxEdges(...spine), ...plates.flatMap((y) => boxEdges(...slab(y)))], lineMaterial({ color: base, width: 2, brightness: MEMORY_FX.edge })));
  body.add(neonLines(chips.flatMap((c) => boxEdges(...c)), lineMaterial({ color: base, width: 1.2, brightness: MEMORY_FX.chipEdge })));

  // Lights along each plate's front edge, then the rising read/write bar.
  const per = MEMORY_FX.lights;
  const leds = lightBoxes(plates.length * per + 1, light);
  body.add(leds);

  const group = facing(body, face);
  const [x, y, z] = cell;
  const { writeEvery, writeTime, writeFade } = MEMORY_FX;
  let time = 0;
  group.userData.update = (dt) => {
    time += dt;
    const sweep = sweepY(time, cell);
    placeLight(leds, plates.length * per, [0.5, sweep, front + 0.02], sweep >= 0 && sweep <= 1 ? [1 - 2 * m, 0.012, 0.012] : [0, 0, 0]);
    // Which plate writes this round, its lights coming on one by one.
    const round = Math.floor(time / writeEvery);
    const into = time - round * writeEvery;
    const writing = Math.floor(hash(round, x * 7 + y * 13 + z * 5) * plates.length);
    const fade = Math.max(0, 1 - Math.max(0, into - writeTime * 1.6) / writeFade);
    plates.forEach((py, i) => {
      const mid = py + thick / 2;
      for (let k = 0; k < per; k++) {
        const written = i === writing && into > ((k + 1) / per) * writeTime ? fade : 0;
        const s = Math.max(sweepGlow(sweep, mid), written);
        placeLight(leds, i * per + k, [0.1 + (k + 0.5) * (0.8 / per), mid, front + 0.006], [0.08 * s, 0.035 * s, 0.01]);
      }
    });
    leds.instanceMatrix.needsUpdate = true;
  };
  group.userData.update(0);
  return group;
}
