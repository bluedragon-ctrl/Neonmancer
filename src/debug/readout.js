/**
 * Debug mode's stats readout (F3, CLAUDE.md §9): room, tick and frame rates,
 * buffer size, GPU resources, held actions and the wizard's position.
 */

export class DebugReadout {
  /** @param {HTMLElement} root the renderer's HUD overlay */
  constructor(root) {
    root.insertAdjacentHTML('beforeend', '<pre class="readout"></pre>');
    this.element = root.querySelector('.readout');
    // Rates measured over the last second.
    this.ticks = 0;
    this.frames = 0;
    this.secondStart = performance.now();
    this.tps = 0;
    this.fps = 0;
  }

  /** Count one logic tick. */
  countTick() {
    this.ticks++;
  }

  /**
   * Once per frame: count it, and show or hide the readout.
   * @param {boolean} shown whether debug mode is on
   * @param {{ game: import('../game.js').Game, input: import('../core/input.js').Input,
   *   renderer: import('../render/renderer.js').Renderer, alpha: number }} state
   */
  update(shown, { game, input, renderer, alpha }) {
    this.frames++;
    const now = performance.now();
    if (now - this.secondStart >= 1000) {
      this.tps = this.ticks;
      this.fps = this.frames;
      this.ticks = this.frames = 0;
      this.secondStart = now;
    }

    this.element.classList.toggle('shown', shown);
    if (!shown) return;
    const { info } = renderer.webgl;
    const { player } = game;
    const actions = input.activeActions().join(' ') || '-';
    this.element.textContent =
      `> ROOM ${game.room.id}${game.invincible ? '  INVINCIBLE' : ''}\n` +
      `> TICK/S ${this.tps}  FPS ${this.fps}  ALPHA ${alpha.toFixed(2)}\n` +
      `> BUFFER ${renderer.bufferWidth}x${renderer.bufferHeight}\n` +
      `> GPU SHADERS ${info.programs.length}  GEOMETRIES ${info.memory.geometries}  TEXTURES ${info.memory.textures}\n` +
      `> ACTIONS ${actions}\n` +
      `> POS ${player.pos.map((v) => v.toFixed(2)).join(' ')}${player.grounded ? '  GROUNDED' : ''}\n` +
      `> [/] ROOM  I INVINCIBLE  H DAMAGE`;
  }
}
