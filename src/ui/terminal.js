/**
 * Timing of the HUD's terminal messages and room banner. Pure logic driven
 * by frame time (the HUD is visual only, it never affects the simulation),
 * so tests can step it with made-up times.
 */

/** Terminal tuning (seconds, characters per second). */
export const TERMINAL = {
  /** Typing speed. */
  typeRate: 40,
  /** How long a line stays after it is fully typed. */
  hold: 4,
  /** Fade-out time at the end. */
  fade: 0.6,
  /** Lines on screen at most; the oldest goes first. */
  maxLines: 4,
};

/** Room banner tuning (seconds). */
export const BANNER = {
  /** Letters decode from glyphs to the room name. */
  reveal: 0.45,
  /** Fully shown. */
  hold: 1.8,
  /** Fade-out time. */
  fade: 0.7,
};

/**
 * Terminal log: lines are typed out one after another, stay a while, then
 * fade. Newer lines push the oldest off when there are too many.
 */
export class Terminal {
  constructor() {
    /** @type {{ text: string, typed: number, age: number }[]} age counts from fully typed */
    this.entries = [];
  }

  /** @param {string} text */
  push(text) {
    this.entries.push({ text, typed: 0, age: 0 });
    if (this.entries.length > TERMINAL.maxLines) this.entries.shift();
  }

  /** @param {number} dt seconds since the last frame */
  update(dt) {
    // Lines are typed in order; time left after one line types the next.
    let budget = dt * TERMINAL.typeRate;
    for (const entry of this.entries) {
      const typing = Math.min(budget, entry.text.length - entry.typed);
      entry.typed += typing;
      budget -= typing;
      if (entry.typed >= entry.text.length && typing === 0) entry.age += dt;
    }
    this.entries = this.entries.filter((entry) => entry.age < TERMINAL.hold + TERMINAL.fade);
  }

  /**
   * What to draw now: lines typed so far and the one being typed (lines
   * still waiting their turn are left out).
   * @returns {{ text: string, typing: boolean, opacity: number }[]}
   */
  lines() {
    const waiting = this.entries.findIndex((entry) => entry.typed < entry.text.length);
    const started = waiting < 0 ? this.entries : this.entries.slice(0, waiting + 1);
    return started.map((entry) => ({
      text: entry.text.slice(0, Math.floor(entry.typed)),
      typing: entry.typed < entry.text.length,
      opacity: Math.min(1, (TERMINAL.hold + TERMINAL.fade - entry.age) / TERMINAL.fade),
    }));
  }
}

/**
 * Room banner at `time` seconds after it appeared.
 * @param {number} time
 * @returns {{ decoded: number, opacity: number }} share of letters decoded (0–1)
 *   and opacity (0 once it is gone)
 */
export function bannerState(time) {
  const decoded = Math.min(Math.max(time / BANNER.reveal, 0), 1);
  const fadeStart = BANNER.reveal + BANNER.hold;
  const opacity = Math.min(Math.max(1 - (time - fadeStart) / BANNER.fade, 0), 1);
  return { decoded, opacity };
}
