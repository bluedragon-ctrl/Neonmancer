/**
 * A room pickup's view (D71): its model (pickup-model.js) hovering and
 * spinning in its cell; a found permanent one as a ghost; once taken, a
 * temporary one's (a refill's or an access pass's) pick-up effect and its
 * derez, then nothing; any other
 * goes at once, as the install animation on the wizard takes it over
 * (install-view.js, D73). A boss's drop (D104) is hidden while the boss
 * holds it, then falls into its cell.
 */
import { Group } from 'three';
import { DISK, diskMotion, poseDisk } from './disk.js';
import { createDerez, placeDerez } from './pixels.js';
import { hash } from './hash.js';
import { createPickupModel } from './pickup-model.js';
import { refillMotion } from './refill.js';
import { PICKUP } from '../entities/pickup.js';

/**
 * How far above its place a boss's drop (D104) is `ticks` after the boss
 * was beaten: it falls in from DROP_FROM up, bouncing once, and rests.
 * @param {number} ticks
 */
export function dropHeight(ticks) {
  const t = ticks / PICKUP.dropTicks;
  if (t >= 1) return 0;
  if (t < 0.6) return DROP_FROM * (1 - (t / 0.6) ** 2);
  const bounce = (t - 0.6) / 0.4;
  return DROP_FROM * 0.15 * Math.sin(bounce * Math.PI);
}

/** Units above its cell a boss's drop starts falling from. */
const DROP_FROM = 1.5;

export class PickupView {
  /**
   * @param {import('../game.js').Game} game
   * @param {import('../entities/pickup.js').Pickup} pickup
   */
  constructor(game, pickup) {
    this.pickup = pickup;
    const { data } = pickup;
    // Refills and boosts (D152) are small, and hover lower than a disk.
    this.refill = data.kind === 'refill' || data.kind === 'boost';
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
    const { state, takenTicks, droppedTicks } = this.pickup;
    // A boss holds it unseen until it is beaten (D104).
    this.group.visible = state !== 'held' && (this.temporary || takenTicks === null);
    if (!this.group.visible) return;
    const collected = takenTicks === null ? undefined : takenTicks + alpha;
    const motion = diskMotion({ time: this.time, ghost: state === 'ghost', collected });
    const pose = this.refill ? refillMotion(motion) : motion;
    poseDisk(this.model, droppedTicks === null ? pose : { ...pose, y: pose.y + dropHeight(droppedTicks + alpha) });
    const { x, z } = this.model.position;
    placeDerez(this.pixels, collected === undefined ? null : collected - DISK.collect.riseTicks, [x, this.model.position.y + pose.y, z]);
  }
}
