/**
 * Building blocks for decorations (data pillar, screen): dark boxes, their
 * edges and boxes of light; glass boxes are glass.js glassBox(). Boxes are
 * given by their lower and upper corners in the object's cell.
 */
import { AdditiveBlending, BoxGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial } from 'three';
import { faceMaterial } from './neon.js';

/**
 * Line segments of a box's 12 edges.
 * @param {number[]} lo lower corner
 * @param {number[]} hi upper corner
 */
export function boxEdges([x0, y0, z0], [x1, y1, z1]) {
  const c = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const pairs = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  return pairs.map(([a, b]) => [c(a), c(b)]);
}

/**
 * Dark faces of a box.
 * @param {number[]} lo
 * @param {number[]} hi
 */
export function boxFaces([x0, y0, z0], [x1, y1, z1]) {
  const mesh = new Mesh(new BoxGeometry(x1 - x0, y1 - y0, z1 - z0), faceMaterial());
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return mesh;
}

/**
 * Glowing boxes of light (data packets, screen text), sized and placed with
 * placeLight() every frame.
 * @param {number} count
 * @param {import('three').Color} color
 */
export function lightBoxes(count, color) {
  const material = new MeshBasicMaterial({ color, blending: AdditiveBlending, depthWrite: false, transparent: true });
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, count);
  mesh.frustumCulled = false;
  return mesh;
}

const matrix = new Matrix4();

/**
 * Place light box `i` centered on `pos`, `size` [x, y, z] (0 hides it).
 * @param {InstancedMesh} mesh from lightBoxes()
 * @param {number} i
 * @param {number[]} pos
 * @param {number[]} size
 */
export function placeLight(mesh, i, [x, y, z], [w, h, d]) {
  matrix.makeScale(w + 1e-4, h + 1e-4, d + 1e-4).setPosition(x, y, z);
  mesh.setMatrixAt(i, matrix);
}
