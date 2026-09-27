/**
 * A room pickup's view (D71): a data disk (disk.js) or a refill
 * (refill.js), hovering and spinning in its cell; a found disk as a ghost;
 * once taken, a refill's pick-up effect and its pixel burst, then nothing;
 * a taken disk goes at once, as the install animation on the wizard takes
 * it over (install-view.js, D73).
 */
import { Group } from 'three';
import { DISK, createDisk, diskMotion, diskPixels, poseDisk } from './disk.js';
import { createPixelBurst, placePixels } from './entity-view.js';
import { hash } from './hash.js';
import { createRefill, refillMotion } from './refill.js';

export class PickupView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/pickup.js').Pickup} pickup
   */
  constructor(game, pickup) {
    this.pickup = pickup;
    const { data } = pickup;
    this.refill = data.kind === 'refill';
    this.model = this.refill
      ? createRefill(data.stat)
      : createDisk({ ...game.content.spells[data.spell], ghost: pickup.state === 'ghost' });
    const [x, y, z] = data.at;
    this.model.position.set(x + 0.5, y, z + 0.5);
    const { pixels, pixelSize } = DISK.collect;
    this.pixels = createPixelBurst(pixels, pixelSize, [this.model.userData.color, this.model.userData.bitColor]);
    this.group = new Group().add(this.model, this.pixels);
    /** Seconds of idle motion, started at a different point for each cell so pickups don't move in step. */
    this.time = hash(x * 31 + z, y, [12.9, 78.2]) * 10;
  }

  /**
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} dt seconds since the last frame
   */
  sync(alpha, dt) {
    this.time += dt;
    const { state, takenTicks } = this.pickup;
    if (!this.refill && takenTicks !== null) {
      this.group.visible = false;
      return;
    }
    const collected = takenTicks === null ? undefined : takenTicks + alpha;
    const motion = diskMotion({ time: this.time, ghost: state === 'ghost', collected });
    const pose = this.refill ? refillMotion(motion) : motion;
    poseDisk(this.model, pose);
    const burst = collected === undefined ? [] : diskPixels(collected - DISK.collect.riseTicks);
    const { x, z } = this.model.position;
    placePixels(this.pixels, burst, [x, this.model.position.y + pose.y, z]);
  }
}
