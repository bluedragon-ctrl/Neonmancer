/**
 * Infinite grid floor fading into darkness.
 *
 * One large plane at y = 0 with a shader that draws unit grid lines. Lines
 * use the room color inside the room; outside they are dim (the biome's
 * outer grid color, clearly not part of the room) and fade out with
 * distance from it; the plane itself has the background color, so it
 * melts into the background.
 * Hole tiles are cut out of the plane (a small mask texture), so the pit
 * below them shows through.
 *
 * Data flows (D179, a biome's `flows`): now and then a short bright dash
 * runs along a grid line, inside the room and on the grid outside it,
 * fading with that grid. Each line has its own speed, direction and gap,
 * from a hash of its index: decoration, not a guide. All in the floor's
 * own shader, so no extra pass or object.
 *
 * Space (D182, a biome's `stars`, `nebula` and `blackHole`): outside the
 * room the floor is void with a starfield in three layers, faint clouds and
 * a black hole whose lensing bends the stars round it. Also in the floor's
 * shader: the plane is flat, so the hole's disk reads as an ellipse for free.
 */
import {
  Color,
  DataTexture,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { PALETTE, roomLook, scaleWithHeight } from './neon.js';

/** Floor plane size; far larger than anything the camera can see. */
const EXTENT = 400;

/** Grid line width in pixels at 1080p. */
const LINE_WIDTH = 1.5;

/** Data flows (D179); brightness values are raw colors (the bloom threshold is 0.12). */
export const FLOWS = {
  /** Dash length (units); its head is brightest, its tail fades. */
  dash: 1.4,
  /** Speed range (units a second). */
  speed: [1.2, 2.6],
  /** Distance between dashes on a line (units): one passes a point every gap / speed seconds. */
  gap: [18, 40],
  /** Brightness of a dash's head inside the room, and outside it (before the outer fade). */
  inside: 1.8,
  outside: 0.55,
};

/** Space (D182); brightness values are raw colors (the bloom threshold is 0.12). */
export const SPACE = {
  /** Black hole's centre, from the room's +x, -z corner (blocks): to the right of the room on screen. */
  holeOffset: [4.5, -4.5],
  /** Stars: [cells a block, share of cells with a star at density 1, size in pixels, brightness]. */
  layers: [[3, 0.35, 1.0, 0.4], [1.2, 0.3, 1.2, 0.6], [0.45, 0.25, 1.8, 0.9]],
};

const vertexShader = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPos = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uOuterColor;
  uniform vec3 uVoid;
  uniform vec2 uRoomMin;
  uniform vec2 uRoomMax;
  uniform float uLineWidth;
  uniform float uFade;
  uniform sampler2D uHoles;
  uniform float uTime;
  uniform float uFlows;
  uniform float uFlowInside;
  uniform float uFlowOutside;
  uniform float uDash;
  uniform vec2 uSpeed;
  uniform vec2 uGap;
  uniform float uStars;
  uniform float uNebula;
  uniform vec3 uHole;
  uniform vec4 uLayers[3];
  varying vec2 vPos;

  float hash(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  // Stars at position q: one at most per cell, each twinkling in its own time.
  float stars(vec2 q, float px) {
    float sum = 0.0;
    for (int l = 0; l < 3; l++) {
      vec4 layer = uLayers[l];
      vec2 cell = floor(q * layer.x);
      float h = hash2(cell + float(l) * 17.0);
      if (h > layer.y * uStars) continue;
      vec2 at = (cell + 0.2 + 0.6 * vec2(hash2(cell + 3.1), hash2(cell + 7.7))) / layer.x;
      float radius = px * layer.z;
      float d = length(q - at);
      float twinkle = 0.6 + 0.4 * sin(uTime * (0.6 + 2.0 * hash2(cell + 1.3)) + h * 60.0);
      sum += layer.w * twinkle * (1.0 - smoothstep(0.0, radius, d));
    }
    return sum;
  }

  // The void: faint clouds, stars, and a black hole (uHole: x, z, radius) that bends them.
  vec3 space(vec2 p, float px) {
    vec2 d = p - uHole.xy;
    float r = length(d);
    float rs = uHole.z;
    // Lensing: what shows at p lies nearer the hole, so the sky bunches round it.
    vec2 q = p;
    if (rs > 0.0) q = uHole.xy + d * (1.0 - min(rs * rs * 2.2 / max(r * r, 0.01), 0.96));
    float cloud = noise(q * 0.11 + vec2(uTime * 0.012, 0.0)) * noise(q * 0.23 - vec2(0.0, uTime * 0.01));
    vec3 col = uColor * uNebula * (cloud * cloud * 1.6) * 0.5;
    col += vec3(0.8, 0.85, 1.0) * mix(vec3(0.6, 0.55, 1.0), vec3(1.0), 0.5) * stars(q, px);
    if (rs > 0.0) {
      float ang = atan(d.y, d.x);
      // Disk: bright inner edge, outer edge dissolving, streaks turning with Doppler bias.
      float disk = smoothstep(rs * 1.05, rs * 1.4, r) * (1.0 - smoothstep(rs * 1.6, rs * 3.4, r));
      float streak = 0.55 + 0.45 * sin(ang * 3.0 + r * 1.7 - uTime * 0.9) * sin(ang * 5.0 - r * 0.8 - uTime * 0.4);
      float side = 0.65 + 0.35 * cos(ang - 0.9);
      float inner = 1.0 - smoothstep(rs * 1.05, rs * 2.2, r);
      vec3 hot = mix(uColor * 1.2, vec3(0.7, 0.65, 1.0), inner);
      col += hot * disk * streak * side * 0.7;
      // Photon ring: a thin bright line at the edge of the shadow.
      float ring = exp(-pow((r - rs * 1.03) / (rs * 0.05 + px), 2.0));
      col += vec3(0.6, 0.55, 1.0) * ring * 0.8;
      // The shadow itself is black, and so is a little around it.
      col *= smoothstep(rs * 0.98, rs * 1.03, r);
    }
    return col;
  }

  // A dash on the grid line with index i along an axis (0 or 1), at s
  // along the line: 1 at its head, fading to 0 at its tail.
  float flow(float i, float axis, float s) {
    float seed = i * 2.0 + axis;
    if (hash(seed) >= uFlows) return 0.0;
    float speed = mix(uSpeed.x, uSpeed.y, hash(seed + 0.31));
    float gap = mix(uGap.x, uGap.y, hash(seed + 0.57));
    float dir = hash(seed + 0.83) < 0.5 ? -1.0 : 1.0;
    float x = mod(uTime * speed + hash(seed + 0.11) * gap - dir * s, gap);
    return x < uDash ? 1.0 - x / uDash : 0.0;
  }

  void main() {
    vec2 outside = max(max(uRoomMin - vPos, vPos - uRoomMax), 0.0);
    float dist = length(outside);

    // Cut out hole tiles (one mask texel per floor tile).
    if (dist == 0.0) {
      vec2 tile = min(floor(vPos - uRoomMin), uRoomMax - uRoomMin - 1.0);
      if (texture2D(uHoles, (tile + 0.5) / (uRoomMax - uRoomMin)).r > 0.5) discard;
    }

    // Distance to the nearest grid line, in pixels.
    vec2 grid = abs(fract(vPos - 0.5) - 0.5) / fwidth(vPos);
    float halfWidth = uLineWidth * 0.5;
    float line = 1.0 - smoothstep(halfWidth - 0.5, halfWidth + 0.5, min(grid.x, grid.y));

    // Room color inside the room; dim gray outside, fading with distance.
    vec3 color = dist > 0.0 ? uOuterColor : uColor * 0.4;
    float strength = 1.0 - smoothstep(0.0, uFade, dist);

    // The room floor is faintly tinted, so black pits stand out against it.
    vec3 base = dist > 0.0 ? uVoid : mix(uVoid, uColor, 0.025);
    vec3 result = mix(base, color, line * strength);
    // Space (D182): the void outside the room, with no grid.
    bool inSpace = uStars > 0.0 || uNebula > 0.0 || uHole.z > 0.0;
    if (inSpace && dist > 0.0) result = uVoid + space(vPos, length(fwidth(vPos)));

    // Data flows on the nearest line along each axis.
    if (uFlows > 0.0 && line > 0.0) {
      vec2 nearest = floor(vPos + 0.5);
      float dash = grid.x < grid.y ? flow(nearest.x, 0.0, vPos.y) : flow(nearest.y, 1.0, vPos.x);
      float bright = dist > 0.0 ? uFlowOutside : uFlowInside;
      result += uColor * bright * dash * line * strength;
    }
    gl_FragColor = vec4(result, 1.0);
  }
`;

/**
 * Mask texture with one texel per floor tile: 255 where there is a hole.
 * @param {number} w room width
 * @param {number} d room depth
 * @param {number[][]} holes hole tiles as [x, z]
 */
function holeMask(w, d, holes) {
  const data = new Uint8Array(w * d);
  for (const [x, z] of holes) data[z * w + x] = 255;
  const texture = new DataTexture(data, w, d, RedFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.unpackAlignment = 1; // rows are w bytes, not padded to 4
  texture.needsUpdate = true;
  return texture;
}

/**
 * @param {number[]} size room size [x, y, z]
 * @param {number|string} [color] color of the grid lines inside the room
 * @param {number[][]} [holes] hole tiles as [x, z]
 * @param {object} [look] biome look (neon.js roomLook()): background, outer grid color and fade, data flows
 * @returns {Mesh} with `userData.update(dt)` running the data flows
 */
export function createFloor([w, , d], color = PALETTE.amber, holes = [], look = {}) {
  const { background, outerGrid, outerFade, flows, stars, nebula, blackHole } = roomLook(look);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new Color(color) },
      uOuterColor: { value: new Color(outerGrid) },
      uVoid: { value: new Color(background) },
      uRoomMin: { value: new Vector2(0, 0) },
      uRoomMax: { value: new Vector2(w, d) },
      uLineWidth: { value: LINE_WIDTH },
      uFade: { value: outerFade },
      uHoles: { value: holeMask(w, d, holes) },
      uTime: { value: 0 },
      uFlows: { value: flows },
      uFlowInside: { value: FLOWS.inside },
      uFlowOutside: { value: FLOWS.outside },
      uDash: { value: FLOWS.dash },
      uSpeed: { value: new Vector2(...FLOWS.speed) },
      uGap: { value: new Vector2(...FLOWS.gap) },
      uStars: { value: stars },
      uNebula: { value: nebula },
      uHole: { value: new Vector3(w + SPACE.holeOffset[0], SPACE.holeOffset[1], blackHole) },
      uLayers: { value: SPACE.layers.map((layer) => new Vector4(...layer)) },
    },
    // Keep the floor behind edges and faces lying on y = 0.
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  scaleWithHeight(material, LINE_WIDTH);

  const floor = new Mesh(new PlaneGeometry(EXTENT, EXTENT), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, 0, d / 2);
  floor.userData.update = (dt) => {
    material.uniforms.uTime.value += dt;
  };
  return floor;
}
