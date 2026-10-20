/**
 * Visual quality: the Options presets and the automatic fallback (D76,
 * D277; pure, tested; no three.js or DOM).
 *
 * The Quality setting is Auto, Low, Medium or High; Render scale (50–100 %)
 * is the most any of them draws at (qualityFromSettings()). Low, Medium
 * and High are fixed. Auto starts at full quality and watches how long
 * frames take. When they run slow for a while (two windows in a row, so a
 * moment of browser throttling doesn't count), it steps down one level:
 * multisampling first (the costliest part of rendering on weak GPUs),
 * then the render scale.
 *
 * The first seconds after the start are not judged: a browser just
 * started, or a GPU still waking, draws slowly for a while and then
 * catches up (D277). Once frames have stayed fast for a while at a lower
 * level, it steps back up one level; a level it came up to that turns out
 * slow is the highest it tries again, so quality never flickers up and down.
 *
 * On a high-DPI screen multisampling is off anyway (viewport.js
 * effectiveMultisampling()), so its steps would change nothing there:
 * qualityLevels() leaves them out, and the render scale steps down first.
 *
 * A step that makes frames no faster means the GPU was not the limit (a
 * slow CPU, or a display that refreshes at 30 or 50 Hz): after two such
 * steps in a row it goes back to where frames were last judged and steps
 * down no further.
 */
import { bufferPixelRatio, effectiveMultisampling } from './viewport.js';

/** Quality levels, best first: MSAA samples and render scale. */
export const QUALITY_LEVELS = [
  { multisampling: 4, renderScale: 1 },
  { multisampling: 2, renderScale: 1 },
  { multisampling: 0, renderScale: 1 },
  { multisampling: 0, renderScale: 0.75 },
  { multisampling: 0, renderScale: 0.5 },
];

/**
 * The fixed presets (D277): MSAA samples and the most render scale they
 * draw at; the Render scale setting may lower it further.
 */
export const QUALITY_PRESETS = {
  high: { multisampling: 4, renderScale: 1 },
  medium: { multisampling: 2, renderScale: 1 },
  low: { multisampling: 0, renderScale: 0.75 },
};

/**
 * The quality levels as they come out on a screen with `devicePixelRatio`:
 * the MSAA each would really use, render scales no higher than
 * `maxScale`, steps that change nothing left out.
 * @param {number} devicePixelRatio
 * @param {number} [maxScale] the Render scale setting, 0.5–1
 * @returns {typeof QUALITY_LEVELS}
 */
export function qualityLevels(devicePixelRatio, maxScale = 1) {
  const levels = [];
  for (const { multisampling: samples, renderScale: scale } of QUALITY_LEVELS) {
    const renderScale = Math.min(scale, maxScale);
    const level = { multisampling: effectiveMultisampling(samples, bufferPixelRatio(devicePixelRatio, renderScale)), renderScale };
    const last = levels.at(-1);
    if (!last || last.multisampling !== level.multisampling || last.renderScale !== level.renderScale) levels.push(level);
  }
  return levels;
}

/**
 * What the Options settings ask for (D277): Auto's levels, or one fixed
 * quality.
 * @param {{ quality: string, renderScale: number }} settings ui/settings.js
 *   values: quality 'auto' | 'low' | 'medium' | 'high', render scale in
 *   tens of percent (5–10)
 * @param {number} devicePixelRatio
 * @returns {{ levels: typeof QUALITY_LEVELS } | { fixed: typeof QUALITY_LEVELS[number] }}
 */
export function qualityFromSettings({ quality, renderScale }, devicePixelRatio) {
  const maxScale = renderScale / 10;
  const preset = QUALITY_PRESETS[quality];
  if (!preset) return { levels: qualityLevels(devicePixelRatio, maxScale) };
  return { fixed: { multisampling: preset.multisampling, renderScale: Math.min(preset.renderScale, maxScale) } };
}

