/**
 * Neon look: palette and materials.
 *
 * Line widths are given in pixels at 1080p and follow the render size:
 * new materials start at the current size, and resizeLines() updates all of
 * them, so lines look the same from 1080p to 4K.
 */
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { flattenSegments } from './edges.js';
import { scaleToHeight } from './viewport.js';

/** Base palette (sRGB hex). */
export const PALETTE = {
  void: 0x05060d,
  face: 0x070916,
  /** Floor grid outside the room: neutral, so it never reads as room. */
  outerGrid: 0x2a2d35,
  cyan: 0x00f0ff,
  magenta: 0xff2bd6,
  lime: 0xb6ff3c,
  amber: 0xffb020,
};

/** Dash pattern in world units; one dash + gap = 1/4 block, so dashes line up with block corners. */
const DASH_SIZE = 0.14;
const GAP_SIZE = 0.11;

/** Every material whose width follows the render height. */
const scaledMaterials = new Set();

/** Current drawing buffer size (set by resizeLines). */
const buffer = { width: 1920, height: 1080 };

/** Set a material's pixel width for the current buffer size. */
function applyScale(material) {
  const px = scaleToHeight(material.userData.baseWidth, buffer.height);
  if (material.isLineMaterial) {
    material.resolution.set(buffer.width, buffer.height);
    material.linewidth = px;
  } else {
    material.uniforms.uLineWidth.value = px;
  }
}

/**
 * Glowing line material for LineSegments2.
 * @param {object} options
 * @param {number|string} options.color palette color
 * @param {number} [options.width] line width in pixels at 1080p
 * @param {number} [options.brightness] color multiplier; above 1 glows more
 * @param {boolean} [options.dashed] dashed instead of solid (the line object
 *   needs computeLineDistances())
 */
export function lineMaterial({ color, width = 2, brightness = 1, dashed = false }) {
  const material = new LineMaterial({
    color: new Color(color).multiplyScalar(brightness),
    linewidth: width,
    dashed,
    dashSize: DASH_SIZE,
    gapSize: GAP_SIZE,
  });
  scaleWithHeight(material, width);
  return material;
}

/**
 * Register a material so its line width follows the render height: a
 * LineMaterial, or a shader material with a `uLineWidth` uniform (pixels).
 * @param {import('three').Material} material
 * @param {number} width line width in pixels at 1080p
 */
export function scaleWithHeight(material, width) {
  material.userData.baseWidth = width;
  scaledMaterials.add(material);
  applyScale(material);
}

/**
 * Update line widths for a new drawing buffer size.
 * @param {number} width buffer width in pixels
 * @param {number} height buffer height in pixels
 */
export function resizeLines(width, height) {
  buffer.width = width;
  buffer.height = height;
  for (const material of scaledMaterials) applyScale(material);
}

/**
 * Dark solid faces that hide the edges behind them (decision D5). Pushed
 * slightly back in depth so edges lying on a face always draw on top.
 * @param {number|string|Color} [color]
 */
export function faceMaterial(color = PALETTE.face) {
  return new MeshBasicMaterial({
    color,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/**
 * Faces shaded in an object's color: top brightest, the two visible sides
 * darker, so the object reads as solid and "different" even in grayscale.
 * Returns one material per BoxGeometry face (+x, -x, +y, -y, +z, -z).
 * @param {number|string} color
 * @param {number} tint share of the object color in the top face (0–1)
 */
export function tintedFaceMaterials(color, tint) {
  const shade = (amount) => faceMaterial(new Color(PALETTE.face).lerp(new Color(color), amount));
  const top = shade(tint);
  const right = shade(tint * 0.6); // +x side
  const left = shade(tint * 0.4); // +z side
  return [right, right, top, top, left, left];
}

/**
 * Thick neon lines from segments.
 * @param {number[][][]} segments [[x, y, z], [x, y, z]] pairs
 * @param {LineMaterial} material
 */
export function neonLines(segments, material) {
  const line = new LineSegments2(new LineSegmentsGeometry().setPositions(flattenSegments(segments)), material);
  if (material.dashed) line.computeLineDistances();
  return line;
}

/**
 * Lines that fade from the color at their start to black at their end: they
 * read as depth (pit corners, doorway tunnels) or as a stream into the dark.
 * @param {number[][][]} segments each from its bright end to its dark end
 * @param {Parameters<typeof lineMaterial>[0]} options as for lineMaterial()
 */
export function fadingLines(segments, options) {
  const material = lineMaterial(options);
  material.vertexColors = true;
  const line = new LineSegments2(new LineSegmentsGeometry().setPositions(flattenSegments(segments)), material);
  line.geometry.setColors(segments.flatMap(() => [1, 1, 1, 0, 0, 0]));
  if (material.dashed) line.computeLineDistances();
  return line;
}

/**
 * Dark faces shaded per vertex (pits, doorway tunnels), pushed back in depth
 * like faceMaterial() so lines lying on them win.
 * @param {number[]} positions triangle vertices, flat [x, y, z, ...]
 * @param {number[]} colors one [r, g, b] per vertex, flat
 */
export function shadedFaces(positions, colors) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const material = faceMaterial(0xffffff);
  material.vertexColors = true;
  material.side = DoubleSide;
  return new Mesh(geometry, material);
}

/**
 * Mark a geometry or material shared between views, so disposeTree() leaves
 * it alone.
 * @template {{ userData: object }} T
 * @param {T} resource
 * @returns {T}
 */
export function shared(resource) {
  resource.userData.shared = true;
  return resource;
}

/**
 * Free the GPU resources of a scene subtree that is thrown away (a room
 * rebuilt on reset) and stop scaling its line materials. Shared resources
 * (see shared()) are kept.
 * @param {import('three').Object3D} root
 */
export function disposeTree(root) {
  root.traverse((node) => {
    if (node.geometry && !node.geometry.userData.shared) node.geometry.dispose();
    for (const material of [node.material ?? []].flat()) {
      if (material.userData.shared) continue;
      scaledMaterials.delete(material);
      // Textures in shader uniforms (the floor's hole mask) are not freed with the material.
      for (const uniform of Object.values(material.uniforms ?? {})) if (uniform.value?.isTexture) uniform.value.dispose();
      material.dispose();
    }
  });
}
