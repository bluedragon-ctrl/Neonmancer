/**
 * Animated looks of the damaging block types, so they read as active:
 *
 * - Hazard ("corrupt"): red pixels switching on and off at random over
 *   dark red faces, like corrupted data, inside steady red edges. A block
 *   that just hurt the wizard flares.
 * - Void: black mist (mist.js, D99).
 *
 * Faces are one ShaderMaterial on the block type's instanced mesh; pixel
 * sizes are in world units and the patterns run in room coordinates, so a
 * wall of blocks reads as one surface and the look is the same at any
 * resolution. All motion is slow and edges never animate, so the outline
 * always shows exactly where the block is (no strobing).
 * Time comes from HOLO_TIME (advanced once per frame).
 */
import { Color, Group, InstancedMesh, Matrix4, ShaderMaterial } from 'three';
import { blockEdges } from './edges.js';
import { UNIT_BOX } from './geometry.js';
import { GLASS, GLASS_BLEND } from './glass.js';
import { HOLO_TIME } from './holo.js';
import { createMistView } from './mist.js';
import { lineMaterial, neonLines } from './neon.js';

/** Tuning; pixel counts per world unit, rates per second. */
export const BLOCK_FX = {
  hazard: {
    /** Pixels per unit along a face. */
    pixels: 8,
    /** How often each pixel re-rolls on/off, per second (each on its own timer). */
    flickerRate: 1.5,
    /** Share of pixels lit at any time. */
    density: 0.3,
    /** Edge width (px at 1080p) and brightness. */
    edgeWidth: 2.5,
    edgeBrightness: 1.6,
    /** Seconds a block flares after hurting the wizard. */
    flareTime: 0.4,
  },
};

// Shared vertex shader: position in room coordinates (instance matrix only,
// not the model matrix, so the pattern turns with the object) and the face
// normal. Pushed back in depth by polygonOffset like faceMaterial().
const vertexShader = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 local = instanceMatrix * vec4(position, 1.0);
    vPos = local.xyz;
    vNormal = normal;
    // View ray in room coordinates: the camera looks along its −z axis
    // (the third row of the view matrix, in world space), turned back into
    // the object's space (block views are only moved and turned, not scaled).
    vec3 camZ = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    vViewDir = transpose(mat3(modelMatrix)) * -camZ;
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

