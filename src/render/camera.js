/**
 * Fixed isometric orthographic camera (decision D2).
 *
 * The camera looks from the +x +y +z direction (azimuth 45°, elevation
 * 35.26°) and always shows VIEW_HEIGHT world units vertically in a 16:9
 * frame, so every room is framed the same at any resolution. Even the
 * biggest legal room fits (see projectedHeight).
 */
import { OrthographicCamera, Vector3 } from 'three';
import { ASPECT } from './viewport.js';

/** World units visible from the bottom to the top of the frame. */
export const VIEW_HEIGHT = 20;

/** Direction from the look-at point towards the camera. */
export const ISO_DIRECTION = new Vector3(1, 1, 1).normalize();

/** Distance from the look-at point; any value works for an ortho camera. */
const DISTANCE = 100;

export function createIsoCamera() {
  const halfH = VIEW_HEIGHT / 2;
  const halfW = halfH * ASPECT;
  return new OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, DISTANCE * 2);
}

/**
 * Center the camera on a room.
 * @param {OrthographicCamera} camera
 * @param {number[]} size room size [x, y, z]
 */
export function frameRoom(camera, [w, h, d]) {
  const target = new Vector3(w / 2, h / 2, d / 2);
  camera.position.copy(target).addScaledVector(ISO_DIRECTION, DISTANCE);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

/**
 * On-screen height of a room box in world units: (w + d + 2h) / √6.
 * Must stay below VIEW_HEIGHT with some margin for every legal room.
 * @param {number[]} size room size [x, y, z]
 */
export function projectedHeight([w, h, d]) {
  return (w + d + 2 * h) / Math.sqrt(6);
}
