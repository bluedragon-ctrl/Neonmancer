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

/** While the window is being resized, the drawing buffer follows after this pause (ms). */
const RESIZE_SETTLE_MS = 150;

export class Renderer {
  /**
   * @param {HTMLElement} container element that fills the window
   * @param {object} [options]
   * @param {number} [options.renderScale] 0.5–1, share of full resolution
   * @param {number} [options.multisampling] MSAA samples (0 turns it off; the
   *   costliest part of rendering on weak GPUs)
   */
  constructor(container, { renderScale = 1, multisampling = 4 } = {}) {
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
    this.composer = createComposer(this.webgl, this.scene, this.camera, { multisampling });
    this.fade = 0;

    // The stage follows the window at once (cheap); the buffers, which are
    // reallocated, only once resizing pauses.
    let settle = 0;
    window.addEventListener('resize', () => {
      this.layout();
      clearTimeout(settle);
      settle = setTimeout(() => this.resizeBuffer(), RESIZE_SETTLE_MS);
    });
    this.resize();
  }

  /** Recompute the letterbox and the buffer size. */
  resize() {
    this.layout();
    this.resizeBuffer();
  }

  /** Place the 16:9 stage in the window. */
  layout() {
    const box = fitLetterbox(window.innerWidth, window.innerHeight);
    Object.assign(this.stage.style, {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
    this.stage.style.setProperty('--u', `${box.height / REFERENCE_HEIGHT}px`);
    /** Stage size in CSS pixels. */
    this.stageWidth = box.width;
    this.stageHeight = box.height;
  }

  /** Size the drawing buffers and line widths to the stage. */
  resizeBuffer() {
    const buffer = bufferSize(this.stageWidth, this.stageHeight, window.devicePixelRatio, this.renderScale);
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
    if (level === this.fade) return;
    this.fade = level;
    this.veil.style.opacity = String(level);
  }

  /**
   * Compile the shaders of everything in the scene now. Called before the
   * old room's views are disposed, so the shaders both rooms use are kept
   * instead of being freed and compiled again.
   */
  compile() {
    this.webgl.compile(this.scene, this.camera);
  }

  render() {
    this.composer.render();
  }
}
