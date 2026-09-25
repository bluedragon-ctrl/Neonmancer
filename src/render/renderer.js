/**
 * WebGL renderer with a letterboxed, resolution-independent 16:9 stage.
 *
 * The stage is the largest 16:9 rectangle in the window; the rest is
 * letterbox. The drawing buffer is the stage size × capped devicePixelRatio
 * × render scale. The HUD lives in the stage and sizes itself with the CSS
 * variable --u (one pixel at 1080p).
 */
import { Color, Scene, WebGLRenderer } from 'three';
import { createIsoCamera } from './camera.js';
import { PALETTE, resizeLines } from './neon.js';
import { createComposer } from './post.js';
import { REFERENCE_HEIGHT, bufferSize, clampRenderScale, fitLetterbox } from './viewport.js';

export class Renderer {
  /**
   * @param {HTMLElement} container element that fills the window
   * @param {object} [options]
   * @param {number} [options.renderScale] 0.5–1, share of full resolution
   */
  constructor(container, { renderScale = 1 } = {}) {
    this.renderScale = clampRenderScale(renderScale);

    // No antialias or depth on the canvas itself: the composer renders into
    // its own multisampled buffers.
    this.webgl = new WebGLRenderer({
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.webgl.setPixelRatio(1); // the buffer size is computed in resize()
    // Materials can clip themselves (objects are cut off at the floor, see entity-view.js).
    this.webgl.localClippingEnabled = true;

    this.stage = document.createElement('div');
    this.stage.className = 'stage';
    this.stage.append(this.webgl.domElement);
    /** Black veil over the game (not the HUD) for room transitions. */
    this.veil = document.createElement('div');
    this.veil.className = 'veil';
    this.stage.append(this.veil);
    /** Overlay for DOM UI, scaled with the stage. */
    this.hud = document.createElement('div');
    this.hud.className = 'hud';
    this.stage.append(this.hud);
    container.append(this.stage);

    this.scene = new Scene();
    this.scene.background = new Color(PALETTE.void);
    this.camera = createIsoCamera();
    this.composer = createComposer(this.webgl, this.scene, this.camera);

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  /** Recompute the letterbox and buffer size (called on window resize). */
  resize() {
    const box = fitLetterbox(window.innerWidth, window.innerHeight);
    Object.assign(this.stage.style, {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
    this.stage.style.setProperty('--u', `${box.height / REFERENCE_HEIGHT}px`);

    const buffer = bufferSize(box.width, box.height, window.devicePixelRatio, this.renderScale);
    this.composer.setSize(buffer.width, buffer.height, false);
    resizeLines(buffer.width, buffer.height);
    this.bufferWidth = buffer.width;
    this.bufferHeight = buffer.height;
  }

  /** @param {number} scale 0.5–1 */
  setRenderScale(scale) {
    this.renderScale = clampRenderScale(scale);
    this.resize();
  }

  /** @param {number} level 0 (clear) to 1 (black) */
  setFade(level) {
    this.veil.style.opacity = String(level);
  }

  render() {
    this.composer.render();
  }
}
