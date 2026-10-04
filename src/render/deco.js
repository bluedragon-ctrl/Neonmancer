/**
 * Building blocks for decorations (data pillar, screen, memory stack): dark
 * boxes, their edges and boxes of light, and turning one to face +x; glass
 * boxes are glass.js glassBox() or glassBoxes(). Boxes are given by their
 * lower and upper corners in the object's cell.
 *
 * A decoration is drawn in few draws: its dark boxes are one merged mesh
 * (the same shape for every decoration of a look, so built once and
 * shared), its glass one instanced mesh, its lights one instanced mesh.
 */
import { AdditiveBlending, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CUBE } from './geometry.js';
import { faceMaterial, shared } from './neon.js';

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

/** Merged geometry of each set of boxes built so far, by their corners. */
const merged = new Map();

/** The dark face material every decoration shares (never changed at runtime). */
let decoFaces = null;

/**
 * Dark faces of boxes, as one mesh. Every decoration of a look has the
 * same boxes, so the merged geometry is built once and shared; so is the
 * material, unless one is given.
 * @param {number[][][]} boxes [lo, hi] corners of each box
 * @param {import('three').Material} [material] faceMaterial() by default
 */
export function boxFaces(boxes, material = (decoFaces ??= shared(faceMaterial()))) {
  const key = JSON.stringify(boxes);
  if (!merged.has(key)) {
    const parts = boxes.map(([[x0, y0, z0], [x1, y1, z1]]) =>
      new BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    );
    merged.set(key, shared(mergeGeometries(parts)));
    for (const part of parts) part.dispose();
  }
  return new Mesh(merged.get(key), material);
}

/**
 * Glowing boxes of light (data packets, screen text), sized and placed with
 * placeLight() every frame.
 * @param {number} count
 * @param {import('three').Color} color
 */
export function lightBoxes(count, color) {
  const material = new MeshBasicMaterial({ color, blending: AdditiveBlending, depthWrite: false, transparent: true });
  const mesh = new InstancedMesh(CUBE, material, count);
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

/**
 * A decoration built facing +z, in a group that faces `face`: turned about
 * the cell's middle for +x.
 * @param {Group} body
 * @param {'+x'|'+z'} face
 */
export function facing(body, face) {
  const group = new Group();
  if (face !== '+x') return group.add(body);
  body.position.set(-0.5, 0, -0.5);
  const turn = new Group().add(body);
  turn.position.set(0.5, 0, 0.5);
  turn.rotation.y = Math.PI / 2;
  return group.add(turn);
}
