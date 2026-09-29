/**
 * Glass look (prototype, showcase only for now): see-through faces for
 * objects and blocks, so a crate reads as a block of material rather than
 * an item. What lies behind shows through dimmed and tinted; the faces
 * glow a little towards their borders and carry a fixed diagonal glint.
 *
 * The faces are one small transparent ShaderMaterial with premultiplied
 * alpha: `gl_FragColor.rgb` is the light the glass adds, `a` how much of
 * what's behind it hides. They draw in three.js's transparent pass, after
 * everything opaque, and write no depth, so the object's own back edges
 * and anything behind it (the wizard, other blocks) show through; the
 * edges lying on the front faces still win (polygonOffset, like
 * faceMaterial()). Only front faces draw, so each point behind is tinted
 * once. No extra render pass: a few triangles per object.
 */
import { Color, ShaderMaterial } from 'three';

/** Tuning; brightness values are raw colors (the bloom threshold is 0.12). */
export const GLASS = {
  /** Share of what's behind that the glass hides (0 = clear, 1 = opaque). */
  alpha: 0.58,
  /** Body color, as a share of the object color. */
  tint: 0.1,
  /** Glow towards the face borders: brightness and how far in (share of a face). */
  rim: 0.22,
  rimWidth: 0.22,
  /** The diagonal glint: brightness (white) and where it crosses a face. */
  glint: 0.3,
  glintAt: 0.62,
  /** Share of the object color the glint takes (0 = white). */
  glintTint: 0.4,
  /** The data core of a crate with a mark: size (units) inside the glass. */
  coreSize: 0.5,
  /** Hazard and void blocks as glass: how much of what's behind they hide. */
  hazardAlpha: 0.5,
  voidAlpha: 0.75,
};

// Local position in the unit cell (the geometry runs 0..1) and the face normal.
const vertexShader = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormal;
  void main() {
    vLocal = position;
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uTint;
  uniform float uRim;
  uniform float uRimWidth;
  uniform float uGlint;
  uniform float uGlintAt;
  uniform float uGlintTint;
  varying vec3 vLocal;
  varying vec3 vNormal;
  void main() {
    vec3 n = abs(vNormal);
    vec2 uv = n.y > 0.5 ? vLocal.xz : n.x > 0.5 ? vLocal.zy : vLocal.xy;
    uv = clamp(uv, 0.0, 1.0);
    // Isometric shading like the other faces: top brightest, +z side darkest.
    float shade = vNormal.y > 0.5 ? 1.0 : abs(vNormal.x) > 0.5 ? 0.7 : 0.5;
    // Distance to the nearest face border: the glass thickens towards it.
    float d = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float rim = 1.0 - smoothstep(0.0, uRimWidth, d);
    rim *= rim;
    // A soft diagonal glint band; the top also gets a thin bright line
    // beside it (on the sides thin lines read as cracks).
    float g = (uv.x + uv.y) * 0.5;
    float glint = (1.0 - smoothstep(0.0, 0.1, abs(g - uGlintAt))) * 0.5;
    if (vNormal.y > 0.5) glint += 1.0 - smoothstep(0.0, 0.015, abs(g - uGlintAt - 0.14));
    vec3 glintColor = mix(vec3(1.0), uColor, uGlintTint);
    vec3 light = uColor * (uTint + rim * uRim) * shade + glintColor * glint * uGlint * shade;
    float alpha = uAlpha * (0.8 + 0.2 * shade) + rim * 0.2;
    gl_FragColor = vec4(light, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * See-through glass faces in an object's color, for a unit-cell geometry
 * running 0..1 (room-view.js UNIT_BOX).
 * @param {number|string|Color} color
 */
export function glassFaceMaterial(color) {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uAlpha: { value: GLASS.alpha },
      uTint: { value: GLASS.tint },
      uRim: { value: GLASS.rim },
      uRimWidth: { value: GLASS.rimWidth },
      uGlint: { value: GLASS.glint },
      uGlintAt: { value: GLASS.glintAt },
      uGlintTint: { value: GLASS.glintTint },
    },
    vertexShader,
    fragmentShader,
    ...GLASS_BLEND,
  });
}

/**
 * Material settings every glass face shares: transparent, premultiplied,
 * no depth written, pushed back in depth so edges on the face win.
 */
export const GLASS_BLEND = {
  transparent: true,
  premultipliedAlpha: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
};

/**
 * Segments shrunk towards the center of a cell: a face mark drawn on a
 * smaller cube inside the glass (the crate's data core).
 * @param {number[][][]} segments
 * @param {number[]} cell [x, y, z]
 * @param {number} size edge of the inner cube (units)
 */
export function shrinkSegments(segments, cell, size) {
  const center = cell.map((c) => c + 0.5);
  return segments.map((segment) => segment.map((p) => p.map((v, i) => center[i] + (v - center[i]) * size)));
}
