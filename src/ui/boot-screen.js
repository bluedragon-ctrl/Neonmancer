/**
 * The room compiling in after Start (D110): a void cover over the game,
 * under the HUD, cut away from the top of the screen down behind a glowing
 * scan line. Timing comes from bootState() (render/boot-fx.js).
 */
export class BootScreen {
  /** @param {HTMLElement} stage the renderer's stage; the cover goes under its HUD */
  constructor(stage) {
    // The line is beside the cover, not in it: the cover's mask would hide it.
    this.cover = document.createElement('div');
    this.cover.className = 'boot-cover';
    this.scan = document.createElement('div');
    this.scan.className = 'boot-scan';
    this.cover.hidden = this.scan.hidden = true;
    stage.querySelector('.hud').before(this.cover, this.scan);
  }

  /**
   * @param {number | null} wipe how much of the room is drawn, 0..1 from
   *   bootState(), or null when no boot sequence runs
   */
  show(wipe) {
    const shown = wipe !== null && wipe < 1;
    this.cover.hidden = this.scan.hidden = !shown;
    if (!shown) return;
    // The scan runs a little past both edges, so it starts and ends off screen.
    const at = `${-5 + wipe * 110}%`;
    this.cover.style.setProperty('--scan', at);
    this.scan.style.top = at;
  }
}
