/**
 * Hologram look for characters (the wizard, later monsters), decision D22:
 * a near-black core that glows towards the silhouette, faint scanlines
 * drifting up, a thin neon outline and glowing eyes.
 *
 * Widths are in world units. The camera framing is fixed (D2), so they
 * scale with the render height by themselves.
 */
import { BackSide, Color, Group, Mesh, MeshBasicMaterial, ShaderMaterial } from 'three';

/** Shared clock in seconds for the scanlines; advance it once per frame. */
export const HOLO_TIME = { value: 0 };

/** Outline width in world units. */
const OUTLINE_WIDTH = 0.012;

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

// Rim glow: surfaces seen edge-on (view normal across the view) light up.
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec3 vViewNormal;
  varying float vWorldY;
  void main() {
    float rim = pow(1.0 - abs(normalize(vViewNormal).z), 4.0);
    float scan = 0.5 + 0.5 * sin((vWorldY - uTime * 0.6) * 60.0);
    gl_FragColor = vec4(uColor * (0.05 + rim * 1.3 + scan * 0.06), 1.0);
  }
`;

/** @param {number|string} color */
export function holoMaterial(color) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uTime: HOLO_TIME },
    vertexShader,
    fragmentShader,
  });
}

/**
 * Outline by the inverted hull: the back faces of the mesh pushed out along
 * the normals, in a bright color.
 * @param {number|string} color
 * @param {number} [width] in world units
 */
export function outlineMaterial(color, width = OUTLINE_WIDTH) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color).multiplyScalar(1.6) }, uWidth: { value: width } },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uWidth, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
    side: BackSide,
  });
}

/** Cache of materials per color, so parts of one color share them. */
const cache = new Map();

/**
 * One hologram part: the glowing solid plus its outline.
 * Geometry needs smooth normals (e.g. SphereGeometry, CylinderGeometry).
 * @param {import('three').BufferGeometry} geometry
 * @param {number|string} color
 */
export function holoPart(geometry, color) {
  const key = new Color(color).getHexString();
  if (!cache.has(key)) cache.set(key, { solid: holoMaterial(color), outline: outlineMaterial(color) });
  const { solid, outline } = cache.get(key);
  const group = new Group();
  group.add(new Mesh(geometry, solid), new Mesh(geometry, outline));
  return group;
}

/** Bright material for glowing eyes (above 1, so bloom picks it up). */
export function eyeMaterial() {
  return new MeshBasicMaterial({ color: new Color(0xffffff).multiplyScalar(2.2) });
}
