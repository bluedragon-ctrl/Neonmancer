/**
 * Hologram look for characters (the wizard, later monsters), decision D22:
 * a near-black core that glows towards the silhouette, faint scanlines
 * drifting up, a thin neon outline and glowing eyes. A character can
 * flash a solid color (a hit) through its own flash uniforms (createFlash()).
 *
 * Widths are in world units. The camera framing is fixed (D2), so they
 * scale with the render height by themselves.
 */
import { BackSide, Color, Group, Mesh, MeshBasicMaterial, ShaderMaterial } from 'three';

/** Shared clock in seconds for the scanlines; advance it once per frame. */
export const HOLO_TIME = { value: 0 };

/**
 * Flash uniforms for one character: `amount` 0..1 blends its whole
 * hologram, outline included, towards `color`. Each character that
 * flashes on its own gets its own (and so its own materials).
 */
export function createFlash() {
  return { amount: { value: 0 }, color: { value: new Color(0xffffff) } };
}

/** Flash of characters that never flash. */
const NO_FLASH = createFlash();

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
// Scanlines drift up slowly (0.2 units per second).
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uFlash;
  uniform vec3 uFlashColor;
  varying vec3 vViewNormal;
  varying float vWorldY;
  void main() {
    float rim = pow(1.0 - abs(normalize(vViewNormal).z), 4.0);
    float scan = 0.5 + 0.5 * sin((vWorldY - uTime * 0.2) * 60.0);
    vec3 holo = uColor * (0.05 + rim * 1.3 + scan * 0.06);
    // A flash fills the core too, bright enough for bloom, brightest at the rim.
    gl_FragColor = vec4(mix(holo, uFlashColor * (1.2 + rim), uFlash), 1.0);
  }
`;

/**
 * @param {number|string} color
 * @param {ReturnType<typeof createFlash>} [flash]
 */
export function holoMaterial(color, flash = NO_FLASH) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uTime: HOLO_TIME, uFlash: flash.amount, uFlashColor: flash.color },
    vertexShader,
    fragmentShader,
  });
}

/**
 * Outline by the inverted hull: the back faces of the mesh pushed out along
 * the normals, in a bright color.
 * @param {number|string} color
 * @param {number} [width] in world units
 * @param {ReturnType<typeof createFlash>} [flash]
 */
export function outlineMaterial(color, width = OUTLINE_WIDTH, flash = NO_FLASH) {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color).multiplyScalar(1.6) },
      uWidth: { value: width },
      uFlash: flash.amount,
      uFlashColor: flash.color,
    },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uWidth, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFlash;
      uniform vec3 uFlashColor;
      void main() { gl_FragColor = vec4(mix(uColor, uFlashColor * 2.0, uFlash), 1.0); }
    `,
    side: BackSide,
  });
}

/** Cache of materials per flash and color, so parts of one color share them. */
const cache = new WeakMap();

/**
 * One hologram part: the glowing solid plus its outline.
 * Geometry needs smooth normals (e.g. SphereGeometry, CylinderGeometry).
 * @param {import('three').BufferGeometry} geometry
 * @param {number|string} color
 * @param {ReturnType<typeof createFlash>} [flash] the character's flash uniforms
 */
export function holoPart(geometry, color, flash = NO_FLASH) {
  if (!cache.has(flash)) cache.set(flash, new Map());
  const materials = cache.get(flash);
  const key = new Color(color).getHexString();
  if (!materials.has(key)) {
    materials.set(key, { solid: holoMaterial(color, flash), outline: outlineMaterial(color, OUTLINE_WIDTH, flash) });
  }
  const { solid, outline } = materials.get(key);
  const group = new Group();
  group.add(new Mesh(geometry, solid), new Mesh(geometry, outline));
  return group;
}

/** Bright material for glowing eyes (above 1, so bloom picks it up). */
export function eyeMaterial() {
  return new MeshBasicMaterial({ color: new Color(0xffffff).multiplyScalar(2.2) });
}
