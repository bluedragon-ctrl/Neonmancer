/**
 * Glass look (D96): see-through faces, so a crate reads as a block of
 * material rather than an item. Every crate type is glass (`"faces":
 * "glass"` in defs.json); hazard blocks have a glass option that is not
 * used yet (showcase only). The glass is frosted: what lies behind
 * shows through dimmed and milky; the faces glow a little towards their
 * borders and carry a fine static frost grain.
 *
 * The faces are one small transparent ShaderMaterial with premultiplied
 * alpha: `gl_FragColor.rgb` is the light the glass adds, `a` how much of
 * what's behind it hides. They draw in three.js's transparent pass, after
 * everything opaque, and write no depth, so the object's own back edges
 * and anything behind it (the wizard, other blocks) show through; the
 * edges lying on the front faces still win (polygonOffset, like
 * faceMaterial()). Only front faces draw, so each point behind is tinted
 * once. No extra render pass: a few triangles per object. The faces
 * honor clipping planes (a crate sinking into a hole is cut at the floor).
 */
import { Color, ShaderMaterial } from 'three';

/** Tuning; brightness values are raw colors (the bloom threshold is 0.12). */
export const GLASS = {
  /** Share of what's behind that the glass hides (0 = clear, 1 = opaque). */
  alpha: 0.7,
  /** Body color, as a share of the object color... */
  tint: 0.15,
  /** ...mixed this much towards white: frosted glass looks milky. */
  milk: 0.25,
  /** Glow towards the face borders: brightness and how far in (share of a face). */
  rim: 0.14,
  rimWidth: 0.25,
  /** Frost grain: cells per unit along a face and how much they vary the body. */
  frostGrain: 24,
  frost: 0.35,
  /** The data core of a crate with a mark: size (units) inside the glass. */
  coreSize: 0.5,
  /**
   * A destructible object is an empty shell of thinner glass (D99): no
   * core, less of what's behind hidden and a fainter tint, so it reads as
   * fragile. Values replacing the ones above.
   */
  hollow: { alpha: 0.35, tint: 0.08 },
  /** Hazard blocks as glass: how much of what's behind they hide. */
  hazardAlpha: 0.5,
};

// Local position in the unit cell (the geometry runs 0..1) and the face normal.
const vertexShader = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  varying vec3 vLocal;
  varying vec3 vNormal;
  void main() {
    vLocal = position;
    vNormal = normal;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uTint;
  uniform float uRim;
  uniform float uRimWidth;
  uniform float uMilk;
  uniform float uFrostGrain;
  uniform float uFrost;
  varying vec3 vLocal;
  varying vec3 vNormal;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    vec3 n = abs(vNormal);
    vec2 uv = n.y > 0.5 ? vLocal.xz : n.x > 0.5 ? vLocal.zy : vLocal.xy;
    uv = clamp(uv, 0.0, 1.0);
    // Isometric shading like the other faces: top brightest, +z side darkest.
    float shade = vNormal.y > 0.5 ? 1.0 : abs(vNormal.x) > 0.5 ? 0.7 : 0.5;
    // Distance to the nearest face border: the glass thickens towards it.
    float d = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float rim = 1.0 - smoothstep(0.0, uRimWidth, d);
    rim *= rim;
    // Frost: a fine static grain, different on every face, that makes the
    // body a little lighter or darker cell by cell. No glint: every crate
    // is seen from the same angle, so one would repeat on all of them.
    vec2 cell = floor(uv * uFrostGrain);
    float face = dot(vNormal, vec3(3.0, 5.0, 7.0));
    float grain = fract(sin(dot(vec3(cell, face), vec3(12.9898, 78.233, 37.719))) * 43758.5453) - 0.5;
    vec3 body = mix(uColor, vec3(1.0), uMilk);
    vec3 light = body * (uTint * (1.0 + grain * uFrost) + rim * uRim) * shade;
    float alpha = uAlpha * (0.85 + 0.15 * shade) + rim * 0.15;
    gl_FragColor = vec4(light, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * See-through glass faces in an object's color, for a unit-cell geometry
 * running 0..1 (room-view.js UNIT_BOX).
 * @param {number|string|Color} color
 * @param {Partial<Pick<typeof GLASS, 'alpha'|'tint'|'milk'|'rim'|'frost'>>} [tuning]
 *   other values than GLASS's
 */
export function glassFaceMaterial(color, tuning = {}) {
  const { alpha, tint, milk, rim, rimWidth, frostGrain, frost } = { ...GLASS, ...tuning };
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uAlpha: { value: alpha },
      uTint: { value: tint },
      uRim: { value: rim },
      uRimWidth: { value: rimWidth },
      uMilk: { value: milk },
      uFrostGrain: { value: frostGrain },
      uFrost: { value: frost },
    },
    vertexShader,
    fragmentShader,
    clipping: true,
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

