/**
 * The decoy of the Fork spell (D129): a hologram of the wizard that stands
 * in the cell where it was cast, for the spell's `duration`. It is no solid
 * body (nothing collides with it, nothing harms it); it presses a floor plate
 * like a body standing on it (switches.js) and hostile enemies that see
 * it go for the nearest of it and the wizard (Enemy.sense()). It falls if
 * nothing holds it up, and pops into a hole, or onto a spiked crate's bare
 * top (D199).
 */
import { bodyBox, restsOn, surfaceBelow } from '../physics/collision.js';
import { DT } from '../core/loop.js';

export const DECOY = {
  /** Fall speed in units per tick. */
  fallSpeed: 0.25,
  /** Ticks its pixels fly after it derezzes before it leaves the room (render/decoy-view.js). */
  derezTicks: 48,
};

export class Decoy {
  /**
   * @param {number[]} cell [x, y, z] where it stands (the cell in front of the wizard)
   * @param {number} facing the way it looks (his)
   * @param {number[]} size the wizard's hitbox
   * @param {number} duration seconds it stands
   */
  constructor(cell, facing, size, duration) {
    this.pos = [cell[0] + 0.5, cell[1], cell[2] + 0.5];
    this.prev = [...this.pos];
    this.size = size;
    this.facing = facing;
    /** Ticks it has stood, and ticks it stands in all. */
    this.age = 0;
    this.lifeTicks = Math.round(duration / DT);
    /** Ticks since it derezzed (time ran out, or it fell into a hole), or null while it stands. */
    this.gone = null;
  }

  /** Is it standing (seen by enemies, pressing plates)? */
  get active() {
    return this.gone === null;
  }

  /** Ticks left before it derezzes. */
  get ticksLeft() {
    return this.lifeTicks - this.age;
  }

  /** Collision box [[minX, maxX], [minY, maxY], [minZ, maxZ]] (a plate and the enemies' eyes read it). */
  box() {
    return bodyBox(this.pos, this.size);
  }

  /**
   * One fixed tick: fall if nothing holds it up (a hole or a spiked top
   * takes it), count down, derez when the time is up.
   * @param {import('../game.js').Game} game grid and solids
   */
  update({ grid, solids, objectBodies }) {
    this.prev = [...this.pos];
    if (this.gone !== null) {
      this.gone++;
      return;
    }
    const ground = surfaceBelow(this.box(), grid, solids);
    if (this.pos[1] > ground + 1e-6) this.pos[1] = Math.max(ground, this.pos[1] - DECOY.fallSpeed);
    else if (ground === 0 && grid.isHole(Math.floor(this.pos[0]), Math.floor(this.pos[2]))) this.gone = 0;
    else if (solids.some((body) => body.topDamage > 0 && restsOn(this.box(), body.box()) && body.topHurts(objectBodies))) this.gone = 0;
    if (++this.age >= this.lifeTicks) this.gone = 0;
  }

  /** Has it derezzed and its pixels flown, so it can leave the room? */
  get finished() {
    return this.gone !== null && this.gone >= DECOY.derezTicks;
  }
}