/** Tuning; times in seconds. */
export const AUTO_QUALITY = {
  /** Time ignored after each change (buffers reallocated, shaders compiled). */
  settle: 1,
  /** Time ignored at the start: a browser or GPU still waking draws slowly for a while (D277). */
  startSettle: 5,
  /** Frames are judged in windows of this much time. */
  window: 2,
  /** Longer frames are hitches (a room being built, a hidden tab) and left out. */
  hitch: 0.1,
  /** Average frame time above which a window is slow: below ~50 fps... */
  slow: 1 / 50,
  /** ...and slow windows in a row before quality steps down. */
  slowWindows: 2,
  /** Average frame time below which a window is fast enough to try a level up: ~56 fps... */
  fast: 1 / 56,
  /** ...and fast windows in a row before quality steps up (D277). */
  fastWindows: 5,
  /** Share of the longest frames of a window left out of its average. */
  trim: 0.1,
  /** A step must make frames at least this much faster to count as helping. */
  gain: 0.05,
};

/**
 * Average of the frame times, leaving out the longest `trim` share.
 * @param {number[]} times seconds
 */
export function trimmedMean(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const kept = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * (1 - AUTO_QUALITY.trim))));
  return kept.reduce((sum, t) => sum + t, 0) / kept.length;
}

export class AutoQuality {
  /**
   * @param {typeof QUALITY_LEVELS} [levels] best first (qualityLevels())
   * @param {number} [level] index into `levels` to start at
   */
  constructor(levels = QUALITY_LEVELS, level = 0) {
    this.levels = levels;
    this.level = level;
    /** No more steps down (until it steps up again): a step did not help, or there is nothing lower. */
    this.done = false;
    /** The best level it may step up to: one it came up to and found slow stays out (D277). */
    this.top = 0;
    /** Did it come up to this level and not yet see it hold? */
    this.raised = false;
    this.times = [];
    this.elapsed = 0;
    this.settling = AUTO_QUALITY.startSettle;
    /** Slow windows in a row at this level. */
    this.slowCount = 0;
    /** Fast windows in a row at this level. */
    this.fastCount = 0;
    /** The level last judged slow before stepping down, and its average frame time (null: none). */
    this.base = null;
  }

  /** Settings of the current level. */
  get settings() {
    return this.levels[this.level];
  }

  /**
   * Count one frame.
   * @param {number} interval seconds since the previous frame
   * @returns {typeof QUALITY_LEVELS[number] | null} the new settings when
   *   the level changed, else null
   */
  frame(interval) {
    if (!(interval > 0) || interval > AUTO_QUALITY.hitch) return null;
    if (this.settling > 0) {
      this.settling -= interval;
      return null;
    }
    this.times.push(interval);
    this.elapsed += interval;
    if (this.elapsed < AUTO_QUALITY.window) return null;
    const mean = trimmedMean(this.times);
    this.times = [];
    this.elapsed = 0;
    return this.judge(mean);
  }

  /** Decide on a full window with average frame time `mean`. */
  judge(mean) {
    if (mean <= AUTO_QUALITY.slow) {
      // Fast enough: the steps so far helped; watch on from here.
      this.base = null;
      this.slowCount = 0;
      if (mean > AUTO_QUALITY.fast || ++this.fastCount < AUTO_QUALITY.fastWindows) return null;
      // Fast for a while: this level holds, and the one above may too.
      this.fastCount = 0;
      this.raised = false;
      if (this.level <= this.top) return null;
      const level = this.change(this.level - 1);
      this.raised = true;
      this.done = false;
      return level;
    }
    this.fastCount = 0;
    if (this.done || ++this.slowCount < AUTO_QUALITY.slowWindows) return null;
    // A level it came up to and found slow is the best it tries from now on.
    if (this.raised) this.top = this.level + 1;
    this.raised = false;
    const helped = this.base === null || mean < this.base.mean * (1 - AUTO_QUALITY.gain);
    if (!helped && this.level - this.base.level >= 2) {
      // Two steps and no faster: quality is not what holds frames back.
      this.done = true;
      return this.change(this.base.level);
    }
    if (helped) this.base = { level: this.level, mean };
    if (this.level === this.levels.length - 1) {
      this.done = true;
      return null;
    }
    return this.change(this.level + 1);
  }

  /** Go to `level` and let the new buffers settle. */
  change(level) {
    this.level = level;
    this.settling = AUTO_QUALITY.settle;
    this.slowCount = 0;
    this.fastCount = 0;
    return this.settings;
  }
}
