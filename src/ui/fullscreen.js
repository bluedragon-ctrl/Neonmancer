/**
 * Fullscreen: toggling it, and when to suggest it. The game targets at
 * least 1080 pixels of height (CLAUDE.md §3); below that the HUD shows a
 * hint for a while.
 */
import { REFERENCE_HEIGHT } from '../render/viewport.js';

/** Seconds the hint stays up each time it is needed. */
export const HINT_SECONDS = 8;

/**
 * Whether to suggest fullscreen: not in fullscreen and the stage has fewer
 * physical pixels of height than the target.
 * @param {number} stageHeight stage height in CSS pixels
 * @param {number} pixelRatio window.devicePixelRatio
 * @param {boolean} fullscreen whether the page is in fullscreen now
 */
export function wantsFullscreenHint(stageHeight, pixelRatio, fullscreen) {
  return !fullscreen && Math.round(stageHeight * pixelRatio) < REFERENCE_HEIGHT;
}

/**
 * Enter fullscreen, or leave it when already there. Must run soon after a
 * key press (browsers allow it only then); failures are ignored.
 * @param {HTMLElement} element shown in fullscreen
 */
export function toggleFullscreen(element) {
  const request = document.fullscreenElement ? document.exitFullscreen() : element.requestFullscreen?.();
  request?.catch?.(() => {});
}
