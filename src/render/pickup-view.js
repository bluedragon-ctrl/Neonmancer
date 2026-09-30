/**
 * A room pickup's view (D71): its model (pickup-model.js) hovering and
 * spinning in its cell; a found permanent one as a ghost; once taken, a
 * temporary one's (a refill's or an access pass's) pick-up effect and its
 * derez, then nothing; any other
 * goes at once, as the install animation on the wizard takes it over
 * (install-view.js, D73).
 */
import { Group } from 'three';
import { DISK, diskMotion, poseDisk } from './disk.js';
import { createDerez, placeDerez } from './pixels.js';
import { hash } from './hash.js';
import { createPickupModel } from './pickup-model.js';
import { refillMotion } from './refill.js';

export class PickupView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/pickup.js').Pickup} pickup
   */
  constructor(game, pickup) {
    this.pickup = pickup;
    const { data } = pickup;
    this.refill = data.kind === 'refill';
    /** No save bit (a refill or an access pass): it plays its own pick-up effect. */
    this.temporary = pickup.bit === null;
    this.model = createPickupModel(game.content, data, pickup.state === 'ghost');
    const [x, y, z] = data.at;
    this.model.position.set(x + 0.5, y, z + 0.5);
    this.pixels = createDerez(DISK.collect.body, [this.model.userData.color, this.model.userData.bitColor]);
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
    if (!this.temporary && takenTicks !== null) {
      this.group.visible = false;
      return;
    }
    const collected = takenTicks === null ? undefined : takenTicks + alpha;
    const motion = diskMotion({ time: this.time, ghost: state === 'ghost', collected });
    const pose = this.refill ? refillMotion(motion) : motion;
    poseDisk(this.model, pose);
    const { x, z } = this.model.position;
    placeDerez(this.pixels, collected === undefined ? null : collected - DISK.collect.riseTicks, [x, this.model.position.y + pose.y, z]);
  }
}
