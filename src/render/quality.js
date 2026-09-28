/**
 * Automatic quality fallback (D76; pure, tested; no three.js or DOM).
 *
 * The game starts at full quality and watches how long frames take. When
 * they run slow for a while (two windows in a row, so a moment of browser
 * throttling doesn't count), it steps down one level: multisampling first
 * (the costliest part of rendering on weak GPUs), then the render scale.
 * It only ever steps down, so quality never flickers up and down.
 *
 * A step that makes frames no faster means the GPU was not the limit (a
 * slow CPU, or a display that refreshes at 30 or 50 Hz): after two such
 * steps in a row it goes back to where frames were last judged and stops.
 */

/** Quality levels, best first: MSAA samples and render scale. */
export const QUALITY_LEVELS = [
  { multisampling: 4, renderScale: 1 },
  { multisampling: 2, renderScale: 1 },
  { multisampling: 0, renderScale: 1 },
  { multisampling: 0, renderScale: 0.75 },
  { multisampling: 0, renderScale: 0.5 },
];

/** Tuning; times in seconds. */
export const AUTO_QUALITY = {
  /** Time ignored at the start and after each change (buffers reallocated, shaders compiled). */
  settle: 1,
  /** Frames are judged in windows of this much time. */
  window: 2,
  /** Longer frames are hitches (a room being built, a hidden tab) and left out. */
  hitch: 0.1,
  /** Average frame time above which a window is slow: below ~50 fps... */
  slow: 1 / 50,
  /** ...and slow windows in a row before quality steps down. */
  slowWindows: 2,
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
  /** @param {number} [level] index into QUALITY_LEVELS to start at */
  constructor(level = 0) {
    this.level = level;
    /** Stopped: a step did not help, or there is nothing lower. */
    this.done = false;
    this.times = [];
    this.elapsed = 0;
    this.settling = AUTO_QUALITY.settle;
    /** Slow windows in a row at this level. */
    this.slowCount = 0;
    /** The level last judged slow before stepping down, and its average frame time (null: none). */
    this.base = null;
  }

  /** Settings of the current level. */
  get settings() {
    return QUALITY_LEVELS[this.level];
  }

  /**
   * Count one frame.
   * @param {number} interval seconds since the previous frame
   * @returns {typeof QUALITY_LEVELS[number] | null} the new settings when
   *   the level changed, else null
   */
  frame(interval) {
    if (this.done || !(interval > 0) || interval > AUTO_QUALITY.hitch) return null;
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
      return null;
    }
    if (++this.slowCount < AUTO_QUALITY.slowWindows) return null;
    const helped = this.base === null || mean < this.base.mean * (1 - AUTO_QUALITY.gain);
    if (!helped && this.level - this.base.level >= 2) {
      // Two steps and no faster: quality is not what holds frames back.
      this.done = true;
      return this.change(this.base.level);
    }
    if (helped) this.base = { level: this.level, mean };
    if (this.level === QUALITY_LEVELS.length - 1) {
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
    return this.settings;
  }
}
