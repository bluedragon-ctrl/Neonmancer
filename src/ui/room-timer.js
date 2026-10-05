/**
 * The watchdog timer of the HUD (D172): top middle, in a room with a timer,
 * under the boss bar when that is up. The time left in seconds and tenths;
 * red and pulsing in its last seconds (red: about to hurt, D99); lime and
 * still once it stopped (he took what it guarded).
 */
import { DT } from '../core/loop.js';
import { WATCHDOG } from '../game.js';

/**
 * What the watchdog timer shows now, or null when the room has none.
 * @param {import('../game.js').Game} game
 * @returns {{ text: string, warn: boolean, stopped: boolean } | null}
 *   text: the time left, e.g. "0:27.4"; warn: its last seconds; stopped: it stopped
 */
export function roomTimerState(game) {
  if (game.timeLeft === null) return null;
  const stopped = game.watchdogStopped;
  return { text: formatTime(game.timeLeft * DT), warn: !stopped && game.timeLeft <= WATCHDOG.warnTicks, stopped };
}

/**
 * Seconds as minutes, seconds and tenths, rounded up to the tenth so it
 * reads 0:00.0 only when time is up.
 * @param {number} seconds
 */
export function formatTime(seconds) {
  const tenths = Math.ceil(Math.round(seconds * 1000) / 100);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

export class RoomTimer {
  /**
   * @param {HTMLElement} root where to add the timer
   * @param {string} label its label (strings.json "hud.watchdog")
   */
  constructor(root, label) {
    root.insertAdjacentHTML('beforeend', '<div class="hud-timer" hidden><span class="hud-timer-label"></span><span class="hud-timer-value"></span></div>');
    this.box = root.lastElementChild;
    this.box.querySelector('.hud-timer-label').textContent = label;
    this.value = this.box.querySelector('.hud-timer-value');
    /** The state it shows, or null. */
    this.shown = null;
    this.belowBoss = false;
  }

  /**
   * Show a state of roomTimerState().
   * @param {ReturnType<typeof roomTimerState>} state
   * @param {boolean} belowBoss the boss bar is up: sit under it
   */
  set(state, belowBoss) {
    if (belowBoss !== this.belowBoss) {
      this.belowBoss = belowBoss;
      this.box.classList.toggle('below-boss', belowBoss);
    }
    if (state?.text === this.shown?.text && state?.warn === this.shown?.warn && state?.stopped === this.shown?.stopped) return;
    this.box.hidden = !state;
    if (state) {
      this.value.textContent = state.text;
      this.box.classList.toggle('warn', state.warn);
      this.box.classList.toggle('stopped', state.stopped);
    }
    this.shown = state;
  }
}
