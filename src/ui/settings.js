/**
 * Player settings (D109): music and sound volume, visual quality. Plain
 * logic, kept in localStorage apart from the access key (they belong to
 * the browser, not to the wizard). For now they are stubs: the menu sets
 * and stores them, and the audio and quality code will read them once it
 * exists (Phase 5).
 */

/** localStorage key of the settings. */
export const SETTINGS_STORAGE_KEY = 'neonmancer.settings';

/**
 * Every setting: a `range` of whole steps (clamped at its ends) or a
 * `choice` of values (wrapping round), with its default.
 */
export const SETTINGS = {
  /** Music volume, 0 (off) to 10 (full). */
  music: { type: 'range', min: 0, max: 10, default: 7 },
  /** Sound effects volume, 0 to 10. */
  sound: { type: 'range', min: 0, max: 10, default: 7 },
  /** Quality preset; auto steps down on slow frames (D76). */
  quality: { type: 'choice', values: ['auto', 'low', 'medium', 'high'], default: 'auto' },
  /** Render scale in tens of percent: 5 (50 %) to 10 (100 %). */
  renderScale: { type: 'range', min: 5, max: 10, default: 10 },
  /** Screen effects (shake, glitch bursts). */
  effects: { type: 'choice', values: ['on', 'off'], default: 'on' },
};

export class Settings {
  /** @param {Record<string, unknown>} [values] stored values; unknown or invalid ones fall back to defaults */
  constructor(values = {}) {
    /** @type {Record<string, number | string>} */
    this.values = {};
    for (const [id, setting] of Object.entries(SETTINGS)) {
      const value = values?.[id];
      const valid = setting.type === 'range' ? Number.isInteger(value) && value >= setting.min && value <= setting.max : setting.values.includes(value);
      this.values[id] = valid ? /** @type {number | string} */ (value) : setting.default;
    }
  }

  /** @param {string} id */
  get(id) {
    return this.values[id];
  }

  /**
   * Change a setting by one step: a range stops at its ends, unless
   * `wrap` (Enter or a click on it goes round); a choice always wraps.
   * @param {string} id
   * @param {number} step +1 or -1
   * @param {boolean} [wrap]
   * @returns {boolean} whether it changed
   */
  step(id, step, wrap = false) {
    const setting = SETTINGS[id];
    const old = this.values[id];
    if (setting.type === 'choice') {
      const count = setting.values.length;
      this.values[id] = setting.values[(setting.values.indexOf(old) + step + count) % count];
    } else {
      let value = /** @type {number} */ (old) + step;
      if (wrap && value > setting.max) value = setting.min;
      if (wrap && value < setting.min) value = setting.max;
      this.values[id] = Math.min(setting.max, Math.max(setting.min, value));
    }
    return this.values[id] !== old;
  }

  /**
   * The stored settings, or the defaults when there are none or storage
   * is blocked.
   * @param {Storage} [storage]
   */
  static load(storage = globalThis.localStorage) {
    try {
      return new Settings(JSON.parse(storage?.getItem(SETTINGS_STORAGE_KEY) ?? '{}'));
    } catch {
      return new Settings();
    }
  }

  /** Store them; a blocked storage is ignored. @param {Storage} [storage] */
  save(storage = globalThis.localStorage) {
    try {
      storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Private mode or blocked storage: the settings last for this visit.
    }
  }
}
