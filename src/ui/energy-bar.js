/**
 * The energy (mana) bar of the HUD: a label over a row of slanted
 * segments, one per cast of the current spell, each filling up as energy
 * recharges. A full segment glows; the one filling up is dim. A cast
 * without enough energy flashes the bar (deny()).
 */
export class EnergyBar {
  /**
   * @param {HTMLElement} root where to add the bar
   * @param {string} label
   */
  constructor(root, label) {
    root.insertAdjacentHTML('beforeend', '<div class="hud-energy"><div class="hud-label"></div><div class="hud-segments"></div></div>');
    this.box = root.lastElementChild;
    this.box.querySelector('.hud-label').textContent = label;
    this.row = this.box.querySelector('.hud-segments');
    /** One { segment, fill } per cast. */
    this.segments = [];
    this.shown = null;
  }

  /**
   * Show `value` of `max` energy in segments of `cost` (one cast each).
   * @param {number} value
   * @param {number} max
   * @param {number} cost
   */
  set(value, max, cost) {
    const key = `${value.toFixed(3)}/${max}/${cost}`;
    if (key === this.shown) return;
    this.shown = key;
    const count = Math.max(1, Math.round(max / cost));
    while (this.segments.length < count) {
      const segment = document.createElement('i');
      const fill = document.createElement('b');
      segment.append(fill);
      this.row.append(segment);
      this.segments.push({ segment, fill });
    }
    while (this.segments.length > count) this.segments.pop().segment.remove();
    this.segments.forEach(({ segment, fill }, i) => {
      const part = Math.min(1, Math.max(0, (value - i * cost) / cost));
      fill.style.width = `${part * 100}%`;
      segment.classList.toggle('full', part >= 1);
    });
  }

  /** A cast failed for lack of energy: flash the bar. */
  deny() {
    this.box.classList.remove('denied');
    void this.box.offsetWidth; // restart the animation
    this.box.classList.add('denied');
  }
}
