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
  /** Lines on screen at most; the oldest goes first (a screen's text doesn't count). */
  maxLines: 4,
  /** Reading speed of a screen's text (characters per second): it stays at least this long after it is typed. */
  readRate: 12,
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
 * fade. Newer lines push the oldest off when there are too many. A screen's
 * text (D118) is a block of its own: it doesn't count towards the lines,
 * so messages can't push it off half read; it stays long enough to read,
 * its lines fading together, and a newer text replaces it.
 */
export class Terminal {
  constructor() {
    /** @type {{ text: string, typed: number, age: number, hold: number, lore: boolean }[]} age counts from fully typed */
    this.entries = [];
  }

  /** @param {string} text */
  push(text) {
    this.entries.push({ text, typed: 0, age: 0, hold: TERMINAL.hold, lore: false });
    const plain = this.entries.filter((entry) => !entry.lore);
    if (plain.length > TERMINAL.maxLines) this.entries.splice(this.entries.indexOf(plain[0]), 1);
  }

  /**
   * A screen's text: its lines, held until it could be read, all fading at once.
   * @param {string[]} lines
   */
  pushText(lines) {
    this.entries = this.entries.filter((entry) => !entry.lore);
    const total = lines.reduce((sum, line) => sum + line.length, 0);
    const hold = Math.max(TERMINAL.hold, total / TERMINAL.readRate);
    for (const text of lines) this.entries.push({ text, typed: 0, age: 0, hold, lore: true });
  }

  /** How long an entry has been shown in full: a screen's text counts from its last line (so its lines fade at once). */
  ageOf(entry) {
    return entry.lore ? this.entries.findLast((other) => other.lore).age : entry.age;
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
    this.entries = this.entries.filter((entry) => this.ageOf(entry) < entry.hold + TERMINAL.fade);
  }

  /**
   * What to draw now: lines typed so far and the one being typed (lines
   * still waiting their turn are left out).
   * @returns {{ text: string, typing: boolean, opacity: number, lore: boolean }[]} lore: a line of a screen's text
   */
  lines() {
    const waiting = this.entries.findIndex((entry) => entry.typed < entry.text.length);
    const started = waiting < 0 ? this.entries : this.entries.slice(0, waiting + 1);
    return started.map((entry) => ({
      text: entry.text.slice(0, Math.floor(entry.typed)),
      typing: entry.typed < entry.text.length,
      opacity: Math.min(1, (entry.hold + TERMINAL.fade - this.ageOf(entry)) / TERMINAL.fade),
      lore: entry.lore,
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
