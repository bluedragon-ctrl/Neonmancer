/**
 * Neon look: palette and materials.
 *
 * Line widths are given in pixels at 1080p and rescaled whenever the render
 * size changes (resizeLines), so lines look the same from 1080p to 4K.
 */
import { Color, MeshBasicMaterial } from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { scaleToHeight } from './viewport.js';

/** Base palette (sRGB hex). */
export const PALETTE = {
  void: 0x05060d,
  face: 0x070916,
  cyan: 0x00f0ff,
  magenta: 0xff2bd6,
  lime: 0xb6ff3c,
  amber: 0xffb020,
};

/** Every material whose width follows the render height. */
const scaledMaterials = new Set();

/**
 * Glowing line material for LineSegments2.
 * @param {object} options
 * @param {number} options.color palette color
 * @param {number} [options.width] line width in pixels at 1080p
 * @param {number} [options.brightness] color multiplier; above 1 glows more
 */
export function lineMaterial({ color, width = 2, brightness = 1 }) {
  const material = new LineMaterial({
    color: new Color(color).multiplyScalar(brightness),
    linewidth: width,
  });
  material.userData.baseWidth = width;
  scaledMaterials.add(material);
  return material;
}

/**
 * Register a shader material with a `uLineWidth` uniform (pixels) so it is
 * rescaled together with the line materials.
 * @param {import('three').ShaderMaterial} material
 * @param {number} width line width in pixels at 1080p
 */
export function scaleWithHeight(material, width) {
  material.userData.baseWidth = width;
  scaledMaterials.add(material);
}

/**
 * Update line widths for a new drawing buffer size.
 * @param {number} width buffer width in pixels
 * @param {number} height buffer height in pixels
 */
export function resizeLines(width, height) {
  for (const material of scaledMaterials) {
    const px = scaleToHeight(material.userData.baseWidth, height);
    if (material.isLineMaterial) {
      material.resolution.set(width, height);
      material.linewidth = px;
    } else {
      material.uniforms.uLineWidth.value = px;
    }
  }
}

/**
 * Dark solid faces that hide the edges behind them (decision D5). Pushed
 * slightly back in depth so edges lying on a face always draw on top.
 */
export function faceMaterial(color = PALETTE.face) {
  return new MeshBasicMaterial({
    color,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}
