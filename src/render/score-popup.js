/**
 * Score popups (D100): a pickup that scores floats its points ("+50") up
 * from where it lay, in its own color, and fades. Drawn over everything
 * (no depth test), sized in world units so it scales with the view.
 */
import { CanvasTexture, Color, Group, LinearFilter, Sprite, SpriteMaterial } from 'three';

/** Timing in seconds, sizes in units. */
export const SCORE_POPUP = {
  /** How long one shows, how far it rises, and when it starts fading. */
  seconds: 1.6,
  rise: 1.1,
  fadeFrom: 0.55,
  /** It starts this far above the pickup's middle. */
  lift: 0.5,
  /** Height of its text; the width follows the text. */
  height: 0.55,
  /** Glow of its color (above 1 blooms). */
  brightness: 1.8,
  /** Canvas pixels per unit of height, and the font. */
  resolution: 128,
  font: "700 {size}px Orbitron, 'Segoe UI', sans-serif",
};

/**
 * Where a popup is `t` seconds in: how far it has risen (easing out) and
 * how opaque it is; null once it is gone.
 * @param {number} t
 * @returns {{ rise: number, opacity: number }|null}
 */
export function popupState(t) {
  const { seconds, rise, fadeFrom } = SCORE_POPUP;
  if (t >= seconds) return null;
  const k = Math.max(0, t) / seconds;
  return {
    rise: rise * (1 - (1 - k) ** 3),
    opacity: k < fadeFrom ? 1 : 1 - (k - fadeFrom) / (1 - fadeFrom),
  };
}

/** A texture with the text in white (the material colors it) and its aspect ratio. */
function textTexture(text) {
  const { resolution, font } = SCORE_POPUP;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const size = Math.round(resolution * 0.7);
  context.font = font.replace('{size}', size);
  const pad = size * 0.3;
  canvas.width = Math.ceil(context.measureText(text).width + pad * 2);
  canvas.height = resolution;
  // Resizing clears the context's state.
  context.font = font.replace('{size}', size);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff';
  context.shadowColor = '#fff';
  context.shadowBlur = size * 0.15;
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  return { texture, aspect: canvas.width / canvas.height };
}

export class ScorePopups {
  constructor() {
    this.group = new Group();
    /** @type {{ sprite: Sprite, at: number[], time: number }[]} */
    this.popups = [];
  }

  /**
   * A new popup.
   * @param {{ points: number, at: number[], color?: string }} event a 'score' game event
   */
  add({ points, at, color = '#ffffff' }) {
    const { texture, aspect } = textTexture(`+${points}`);
    const material = new SpriteMaterial({ map: texture, color: new Color(color).multiplyScalar(SCORE_POPUP.brightness), transparent: true, depthTest: false, depthWrite: false });
    const sprite = new Sprite(material);
    sprite.scale.set(SCORE_POPUP.height * aspect, SCORE_POPUP.height, 1);
    sprite.renderOrder = 10;
    this.group.add(sprite);
    this.popups.push({ sprite, at: [...at], time: 0 });
    this.update(0);
  }

  /** @param {number} dt seconds since the last frame */
  update(dt) {
    this.popups = this.popups.filter((popup) => {
      popup.time += dt;
      const state = popupState(popup.time);
      if (!state) {
        this.remove(popup);
        return false;
      }
      const [x, y, z] = popup.at;
      popup.sprite.position.set(x, y + SCORE_POPUP.lift + state.rise, z);
      popup.sprite.material.opacity = state.opacity;
      return true;
    });
  }

  /** Every popup goes (a new room). */
  clear() {
    for (const popup of this.popups) this.remove(popup);
    this.popups = [];
  }

  remove({ sprite }) {
    this.group.remove(sprite);
    // Sprites share one geometry: only the material and its texture are this popup's own.
    sprite.material.map.dispose();
    sprite.material.dispose();
  }
}
