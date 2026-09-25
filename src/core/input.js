/**
 * Action-mapped keyboard input.
 *
 * Key events only record raw key state. Once per logic tick, sample() turns
 * it into action states that game code reads:
 *   down(action)     the action is held this tick
 *   pressed(action)  it started this tick
 *   released(action) it ended this tick
 *
 * A key tapped and released between two ticks still counts as down and
 * pressed for one tick, so short taps are never lost.
 */
import { ACTIONS, DEFAULT_BINDINGS } from './bindings.js';

export class Input {
  /** @param {Record<string, string[]>} bindings action → key codes */
  constructor(bindings = DEFAULT_BINDINGS) {
    /** key code → actions bound to it */
    this.keyActions = new Map();
    for (const action of ACTIONS) {
      for (const code of bindings[action] ?? []) {
        if (!this.keyActions.has(code)) this.keyActions.set(code, []);
        this.keyActions.get(code).push(action);
      }
    }

    /** Keys currently held. */
    this.held = new Set();
    /** Keys pressed since the last sample (kept even if already released). */
    this.tapped = new Set();

    // Per-action state produced by sample().
    this.isDown = new Set();
    this.wasDown = new Set();
  }

  /** @param {string} code */
  isBound(code) {
    return this.keyActions.has(code);
  }

  /** Record a key going down (auto-repeat is ignored). @param {string} code */
  keyDown(code) {
    if (this.held.has(code)) return;
    this.held.add(code);
    this.tapped.add(code);
  }

  /** @param {string} code */
  keyUp(code) {
    this.held.delete(code);
  }

  /** Release all keys, e.g. when the window loses focus. */
  releaseAll() {
    this.held.clear();
  }

  /** Update action states. Call exactly once at the start of every tick. */
  sample() {
    this.wasDown = this.isDown;
    this.isDown = new Set();
    for (const code of [...this.held, ...this.tapped]) {
      for (const action of this.keyActions.get(code) ?? []) this.isDown.add(action);
    }
    this.tapped.clear();
  }

  /** @param {string} action */
  down(action) {
    return this.isDown.has(action);
  }

  /** @param {string} action */
  pressed(action) {
    return this.isDown.has(action) && !this.wasDown.has(action);
  }

  /** @param {string} action */
  released(action) {
    return !this.isDown.has(action) && this.wasDown.has(action);
  }

  /** Actions held this tick, in ACTIONS order (for debug displays). */
  activeActions() {
    return ACTIONS.filter((action) => this.isDown.has(action));
  }

  /**
   * Listen to keyboard events on `target` (normally window).
   * Returns a function that removes the listeners.
   * @param {EventTarget} target
   */
  attach(target) {
    const onKeyDown = (e) => {
      // Leave browser shortcuts such as Ctrl+R alone.
      if (e.ctrlKey || e.metaKey || e.altKey || !this.isBound(e.code)) return;
      e.preventDefault(); // stop arrows/space scrolling the page, F3 opening search
      if (!e.repeat) this.keyDown(e.code);
    };
    const onKeyUp = (e) => this.keyUp(e.code);
    const onBlur = () => this.releaseAll();

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    };
  }
}
