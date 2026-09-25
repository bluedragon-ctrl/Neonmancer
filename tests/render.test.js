import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  bufferSize,
  clampRenderScale,
  fitLetterbox,
  scaleToHeight,
} from '../src/render/viewport.js';
import { VIEW_HEIGHT, createIsoCamera, frameRoom, projectedHeight } from '../src/render/camera.js';
import { blockEdges } from '../src/render/edges.js';
import { MARKS, markSegments } from '../src/render/marks.js';
import { holeSides } from '../src/render/hole-view.js';

test('letterbox fills a 16:9 window exactly', () => {
  assert.deepEqual(fitLetterbox(1920, 1080), { x: 0, y: 0, width: 1920, height: 1080 });
});

test('letterbox adds bars on wide and tall windows', () => {
  assert.deepEqual(fitLetterbox(2560, 1080), { x: 320, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(fitLetterbox(1600, 1200), { x: 0, y: 150, width: 1600, height: 900 });
});

test('buffer size caps devicePixelRatio and applies render scale', () => {
  assert.deepEqual(bufferSize(1920, 1080, 1, 1), { width: 1920, height: 1080 });
  assert.deepEqual(bufferSize(1920, 1080, 3, 1), { width: 3840, height: 2160 });
  assert.deepEqual(bufferSize(1920, 1080, 2, 0.5), { width: 1920, height: 1080 });
});

test('render scale is clamped to 0.5–1', () => {
  assert.equal(clampRenderScale(0.1), 0.5);
  assert.equal(clampRenderScale(2), 1);
  assert.equal(clampRenderScale(0.75), 0.75);
  assert.equal(clampRenderScale(NaN), 1);
});

test('sizes scale with render height', () => {
  assert.equal(scaleToHeight(2, 1080), 2);
  assert.equal(scaleToHeight(2, 2160), 4);
});

/** Screen-space height of a room box in world units, measured with the real camera. */
function measuredHeight(size) {
  const camera = createIsoCamera();
  frameRoom(camera, size);
  const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  let min = Infinity;
  let max = -Infinity;
  for (const x of [0, size[0]])
    for (const y of [0, size[1]])
      for (const z of [0, size[2]]) {
        const v = new Vector3(x, y, z).dot(up);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
  return max - min;
}

test('projected room height matches the camera', () => {
  for (const size of [[8, 4, 8], [16, 6, 16], [24, 6, 8]]) {
    assert.ok(Math.abs(measuredHeight(size) - projectedHeight(size)) < 1e-9);
  }
});

test('the largest legal rooms fit the fixed view', () => {
  for (const size of [[16, 6, 16], [20, 6, 12], [24, 6, 8], [31, 6, 1]]) {
    assert.ok(projectedHeight(size) <= 18, `${size} is too tall`);
    assert.ok(projectedHeight(size) < VIEW_HEIGHT);
  }
});

/** Sorted, comparable form of a segment list. */
const norm = (segments) => segments.map((s) => JSON.stringify(s)).sort();

test('a single block has 12 edges', () => {
  assert.equal(blockEdges([[0, 0, 0]]).length, 12);
});

test('neighbouring blocks merge into one box outline', () => {
  const row = blockEdges([[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  assert.equal(row.length, 12);
  assert.ok(norm(row).includes(JSON.stringify([[0, 0, 0], [3, 0, 0]])));

  const cube = [];
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) cube.push([x, y, z]);
  assert.equal(blockEdges(cube).length, 12);
});

test('inner corners of an L shape are drawn', () => {
  const edges = norm(blockEdges([[0, 0, 0], [1, 0, 0], [0, 0, 1]]));
  // The vertical concave edge where the arms meet.
  assert.ok(edges.includes(JSON.stringify([[1, 0, 1], [1, 1, 1]])));
});

test('an edge shared by diagonal blocks is drawn once', () => {
  const edges = blockEdges([[0, 0, 0], [1, 1, 0]]);
  // 2 × 12, minus the shared edge, minus 4 pieces that continue in a line.
  assert.equal(edges.length, 19);
  const shared = JSON.stringify([[1, 1, 0], [1, 1, 1]]);
  assert.equal(norm(edges).filter((e) => e === shared).length, 1);
});

test('no blocks, no edges', () => {
  assert.deepEqual(blockEdges([]), []);
});

test('face marks: patterns on all six faces', () => {
  assert.equal(markSegments('none').length, 0);
  assert.equal(markSegments('inset').length, 6 * 4);
  assert.equal(markSegments('cross').length, 6 * 2);
  assert.equal(markSegments('brackets').length, 6 * 8);
  assert.deepEqual(MARKS, ['none', 'inset', 'cross', 'brackets']);
});

test('face marks lie on the faces of the cube at the given cell', () => {
  const cell = [3, 1, 5];
  for (const segment of markSegments('inset', cell)) {
    for (const point of segment) {
      // Every point is inside the cube and on at least one of its faces.
      const local = point.map((v, i) => v - cell[i]);
      assert.ok(local.every((v) => v >= 0 && v <= 1));
      assert.ok(local.some((v) => v === 0 || v === 1));
    }
  }
});

test('hole outline: only sides that border floor', () => {
  assert.equal(holeSides([[2, 3]]).length, 4);
  // A 2×2 hole has an outline of 8 unit sides, none between its own tiles.
  const square = holeSides([[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.equal(square.length, 8);
  assert.ok(!square.some(([[x1], [x2]]) => x1 === 1 && x2 === 1));
});
