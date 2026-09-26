/**
 * Animated looks of the damaging block types, so they read as active:
 *
 * - Hazard ("corrupt"): red pixels switching on and off at random over
 *   dark red faces, like corrupted data, inside steady red edges. A block
 *   that just hurt the wizard flares.
 * - Void ("static"): black faces that are windows into the block: layers
 *   of sparse grains behind each face (found along the view ray) slowly
 *   sink deeper, shrinking and fading, as if falling into the void;
 *   brighter through the top face (only landing on top kills); thin dim
 *   edges.
 *
 * Faces are one ShaderMaterial on the block type's instanced mesh; pixel
 * sizes are in world units and the patterns run in room coordinates, so a
 * wall of blocks reads as one surface and the look is the same at any
 * resolution. All motion is slow and edges never animate, so the outline
 * always shows exactly where the block is (no strobing).
 * Time comes from HOLO_TIME (advanced once per frame).
 */
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, ShaderMaterial } from 'three';
import { blockEdges } from './edges.js';
import { HOLO_TIME } from './holo.js';
import { lineMaterial, neonLines, shared } from './neon.js';

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
  void: {
    /** Grain grid per unit on each layer. */
    grains: 10,
    /** Layers of grains inside the block, how deep they reach (units)... */
    layers: 8,
    depth: 0.9,
    /** ...and seconds for a layer to sink from the surface to the bottom. */
    sinkTime: 9,
    /** Twinkle steps per second. */
    twinkleRate: 2,
    /** Brightness seen through the top face and through the sides. */
    topStatic: 1.4,
    sideStatic: 0.7,
    /** Edge width (px at 1080p) and brightness: a thin, dim frame. */
    edgeWidth: 1.4,
    edgeBrightness: 0.9,
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
    gl_FragColor = vec4(uColor * glow * faceShade(), 1.0);
  }
`;

const voidFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uGrains;
  uniform float uTwinkleRate;
  uniform float uTopStatic;
  uniform float uSideStatic;
  uniform float uLayers;
  uniform float uDepth;
  uniform float uSinkTime;
  ${common}
  // 2D coordinates of point p across a face with normal n.
  vec2 coordsOn(vec3 p, vec3 n) {
    n = abs(n);
    if (n.y > 0.5) return p.xz;
    if (n.x > 0.5) return p.zy;
    return p.xy;
  }
  void main() {
    bool top = vNormal.y > 0.5;
    vec3 ray = normalize(vViewDir);
    // How far along the view ray one unit of depth behind the face is.
    float perDepth = 1.0 / max(dot(ray, -vNormal), 0.05);
    vec3 cell = floor(vPos - vNormal * 0.01);
    float twinkle = floor(uTime * uTwinkleRate);
    vec3 color = vec3(0.0);
    // Layers of sparse grains behind the face, each sinking deeper and
    // fading out, then coming back near the surface with a new pattern.
    for (int i = 0; i < 12; i++) {
      if (float(i) >= uLayers) break;
      float flow = float(i) / uLayers + uTime / uSinkTime;
      float phase = fract(flow);
      float seed = float(i) * 31.0 + floor(flow) * 7.0;
      float depth = 0.03 + phase * uDepth;
      vec3 p = vPos + ray * depth * perDepth;
      // Only what lies inside this block (the view ray leaves it through a side).
      vec3 inside = step(cell, p) * step(p, cell + 1.0);
      if (inside.x * inside.y * inside.z < 0.5) continue;
      vec2 uv = coordsOn(p, vNormal) * uGrains;
      vec2 grain = floor(uv);
      float on = step(top ? 0.9 : 0.95, hash(vec3(grain, seed)));
      // Grains shrink with depth; each twinkles a little.
      vec2 d = abs(fract(uv) - 0.5);
      float size = 0.32 * (1.0 - 0.6 * phase);
      on *= step(d.x, size) * step(d.y, size);
      float light = smoothstep(0.0, 0.12, phase) * (1.0 - phase) * (1.0 - phase);
      light *= 0.6 + 0.4 * hash(vec3(grain, seed + twinkle));
      color += mix(vec3(0.7), uColor, 0.6) * on * light;
    }
    gl_FragColor = vec4(color * (top ? uTopStatic : uSideStatic), 1.0);
  }
`;

/** Common material setup: instanced faces pushed back in depth. */
function faceShader(fragmentShader, uniforms) {
  return new ShaderMaterial({
    uniforms: { uTime: HOLO_TIME, ...uniforms },
    vertexShader,
    fragmentShader,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/**
 * Faces of hazard blocks. `uniforms.uFlareCell` / `uFlare` (0..1) make one
 * block flare (see flareHazard()).
 * @param {number|string} color
 */
export function hazardFaceMaterial(color) {
  const fx = BLOCK_FX.hazard;
  return faceShader(hazardFragment, {
    uColor: { value: new Color(color) },
    uPixels: { value: fx.pixels },
    uFlickerRate: { value: fx.flickerRate },
    uDensity: { value: fx.density },
    uFlareCell: { value: [0, -10, 0] },
    uFlare: { value: 0 },
  });
}

/**
 * Faces of void blocks.
 * @param {number|string} color frame color, also tints the static and specks
 */
export function voidFaceMaterial(color) {
  const fx = BLOCK_FX.void;
  return faceShader(voidFragment, {
    uColor: { value: new Color(color) },
    uGrains: { value: fx.grains },
    uTwinkleRate: { value: fx.twinkleRate },
    uTopStatic: { value: fx.topStatic },
    uSideStatic: { value: fx.sideStatic },
    uLayers: { value: fx.layers },
    uDepth: { value: fx.depth },
    uSinkTime: { value: fx.sinkTime },
  });
}

/**
 * Steady edges of a block type: solid red for hazards, a thin dim frame
 * for void.
 * @param {number[][]} cells [x, y, z] cells
 * @param {'hazard'|'void'} type
 * @param {number|string} color
 */
export function activeBlockEdges(cells, type, color) {
  const { edgeWidth: width, edgeBrightness: brightness } = BLOCK_FX[type];
  return neonLines(blockEdges(cells), lineMaterial({ color, width, brightness }));
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

/** Unit cube with its corner at the origin, shared by every block view. */
const UNIT_BOX = shared(new BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5));

/**
 * A block type's cells in the active look: animated instanced faces and
 * edges. `userData.faces` is the face material (e.g. for flareHazard()).
 * @param {number[][]} cells [x, y, z] cells
 * @param {'hazard'|'void'} type
 * @param {number|string} color
 */
export function createActiveBlockView(cells, type, color) {
  const faces = type === 'hazard' ? hazardFaceMaterial(color) : voidFaceMaterial(color);
  const boxes = new InstancedMesh(UNIT_BOX, faces, cells.length);
  const matrix = new Matrix4();
  cells.forEach(([x, y, z], i) => boxes.setMatrixAt(i, matrix.makeTranslation(x, y, z)));
  const edges = activeBlockEdges(cells, type, color);
  edges.renderOrder = 3; // over plain block and wall lines lying in the same spot
  const group = new Group().add(boxes, edges);
  group.userData.faces = faces;
  return group;
}
