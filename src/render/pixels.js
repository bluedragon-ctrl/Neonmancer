/**
 * Pixel bursts: small glowing additive cubes that effects place each frame
 * (derezzes, streams, sparks, motes); the derez of anything that is gone
 * (derez-fx.js, D126) and the stream of pixels carried from one place to
 * another (stream-fx.js, D127), each in one look.
 */
import { AdditiveBlending, BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import { DEREZ, derezCount, derezPixels } from './derez-fx.js';
import { streamPixels } from './stream-fx.js';

/**
 * A burst of glowing pixels: small additive cubes, taking turns in the
 * given colors, hidden until placePixels() shows some.
 * @param {number} count
 * @param {number} size edge of one cube
 * @param {(number|string)[]} colors
 */
export function createPixelBurst(count, size, colors) {
  const geometry = new BoxGeometry(size, size, size);
  const material = new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false, transparent: true });
  const mesh = new InstancedMesh(geometry, material, count);
  const tints = colors.map((color) => new Color(color).multiplyScalar(1.6));
  for (let i = 0; i < count; i++) mesh.setColorAt(i, tints[i % tints.length]);
  mesh.frustumCulled = false; // instances move far from the geometry's own bounds
  mesh.visible = false;
  return mesh;
}

const pixelMatrix = new Matrix4();

/**
 * Show a pixel burst around `pos`, or hide it when there are no pixels;
 * only as many of its cubes as there are pixels.
 * @param {InstancedMesh} mesh from createPixelBurst()
 * @param {{ offset: number[], scale: number }[]} pixels offsets from `pos`
 * @param {number[]} pos
 */
export function placePixels(mesh, pixels, pos) {
  mesh.visible = pixels.length > 0;
  mesh.count = Math.min(pixels.length, mesh.instanceMatrix.count);
  pixels.forEach(({ offset: [x, y, z], scale }, i) => {
    pixelMatrix.makeScale(scale, scale, scale).setPosition(pos[0] + x, pos[1] + y, pos[2] + z);
    mesh.setMatrixAt(i, pixelMatrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * The derez of `body` (derez-fx.js), its pixels taking turns in `colors`:
 * the thing's own colors, white as the second where it has only one.
 * @param {import('./derez-fx.js').DerezBody} body
 * @param {(number|string)[]} colors
 */
export function createDerez(body, colors) {
  const mesh = createPixelBurst(derezCount(body), DEREZ.pixelSize, colors);
  mesh.userData.body = body;
  return mesh;
}

/**
 * Show a derez `tick` ticks after it started, standing on `pos` (the
 * body's feet center); `tick` null (or the burst over) hides it.
 * @param {InstancedMesh} mesh from createDerez()
 * @param {number|null} tick may be fractional
 * @param {number[]} pos
 */
export function placeDerez(mesh, tick, pos) {
  placePixels(mesh, tick === null ? [] : derezPixels(tick, mesh.userData.body), pos);
}

/**
 * A stream of `count` pixels (stream-fx.js streamCount() of its ends, the
 * most it will carry), taking turns in `colors`.
 * @param {number} count
 * @param {(number|string)[]} colors
 */
export function createStream(count, colors) {
  return createPixelBurst(count, DEREZ.pixelSize, colors);
}

/**
 * Show a stream `tick` ticks into it (lasting `ticks`) from `from` to `to`
 * (stream-fx.js ends, in world coordinates); `tick` null (or the stream
 * over) hides it.
 * @param {InstancedMesh} mesh from createStream()
 * @param {number|null} tick may be fractional
 * @param {number} ticks
 * @param {import('./stream-fx.js').StreamEnd} from
 * @param {import('./stream-fx.js').StreamEnd} to
 */
export function placeStream(mesh, tick, ticks, from, to) {
  placePixels(mesh, tick === null ? [] : streamPixels(tick, ticks, from, to), [0, 0, 0]);
}
