/**
 * Screen layout math for resolution independence (no DOM, no WebGL, so it
 * is unit tested). The game is always framed at 16:9 and letterboxed; sizes
 * that should look the same at any resolution are given "at 1080p" and
 * scaled by the render height.
 */

/** Frame aspect ratio. */
export const ASPECT = 16 / 9;

/** Sizes given "in pixels" are pixels at this render height. */
export const REFERENCE_HEIGHT = 1080;

/** devicePixelRatio is capped here so 4K/Retina screens don't overload the GPU. */
export const MAX_PIXEL_RATIO = 2;

/**
 * From this many buffer pixels per CSS pixel on, multisampling is off: the
 * buffer is dense enough that lines look smooth without it, and MSAA on top
 * of a high-DPI buffer is the costliest thing the GPU does.
 */
export const MSAA_MAX_PIXEL_RATIO = 1.5;

/** Allowed render scale range (share of the full resolution). */
export const MIN_RENDER_SCALE = 0.5;
export const MAX_RENDER_SCALE = 1;

/**
 * Largest 16:9 rectangle centered in the window, in CSS pixels.
 * @param {number} windowWidth
 * @param {number} windowHeight
 */
export function fitLetterbox(windowWidth, windowHeight) {
  let width = windowWidth;
  let height = Math.round(width / ASPECT);
  if (height > windowHeight) {
    height = windowHeight;
    width = Math.round(height * ASPECT);
  }
  return {
    x: Math.floor((windowWidth - width) / 2),
    y: Math.floor((windowHeight - height) / 2),
    width,
    height,
  };
}

/** @param {number} scale */
export function clampRenderScale(scale) {
  if (!Number.isFinite(scale)) return MAX_RENDER_SCALE;
  return Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, scale));
}

/**
 * Drawing buffer size for a canvas of the given CSS size.
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {number} devicePixelRatio
 * @param {number} renderScale 0.5–1
 */
export function bufferSize(cssWidth, cssHeight, devicePixelRatio, renderScale) {
  const ratio = bufferPixelRatio(devicePixelRatio, renderScale);
  return {
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
  };
}

/**
 * Buffer pixels per CSS pixel: the capped devicePixelRatio times the render scale.
 * @param {number} devicePixelRatio
 * @param {number} renderScale 0.5–1
 */
export function bufferPixelRatio(devicePixelRatio, renderScale) {
  return Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO) * clampRenderScale(renderScale);
}

/**
 * MSAA samples to use for `samples` asked for at a buffer pixel ratio:
 * none on a dense (high-DPI) buffer (MSAA_MAX_PIXEL_RATIO).
 * @param {number} samples
 * @param {number} pixelRatio from bufferPixelRatio()
 */
export function effectiveMultisampling(samples, pixelRatio) {
  return pixelRatio >= MSAA_MAX_PIXEL_RATIO ? 0 : samples;
}

/**
 * Scale a size given at 1080p to a render height.
 * @param {number} size
 * @param {number} renderHeight
 */
export function scaleToHeight(size, renderHeight) {
  return (size * renderHeight) / REFERENCE_HEIGHT;
}
