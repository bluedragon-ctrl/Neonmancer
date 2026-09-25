/**
 * Views of moving things: they read the game state once per frame and
 * place their meshes at the interpolated position between the last two
 * ticks, so motion is smooth at any refresh rate.
 */
import { AdditiveBlending, Color, Group, Mesh, Plane, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { PALETTE } from './neon.js';
import { fadingDrops } from './hole-view.js';
import { createObjectView } from './room-view.js';
import { createWizard } from './wizard.js';

/** Linear interpolation between two positions. */
export function lerpPosition(prev, curr, alpha) {
  return prev.map((p, i) => p + (curr[i] - p) * alpha);
}

/** Interpolate angles the short way round. */
export function lerpAngle(a, b, t) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

/** Shadow lift above the surface, so it never fights with the floor or block tops. */
const SHADOW_LIFT = 0.01;

const shadowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A glowing ring with a soft filled center, fading to nothing at the edge.
const shadowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    float ring = smoothstep(0.55, 0.8, r) * (1.0 - smoothstep(0.8, 1.0, r));
    float fill = 0.12 * (1.0 - smoothstep(0.0, 0.8, r));
    gl_FragColor = vec4(uColor * (ring * 0.5 + fill) * uOpacity, 1.0);
  }
`;

/**
 * Glowing drop shadow directly under a body (CLAUDE.md §4): additive, so it
 * glows on dark surfaces; smaller and fainter the higher the body is.
 * @param {number|string} color
 */
export function createDropShadow(color) {
  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: 1 },
    },
    vertexShader: shadowVertex,
    fragmentShader: shadowFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

/**
 * Size and brightness of a drop shadow for a body `height` units above the
 * surface (pure, tested).
 */
export function shadowScale(height) {
  const t = Math.min(Math.max(height, 0) / 3, 1);
  return { scale: 1 - 0.45 * t, opacity: 1 - 0.6 * t };
}

export class PlayerView {
  /**
   * @param {import('../game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.group = new Group();
    this.wizard = createWizard();
    this.shadow = createDropShadow(PALETTE.cyan);
    this.group.add(this.wizard, this.shadow);
  }

  /** @param {number} alpha interpolation factor 0..1 between the last two ticks */
  sync(alpha) {
    const player = this.game.player;
    const pos = lerpPosition(player.prev, player.pos, alpha);

    this.wizard.position.set(pos[0], pos[1], pos[2]);
    this.wizard.rotation.y = lerpAngle(player.prevFacing, player.facing, alpha);

    const ground = player.dead ? null : this.game.shadowHeight(pos, player.size);
    this.shadow.visible = ground !== null;
    if (ground !== null) {
      const { scale, opacity } = shadowScale(pos[1] - ground);
      const diameter = player.size[0] * 1.5 * scale;
      this.shadow.position.set(pos[0], ground + SHADOW_LIFT, pos[2]);
      this.shadow.scale.set(diameter, diameter, 1);
      this.shadow.material.uniforms.uOpacity.value = opacity;
    }
  }
}

/**
 * Nothing of an object is drawn below the floor: one sinking into a hole
 * disappears into the pit, and a plugged hole shows only the object's top,
 * flush with the floor, plus short corner lines fading into the pit like
 * the pit's own. (A hair below 0, so edges lying on the floor stay.)
 */
const FLOOR_CLIP = [new Plane(new Vector3(0, 1, 0), 0.01)];

export class PushableView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/pushable.js').Pushable} pushable
   */
  constructor(game, pushable) {
    this.game = game;
    this.pushable = pushable;
    this.group = new Group();
    // The object view is built at the origin and moved as a whole.
    this.block = createObjectView({ ...pushable.object, at: [0, 0, 0] });
    this.block.traverse((node) => {
      for (const material of [node.material ?? []].flat()) material.clippingPlanes = FLOOR_CLIP;
    });
    this.shadow = createDropShadow(pushable.object.color);
    // Shown once the object plugs a hole: its vertical edges fade into the pit.
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
    this.plugDrops = fadingDrops(corners, 1, pushable.object.color, 1, 2.5);
    this.plugDrops.visible = false;
    this.group.add(this.block, this.shadow, this.plugDrops);
  }

  /** @param {number} alpha interpolation factor 0..1 between the last two ticks */
  sync(alpha) {
    const { pushable } = this;
    const pos = lerpPosition(pushable.prev, pushable.pos, alpha);
    this.block.position.set(pos[0], pos[1], pos[2]);
    this.plugDrops.visible = pushable.state === 'plugged';
    this.plugDrops.position.set(pos[0], pos[1], pos[2]);

    // Drop shadow only while falling (CLAUDE.md §4).
    const ground = pushable.state === 'fall' ? this.game.objectShadowHeight(pushable, pos) : null;
    this.shadow.visible = ground !== null;
    if (ground !== null) {
      const { scale, opacity } = shadowScale(pos[1] - ground);
      const diameter = 1.3 * scale;
      this.shadow.position.set(pos[0] + 0.5, ground + SHADOW_LIFT, pos[2] + 0.5);
      this.shadow.scale.set(diameter, diameter, 1);
      this.shadow.material.uniforms.uOpacity.value = opacity;
    }
  }
}
