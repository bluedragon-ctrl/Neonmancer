/**
 * Geometry primitives shared by many views. They are marked shared()
 * (neon.js), so disposeTree() never frees them with a room.
 */
import { BoxGeometry } from 'three';
import { shared } from './neon.js';

/** Unit cube with its corner at the origin (a grid cell): blocks, objects, glass. */
export const UNIT_BOX = shared(new BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5));

/** Unit cube centered on the origin, scaled into place per instance: pixels, lights. */
export const CUBE = shared(new BoxGeometry(1, 1, 1));
