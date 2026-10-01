/**
 * The boss bar of the HUD (D134, D135): top middle, while the room's boss
 * is awake (it saw the wizard or was hit) and for a moment after it is
 * beaten. Its name over a long bar of its integrity in its color, a tick
 * where each later phase starts, the bar dimmed while plate armor is shut.
 */

/** Ticks the bar stays up after the boss is beaten, showing it empty. */
export const BOSS_BAR_LINGER = 90;

/**
 * What the boss bar shows now, or null when it is down.
 * @param {import('../game.js').Game} game
 * @returns {{ name: string, share: number, phases: number[], color: string, armored: boolean } | null}
 *   share: integrity left (0..1); phases: where each later phase starts (shares)
 */
export function bossBarState(game) {
  const { boss } = game;
  if (!boss?.awake || (!boss.alive && boss.timer >= BOSS_BAR_LINGER)) return null;
  return {
    name: game.bossName(boss),
    share: boss.alive ? boss.integrity / boss.maxIntegrity : 0,
    phases: boss.boss.phases.slice(1).map((phase) => phase.from),
    color: boss.phases[0].color,
    armored: boss.alive && !boss.exposed,
  };
}

export class BossBar {
  /** @param {HTMLElement} root where to add the bar */
  constructor(root) {
    root.insertAdjacentHTML('beforeend', '<div class="hud-boss" hidden><div class="hud-boss-name"></div><div class="hud-boss-bar"><b></b></div></div>');
    this.box = root.lastElementChild;
    this.name = this.box.querySelector('.hud-boss-name');
    this.bar = this.box.querySelector('.hud-boss-bar');
    this.fill = this.bar.querySelector('b');
    /** The state it shows, or null. */
    this.shown = null;
  }

  /**
   * Show a state of bossBarState(); a lower share flashes the bar.
   * @param {ReturnType<typeof bossBarState>} state
   */
  set(state) {
    const before = this.shown;
    if (state?.name === before?.name && state?.share === before?.share && state?.armored === before?.armored) return;
    this.shown = state;
    this.box.hidden = !state;
    if (!state) return;
    if (state.name !== before?.name) {
      this.name.textContent = state.name;
      this.box.style.setProperty('--boss', state.color);
      this.bar.querySelectorAll('i').forEach((tick) => tick.remove());
      for (const share of state.phases) {
        const tick = document.createElement('i');
        tick.style.left = `${share * 100}%`;
        this.bar.append(tick);
      }
    } else if (state.share < before.share) {
      this.bar.classList.remove('hit');
      void this.bar.offsetWidth; // restart the animation
      this.bar.classList.add('hit');
    }
    this.fill.style.width = `${state.share * 100}%`;
    this.box.classList.toggle('armored', state.armored);
  }
}
