/**
 * X-ray outline (CLAUDE.md §4, D43): the parts of the wizard hidden behind
 * blocks show through them as a dim ghost with a bright rim, so he is never
 * lost behind a wall.
 *
 * How: each hologram part gets a copy drawn with the depth test reversed
 * (GreaterDepth), so it only lands where the world is nearer than him. The
 * copies draw after the world (render order XRAY_ORDER) and before the
 * wizard himself (CHARACTER_ORDER), so his own parts never count as
 * occluders and a visible part simply paints over its ghost. The ghost
 * writes no depth and adds its light (additive), so edges stay readable
 * through it.
 */
import { AdditiveBlending, Color, GreaterDepth, Mesh, ShaderMaterial } from 'three';
import { HOLO_TIME } from './holo.js';

/**
 * Highest render order of world things that can hide the wizard (block and
 * wall lines use up to 3); the ghost draws after them...
 */
export const XRAY_ORDER = 4;
/** ...and the wizard after the ghost. */
export const CHARACTER_ORDER = 5;

/** Look of the ghost. */
export const XRAY = {
  /** Brightness of the faint fill... */
  fill: 0.07,
  /** ...and of the rim where surfaces turn away (above the bloom threshold). */
  rim: 0.9,
  /** Scan bands across the fill, per unit of height. */
  bands: 14,
};

const vertexShader = /* glsl */ `
  varying vec3 vViewNormal;
  varying float vWorldY;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldY = world.y;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// A rim like the hologram's, but brighter at the edge and nearly empty
// inside: an outline, with faint bands drifting down through the fill.
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFill;
  uniform float uRim;
  uniform float uBands;
  uniform float uTime;
  uniform float uFlash;
  uniform vec3 uFlashColor;
  varying vec3 vViewNormal;
  varying float vWorldY;
  void main() {
    float rim = pow(1.0 - abs(normalize(vViewNormal).z), 2.5);
    float band = step(0.5, fract(vWorldY * uBands + uTime * 0.6));
    vec3 color = mix(uColor, uFlashColor, uFlash);
    gl_FragColor = vec4(color * (uFill * (0.5 + band) + rim * uRim), 1.0);
  }
`;

/**
 * @param {number|string|Color} color the part's own color
 * @param {ReturnType<typeof import('./holo.js').createFlash>} flash the
 *   character's flash uniforms, so a hit shows through walls too
 */
export function xrayMaterial(color, flash) {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uFill: { value: XRAY.fill },
      uRim: { value: XRAY.rim },
      uBands: { value: XRAY.bands },
      uTime: HOLO_TIME,
      uFlash: flash.amount,
      uFlashColor: flash.color,
    },
    vertexShader,
    fragmentShader,
    blending: AdditiveBlending,
    depthFunc: GreaterDepth,
    depthWrite: false,
    // Pulled towards the camera a hair, so a block face touching him (he
    // leans on it) doesn't flicker between hiding him and not.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

/**
 * Give a character model an x-ray ghost: every hologram part (holo.js
 * holoPart(), marked `userData.holoSolid`) gets a ghost copy, and the
 * model's own meshes move to CHARACTER_ORDER. The ghosts are children of
 * the model, so they follow its position, blinking (visible) and derez
 * squeeze (scale). Returns the ghost meshes (to hide them, e.g. while dead).
 * @param {import('three').Object3D} model e.g. from createWizard()
 * @returns {Mesh[]}
 */
export function addXray(model) {
  const { flash } = model.userData;
  const materials = new Map();
  const parts = [];
  model.traverse((node) => {
    if (node.isMesh) node.renderOrder = CHARACTER_ORDER;
    if (node.userData.holoSolid) parts.push(node);
  });
  return parts.map((part) => {
    const solid = part.userData.holoSolid;
    const key = solid.material.uniforms.uColor.value.getHexString();
    if (!materials.has(key)) materials.set(key, xrayMaterial(solid.material.uniforms.uColor.value, flash));
    const ghost = new Mesh(solid.geometry, materials.get(key));
    ghost.renderOrder = XRAY_ORDER;
    part.add(ghost);
    return ghost;
  });
}
