/**
 * Game state and the fixed-order update of one tick. Pure logic: views read
 * the state, they never change it.
 */
import { Player } from './entities/player.js';
import { groundBelow } from './physics/collision.js';
import { Grid } from './world/grid.js';
import { buildRoom } from './world/room.js';

export class Game {
  /** @param {object} content loaded game data (see data/load.js) */
  constructor(content) {
    this.content = content;
    this.enterRoom(content.world.start);
  }

  /**
   * Build the room fresh from data (rooms fully reset on entry) and put the
   * wizard at its spawn.
   * @param {string} id room id
   */
  enterRoom(id) {
    this.room = buildRoom(this.content.rooms.get(id), this.content);
    this.grid = new Grid(this.room);
    this.player = new Player(this.room.spawn);
  }

  /**
   * One fixed tick.
   * @param {import('./core/input.js').Input} input
   * @returns {string[]} events that happened this tick (e.g. 'jump', 'die')
   */
  update(input) {
    const events = [];
    const playerEvent = this.player.update(input, this.grid);
    if (playerEvent) events.push(playerEvent);
    return events;
  }

  /**
   * Height of the surface a drop shadow falls on below a body at `pos`, or
   * null when there is nothing to fall on (above a hole).
   * @param {number[]} pos feet center (may be an interpolated render position)
   * @param {number[]} size body size
   */
  shadowHeight(pos, size) {
    const y = groundBelow(pos, size, this.grid);
    if (y === 0 && this.grid.isHole(pos[0], pos[2])) return null;
    return y;
  }
}
