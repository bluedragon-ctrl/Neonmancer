/**
 * Game state and the fixed-order update of one tick. Pure logic: views read
 * the state, they never change it.
 */
import { withExitDefaults } from './data/room-data.js';
import { Player } from './entities/player.js';
import { Pushable } from './entities/pushable.js';
import { groundBelow, surfaceBelow } from './physics/collision.js';
import { arrival, exitAt } from './world/exits.js';
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
   * wizard at `spawn`, which is also where he respawns in this room.
   * @param {string} id room id
   * @param {number[]} [spawn] feet center; the room's own spawn by default
   */
  enterRoom(id, spawn) {
    this.room = buildRoom(this.content.rooms.get(id), this.content);
    this.grid = new Grid(this.room);
    this.pushables = this.room.objects.filter((o) => o.kind === 'pushable').map((o) => new Pushable(o));
    this.player = new Player(spawn ?? this.room.spawn);
    /** Everything objects collide with: the objects themselves and the wizard. */
    this.bodies = [...this.pushables, this.player];
  }

  /**
   * Flip screen: the wizard walked out through `exit`; enter the connected
   * room at the matching exit, keeping his offset, height, fall and facing.
   * @param {object} exit exit of the current room (defaults applied)
   */
  travel(exit) {
    const link = this.content.links.get(`${this.room.id}.${exit.id}`);
    const { pos, vy, facing } = this.player;
    const target = this.content.rooms.get(link.room);
    const to = withExitDefaults(target.exits.find((e) => e.id === link.exit));
    const arrived = arrival(exit, pos, to, target.size);

    this.enterRoom(link.room, arrived.spawn);
    const player = this.player;
    player.pos = arrived.pos;
    player.prev = [...arrived.pos];
    player.vy = vy;
    player.facing = player.prevFacing = player.targetFacing = facing;
  }

  /**
   * One fixed tick: player (and his push) → exits → objects → events.
   * @param {import('./core/input.js').Input} input
   * @returns {string[]} events this tick (e.g. 'jump', 'push', 'plug', 'exit', 'room')
   */
  update(input) {
    const events = [];
    const playerEvent = this.player.update(input, this.grid, this.pushables);

    // Respawn after a death resets the room, so no puzzle stays broken.
    if (playerEvent === 'respawn') {
      this.enterRoom(this.room.id, this.player.spawn);
      return ['respawn', 'room'];
    }

    const exit = this.player.dead ? null : exitAt(this.room, this.player.pos);
    if (exit) {
      this.travel(exit);
      return ['exit', 'room'];
    }
    if (playerEvent) events.push(playerEvent);

    const intent = this.player.pushIntent;
    if (intent && intent.body.push(intent.dir, this)) events.push('push');

    // Lower objects first, so a stack settles in one tick.
    const order = [...this.pushables].sort((a, b) => a.pos[1] - b.pos[1]);
    for (const pushable of order) {
      const event = pushable.update(this);
      if (event) events.push(event);
    }
    return events;
  }

  /**
   * Height of the surface a drop shadow falls on below the wizard at `pos`,
   * or null when there is nothing to fall on (above a hole).
   * @param {number[]} pos feet center (may be an interpolated render position)
   * @param {number[]} size body size
   */
  shadowHeight(pos, size) {
    const y = groundBelow(pos, size, this.grid, this.pushables);
    if (y === 0 && this.grid.isHole(pos[0], pos[2])) return null;
    return y;
  }

  /**
   * Drop shadow height under a falling object at `pos` (lower corner), or
   * null above a hole.
   * @param {import('./entities/pushable.js').Pushable} pushable
   * @param {number[]} pos interpolated lower corner
   */
  objectShadowHeight(pushable, pos) {
    const box = pos.map((p) => [p, p + 1]);
    const y = surfaceBelow(box, this.grid, this.bodies, pushable);
    if (y === 0 && this.grid.isHole(pos[0] + 0.5, pos[2] + 0.5)) return null;
    return y;
  }
}
