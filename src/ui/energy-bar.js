/**
 * The energy (mana) bar of the HUD: a label over a row of thin ticks, one
 * per unit of energy, lighting one by one as energy recharges, so the bar
 * never changes shape. A notch under the bar marks the selected spell's
 * cost: once the lit ticks reach it, he can cast. Switching spells only
 * moves the notch. A cast without enough energy flashes the bar (deny()).
 */
export class EnergyBar {
  /**
   * @param {HTMLElement} root where to add the bar
   * @param {string} label
   */
  constructor(root, label) {
    root.insertAdjacentHTML('beforeend', '<div class="hud-energy"><div class="hud-label"></div><div class="hud-ticks"></div><div class="hud-cost"></div></div>');
    this.box = root.lastElementChild;
    this.box.querySelector('.hud-label').textContent = label;
    this.row = this.box.querySelector('.hud-ticks');
    this.notch = this.box.querySelector('.hud-cost');
    /** One element per unit. */
    this.ticks = [];
    this.shown = null;
  }

  /**
   * Show `value` of `max` energy, and the cost of one cast.
   * @param {number} value whole units
   * @param {number} max
   * @param {number} cost energy per cast of the selected spell
   */
  set(value, max, cost) {
    const key = `${value}/${max}/${cost}`;
    if (key === this.shown) return;
    this.shown = key;
    while (this.ticks.length < max) this.ticks.push(this.row.appendChild(document.createElement('i')));
    while (this.ticks.length > max) this.ticks.pop().remove();
    this.ticks.forEach((tick, i) => tick.classList.toggle('on', i < value));
    // The notch sits under the tick that completes one cast.
    this.notch.style.setProperty('--at', String(Math.min(cost, max)));
    this.box.classList.toggle('ready', value >= cost);
  }

  /** A cast failed for lack of energy: flash the bar. */
  deny() {
    this.box.classList.remove('denied');
    void this.box.offsetWidth; // restart the animation
    this.box.classList.add('denied');
  }
}