// Helpers: a stable hash, and the 2D coordinates across the face the
// fragment is on (xz on top/bottom, zy on x sides, xy on z sides).
const common = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  float hash(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  vec2 faceCoords() {
    vec3 n = abs(vNormal);
    if (n.y > 0.5) return vPos.xz;
    if (n.x > 0.5) return vPos.zy;
    return vPos.xy;
  }
  // Isometric shading: top brightest, the +x side darker than the top, +z darkest.
  float faceShade() {
    if (vNormal.y > 0.5) return 1.0;
    if (abs(vNormal.x) > 0.5) return 0.7;
    return 0.5;
  }
`;

const hazardFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPixels;
  uniform float uFlickerRate;
  uniform float uDensity;
  uniform vec3 uFlareCell;
  uniform float uFlare;
  ${common}
  void main() {
    vec2 uv = faceCoords();
    vec2 cell = floor(uv * uPixels);
    // Which face of which block (the cell just inside the face, so pixels on
    // the face plane never split between two blocks).
    float face = dot(floor(vPos - vNormal * 0.01), vec3(17.0, 31.0, 7.0)) + dot(vNormal, vec3(3.0, 5.0, 11.0));
    // Each pixel switches on or off on its own timer, so they never change together.
    float tick = floor(uTime * uFlickerRate + hash(vec3(cell, face + 0.5)));
    float roll = hash(vec3(cell, tick * 1.37 + face));
    float lit = step(1.0 - uDensity, roll);
    // A dark gap around each pixel keeps them reading as pixels.
    vec2 inCell = fract(uv * uPixels);
    float square = step(0.12, inCell.x) * step(0.12, inCell.y);
    float glow = 0.07 + lit * square * (0.55 + 0.45 * hash(vec3(cell, tick * 1.37 + face + 7.0)));
    // Flare of the block that just hurt the wizard.
    vec3 inside = step(uFlareCell - 0.001, vPos) * step(vPos, uFlareCell + 1.001);
    glow += uFlare * inside.x * inside.y * inside.z * 0.8;
  #ifdef GLASS
    // Glass (glass.js): the lit pixels stay solid, the dark between them is see-through.
    float solid = max(lit * square, uFlare * inside.x * inside.y * inside.z);
    gl_FragColor = vec4(uColor * glow * faceShade(), mix(GLASS, 1.0, solid));
  #else
    gl_FragColor = vec4(uColor * glow * faceShade(), 1.0);
  #endif
  }
`;

/**
 * Common material setup: instanced faces pushed back in depth. With
 * `glass` (the share of what's behind the faces hide, glass.js) they are
 * see-through instead of solid.
 */
function faceShader(fragmentShader, uniforms, glass = null) {
  const settings = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  return new ShaderMaterial({
    uniforms: { uTime: HOLO_TIME, ...uniforms },
    vertexShader,
    fragmentShader,
    ...(glass === null ? settings : { ...GLASS_BLEND, defines: { GLASS: glass.toFixed(3) } }),
  });
}

/**
 * Faces of hazard blocks. `uniforms.uFlareCell` / `uFlare` (0..1) make one
 * block flare (see flareHazard()).
 * @param {number|string} color
 * @param {{ glass?: boolean }} [options] glass: see-through between the pixels (glass.js)
 */
export function hazardFaceMaterial(color, { glass = false } = {}) {
  const fx = BLOCK_FX.hazard;
  return faceShader(hazardFragment, {
    uColor: { value: new Color(color) },
    uPixels: { value: fx.pixels },
    uFlickerRate: { value: fx.flickerRate },
    uDensity: { value: fx.density },
    uFlareCell: { value: [0, -10, 0] },
    uFlare: { value: 0 },
  }, glass ? GLASS.hazardAlpha : null);
}

/**
 * Steady edges of the hazard look: solid red.
 * @param {number[][]} cells [x, y, z] cells
 * @param {'hazard'} look a block type's look (defs.json "blocks", D60)
 * @param {number|string} color
 * @param {Set<string>} [claimed] unit edges drawn by a more dangerous type, left out (edges.js)
 */
export function activeBlockEdges(cells, look, color, claimed = null) {
  const { edgeWidth: width, edgeBrightness: brightness } = BLOCK_FX[look];
  return neonLines(blockEdges(cells, claimed), lineMaterial({ color, width, brightness }));
}

/**
 * Make one hazard block flare, fading over BLOCK_FX.hazard.flareTime.
 * @param {ShaderMaterial} material from hazardFaceMaterial()
 * @param {number[]} cell [x, y, z] of the block
 * @param {number} since seconds since it hurt the wizard
 */
export function flareHazard(material, cell, since) {
  material.uniforms.uFlareCell.value = cell;
  material.uniforms.uFlare.value = Math.max(0, 1 - since / BLOCK_FX.hazard.flareTime);
}

/**
 * A block type's cells in an animated look: instanced faces and edges.
 * `userData.faces` is the face material (e.g. for flareHazard()).
 * @param {number[][]} cells [x, y, z] cells
 * @param {'hazard'|'void'} look a block type's look (defs.json "blocks", D60)
 * @param {number|string} color
 * @param {Set<string>} [claimed] unit edges drawn by a more dangerous type, left out (edges.js)
 * @param {{ glass?: boolean }} [options] glass: see-through hazard faces (glass.js, prototype)
 */
export function createActiveBlockView(cells, look, color, claimed = null, { glass = false } = {}) {
  if (look === 'void') return createMistView(cells, color, claimed);
  const faces = hazardFaceMaterial(color, { glass });
  const boxes = new InstancedMesh(UNIT_BOX, faces, cells.length);
  const matrix = new Matrix4();
  cells.forEach(([x, y, z], i) => boxes.setMatrixAt(i, matrix.makeTranslation(x, y, z)));
  const edges = activeBlockEdges(cells, look, color, claimed);
  edges.renderOrder = 3; // over plain block and wall lines lying in the same spot
  const group = new Group().add(boxes, edges);
  group.userData.faces = faces;
  return group;
}
