/**
 * Screen: a decoration, a blue neon terminal in one 1×1×1 cell. A deep box
 * of frosted glass (like the crates, D96) round a dark tube sits on a plain
 * slab a little smaller than it. Code scrolls up the tube's face, the bottom
 * line typing out behind a blinking cursor. The slab is structure, in the
 * room's (biome's) color; the screen is blue. Showcase `?asset=screens`.
 *
 * The camera never turns (D115): the screen faces +z or +x, one of the
 * faces it sees. What it shows is pure (codeWords(), terminalRows());
 * createScreen() animates it.
 */
import { Color, Group } from 'three';
import { boxEdges, boxFaces, lightBoxes, placeLight } from './deco.js';
import { GLASS, glassBox } from './glass.js';
import { hash } from './hash.js';
import { lineMaterial, neonLines } from './neon.js';

/** Tuning (units, seconds). */
export const SCREEN_FX = {
  /** The screen's blue: clear of cyan, which moves (D99). */
  color: '#4a8dff',
  /** The slab, the glass box and the tube inside it: lower and upper corners, facing +z. */
  slab: [[0.16, 0, 0.16], [0.84, 0.3, 0.84]],
  glass: [[0.12, 0.3, 0.12], [0.88, 1, 0.88]],
  tube: [[0.22, 0.38, 0.2], [0.78, 0.92, 0.8]],
  /** The text area on the tube's face: margin from the face's sides. */
  textMargin: 0.05,
  /** Line brightness of the slab and of the screen's edges. */
  edge: 1.2,
  screenEdge: 1.4,
  /** Rows shown, seconds per row typed, cursor blinks per second. */
  rows: 6,
  rowTime: 0.45,
  blink: 2.5,
};

/**
 * Words of code on line `line`: [start, end] across the row (0..1), some
 * lines indented, a fixed pattern per line (pure).
 * @param {number} line
 * @returns {number[][]}
 */
export function codeWords(line) {
  const words = [];
  let u = hash(line, 0) < 0.35 ? 0.12 : 0;
  for (let k = 0; k < 4; k++) {
    const end = u + 0.08 + 0.22 * hash(line, k + 1);
    if (end > 1) break;
    words.push([u, end]);
    u = end + 0.06;
    if (hash(line, k + 9) < 0.25) break;
  }
  return words;
}

/**
 * The terminal at `time`: its rows top to bottom, the bottom one typing out
 * (words cut at the cursor), and where the cursor is, or null while it
 * blinks off (pure).
 * @param {number} time seconds
 * @param {number} [rows]
 * @returns {{ rows: number[][][], cursor: number|null }}
 */
export function terminalRows(time, rows = SCREEN_FX.rows) {
  const step = Math.floor(time / SCREEN_FX.rowTime);
  const typed = (time / SCREEN_FX.rowTime) % 1;
  const lines = Array.from({ length: rows }, (_, r) => codeWords(step + r));
  const last = lines[rows - 1];
  const reach = last.length ? last[last.length - 1][1] * typed : 0;
  lines[rows - 1] = last.filter(([a]) => a < reach).map(([a, b]) => [a, Math.min(b, reach)]);
  const on = Math.floor(time * SCREEN_FX.blink) % 2 === 0;
  return { rows: lines, cursor: on ? Math.min(0.95, reach + 0.03) : null };
}

/**
 * A screen, its lower corner at the origin, 1×1×1.
 * `userData.update(dt)` animates it.
 * @param {object} [options]
 * @param {number|string} [options.color] the slab's: the room's (biome's) color
 * @param {'+x'|'+z'} [options.face] the way the screen faces
 */
export function createScreen({ color = '#ffb020', face = '+z' } = {}) {
  const { slab, glass, tube, textMargin: tm } = SCREEN_FX;
  const light = new Color(SCREEN_FX.color).lerp(new Color(0xffffff), 0.35).multiplyScalar(1.8);
  // Built facing +z; turned about the cell's middle to face +x.
  const body = new Group();
  body.add(boxFaces(...slab), boxFaces(...tube), glassBox(...glass, SCREEN_FX.color, GLASS.deco));
  body.add(neonLines(boxEdges(...slab), lineMaterial({ color, width: 2, brightness: SCREEN_FX.edge })));
  body.add(neonLines([...boxEdges(...glass), ...boxEdges(...tube)], lineMaterial({ color: SCREEN_FX.color, width: 2, brightness: SCREEN_FX.screenEdge })));

  // The text area on the tube's face: x right, y up.
  const [[x0, y0], [x1, y1, z1]] = tube;
  const [w, h] = [x1 - x0 - 2 * tm, y1 - y0 - 2 * tm];
  const view = new Group();
  view.position.set(x0 + tm, y0 + tm, z1 + 0.006);
  body.add(view);
  const { rows } = SCREEN_FX;
  const perRow = 4;
  const text = lightBoxes(rows * perRow + 1, light);
  view.add(text);
  const rowH = h / rows;

  const group = new Group();
  if (face === '+x') {
    body.position.set(-0.5, 0, -0.5);
    const turn = new Group().add(body);
    turn.position.set(0.5, 0, 0.5);
    turn.rotation.y = Math.PI / 2;
    group.add(turn);
  } else {
    group.add(body);
  }
  let time = 0;
  group.userData.update = (dt) => {
    time += dt;
    const shown = terminalRows(time, rows);
    shown.rows.forEach((words, r) => {
      const y = h - (r + 0.5) * rowH;
      for (let k = 0; k < perRow; k++) {
        const [a, b] = words[k] ?? [0, 0];
        placeLight(text, r * perRow + k, [((a + b) / 2) * w, y, 0], [(b - a) * w, rowH * 0.42, 0.01]);
      }
    });
    const c = shown.cursor;
    placeLight(text, rows * perRow, [(c ?? 0) * w + 0.02, rowH * 0.5, 0], c === null ? [0, 0, 0] : [0.035, rowH * 0.7, 0.01]);
    text.instanceMatrix.needsUpdate = true;
  };
  group.userData.update(0);
  return group;
}
