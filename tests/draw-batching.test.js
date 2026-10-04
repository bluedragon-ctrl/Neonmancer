import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDataPillar } from '../src/render/data-pillar.js';
import { boxFaces } from '../src/render/deco.js';
import { CUBE, UNIT_BOX } from '../src/render/geometry.js';
import { glassBoxes } from '../src/render/glass.js';
import { createMemoryStack } from '../src/render/memory-stack.js';
import { createScreen } from '../src/render/screen.js';
import { createPixelBurst, placePixels } from '../src/render/pixels.js';
import { bufferPixelRatio, effectiveMultisampling, MSAA_MAX_PIXEL_RATIO } from '../src/render/viewport.js';

/** Meshes (draws) in a model, and the geometries and materials they use. */
function draws(root) {
  const meshes = [];
  root.traverse((node) => node.isMesh && meshes.push(node));
  return { count: meshes.length, geometries: new Set(meshes.map((m) => m.geometry)), materials: new Set(meshes.flatMap((m) => [m.material].flat())) };
}

test('decorations are drawn in a handful of draws: dark boxes merged, glass instanced', () => {
  // Faces, glass, two line sets, lights (and the pillar's panel).
  assert.equal(draws(createMemoryStack()).count, 5);
  assert.equal(draws(createDataPillar({ height: 3 })).count, 6);
  assert.equal(draws(createScreen()).count, 6);
});

test('decorations of one look share their dark faces: geometry and material', () => {
  const faces = (model) => {
    const found = [];
    model.traverse((node) => node.isMesh && node.geometry.type === 'BufferGeometry' && !node.isInstancedMesh && !node.isLineSegments2 && found.push(node));
    return found;
  };
  const [a] = faces(createMemoryStack({ cell: [0, 0, 0] }));
  const [b] = faces(createMemoryStack({ cell: [1, 0, 0], color: '#ff2bd6' }));
  assert.equal(a.geometry, b.geometry);
  assert.equal(a.material, b.material);
  assert.ok(a.geometry.userData.shared && a.material.userData.shared, 'kept when a room is thrown away');
});

test('boxFaces() merges boxes into one mesh with the boxes\' extent', () => {
  const mesh = boxFaces([[[0, 0, 0], [1, 0.5, 1]], [[0.2, 0.5, 0.2], [0.8, 2, 0.8]]]);
  mesh.geometry.computeBoundingBox();
  const { min, max } = mesh.geometry.boundingBox;
  assert.deepEqual([min.x, min.y, min.z, max.x, max.y, max.z], [0, 0, 0, 1, 2, 1]);
  assert.equal(mesh.geometry.getAttribute('position').count, 48, 'two boxes of 24 corners');
});

test('glassBoxes() scales the unit cell into each box, one instance each', () => {
  const mesh = glassBoxes([[[0, 0, 0], [1, 1, 1]], [[0.2, 1, 0.3], [0.8, 1.5, 0.9]]], '#ffb020');
  assert.equal(mesh.count, 2);
  assert.equal(mesh.geometry, UNIT_BOX);
  const m = mesh.instanceMatrix.array.slice(16, 32);
  // Scale on the diagonal, the lower corner as the translation.
  assert.deepEqual([m[0], m[5], m[10]].map((v) => +v.toFixed(6)), [0.6, 0.5, 0.6]);
  assert.deepEqual([m[12], m[13], m[14]].map((v) => +v.toFixed(6)), [0.2, 1, 0.3]);
});

test('pixel bursts share one cube, scaled to their pixel size; hidden ones are left alone', () => {
  const a = createPixelBurst(8, 0.05, [0xffffff]);
  const b = createPixelBurst(8, 0.1, [0xffffff]);
  assert.equal(a.geometry, CUBE);
  assert.equal(b.geometry, CUBE);
  placePixels(b, [{ offset: [0, 0, 0], scale: 0.5 }], [1, 2, 3]);
  assert.ok(b.visible);
  assert.equal(b.count, 1);
  assert.equal(+b.instanceMatrix.array[0].toFixed(6), 0.05, 'pixel scale times its size');
  const version = a.instanceMatrix.version;
  placePixels(a, [], [0, 0, 0]);
  assert.equal(a.instanceMatrix.version, version, 'no upload for a burst that stays hidden');
});

test('multisampling is off on a high-DPI buffer, on otherwise (D169)', () => {
  assert.equal(effectiveMultisampling(4, bufferPixelRatio(1, 1)), 4);
  assert.equal(effectiveMultisampling(4, bufferPixelRatio(1.25, 1)), 4);
  assert.equal(effectiveMultisampling(4, bufferPixelRatio(MSAA_MAX_PIXEL_RATIO, 1)), 0);
  assert.equal(effectiveMultisampling(4, bufferPixelRatio(2, 1)), 0);
  assert.equal(effectiveMultisampling(4, bufferPixelRatio(3, 1)), 0, 'the ratio is capped, but still dense');
  // A 2× screen at half scale is a 1× buffer again.
  assert.equal(effectiveMultisampling(4, bufferPixelRatio(2, 0.5)), 4);
});
