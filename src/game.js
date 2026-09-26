/**
 * Game state and the fixed-order update of one tick. Pure logic: views read
 * the state, they never change it.
 */
import { DT } from './core/loop.js';
import { announce, say } from './core/messages.js';
import { sideAxes, withExitDefaults } from './data/room-data.js';
import { PLAYER, Player } from './entities/player.js';
import { Pushable } from './entities/pushable.js';
import { groundBelow, surfaceBelow } from './physics/collision.js';
import { arrival, exitAt } from './world/exits.js';
import { Grid } from './world/grid.js';
import { buildRoom } from './world/room.js';

/** Room transition timing in ticks (60 per second). */
export const TRANSITION = {
  /** Fade to black while the wizard walks on through the exit; the world is frozen. */
  outTicks: 12,
  /** Fade in from black in the new room; the game already runs. */
  inTicks: 15,
};

export class Game {
  /** @param {object} content loaded game data (see data/load.js) */
  constructor(content) {
    this.content = content;
    /** Integrity (health); it carries over between rooms. */
    this.maxIntegrity = PLAYER.maxIntegrity;
    this.integrity = this.maxIntegrity;
    /** Debug mode: holes never kill and hurt() does nothing. */
    this.invincible = false;
    this.enterRoom(content.world.start);
    /**
     * Room transition in progress, or null: { phase: 'out' | 'in', tick, exit }.
     * Views read it through fadeLevel().
     */
    this.transition = null;
  }

  /**
   * Build the room fresh from data (rooms fully reset on entry) and put the
   * wizard at `spawn`, which is also where he respawns in this room.
   * @param {string} id room id
   * @param {number[]} [spawn] feet center; the room's own spawn by default
   */
  enterRoom(id, spawn) {
    // Announce the room when it is a different one (not on a respawn).
    if (id !== this.room?.id) {
      const data = this.content.rooms.get(id);
      const biome = this.content.biomes[data.biome];
      announce('banner.room', { room: data.name }, { sub: 'banner.biome', subValues: { biome: biome.name }, color: biome.color });
    }
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
   * Reduce integrity, unless invincible (debug mode). Used for now by the
   * debug test-damage key; real hazards and enemies call it from Phase 2.
   * @param {number} [amount]
   */
  hurt(amount = 1) {
    if (this.invincible) return;
    this.integrity = Math.max(0, this.integrity - amount);
  }

  /**
   * Debug mode: jump straight to another room, skipping the exit transition.
   * Ignored mid-transition, so it never interrupts a fade.
   * @param {1|-1} direction next or previous room, in load order
   * @returns {boolean} whether it jumped
   */
  debugJumpRoom(direction) {
    if (this.transition) return false;
    const ids = [...this.content.rooms.keys()];
    const next = ids[(ids.indexOf(this.room.id) + direction + ids.length) % ids.length];
    this.enterRoom(next);
    return true;
  }

  /**
   * One fixed tick: player → exits → his push → objects → events.
   * Walking out through an exit starts a transition: fade out (frozen
   * world), load the next room, fade in (running).
   * @param {import('./core/input.js').Input} input
   * @returns {string[]} events this tick (e.g. 'jump', 'push', 'plug', 'die', 'respawn', 'exit', 'room')
   */
  update(input) {
    if (this.transition?.phase === 'out') return this.fadeOut();
    if (this.transition && ++this.transition.tick >= TRANSITION.inTicks) this.transition = null;

    const events = [];
    const playerEvent = this.player.update(input, this.grid, this.pushables, this.invincible);

    // Falling into a hole drains all integrity. Respawning restores it and
    // resets the room, so no puzzle stays broken.
    if (playerEvent === 'die') {
      this.integrity = 0;
      say('msg.die');
    }
    if (playerEvent === 'respawn') {
      this.integrity = this.maxIntegrity;
      say('msg.respawn');
      this.enterRoom(this.room.id, this.player.spawn);
      return ['respawn', 'room'];
    }

    const exit = this.player.dead ? null : exitAt(this.room, this.player.pos);
    if (exit) {
      this.transition = { phase: 'out', tick: 0, exit };
      return ['exit'];
    }
    if (playerEvent) events.push(playerEvent);

    const intent = this.player.pushIntent;
    if (intent && intent.body.push(intent.dir, this)) events.push('push');

    // Lower objects first, so a stack settles in one tick.
    const order = [...this.pushables].sort((a, b) => a.pos[1] - b.pos[1]);
    for (const pushable of order) {
      const event = pushable.update(this);
      if (event) events.push(event);
      if (event === 'plug') say('msg.plug');
    }
    return events;
  }

  /**
   * Color of the room behind an exit of the current room (its biome color),
   * for the exit's stream.
   * @param {object} exit exit of the current room
   */
  destinationColor(exit) {
    const link = this.content.links.get(`${this.room.id}.${exit.id}`);
    return this.content.biomes[this.content.rooms.get(link.room).biome].color;
  }

  /**
   * One tick of fading out: the world stands still while the wizard walks on
   * out through the exit; then the next room loads and fades in.
   * @returns {string[]} events
   */
  fadeOut() {
    const { exit } = this.transition;
    const player = this.player;
    player.prev = [...player.pos];
    player.prevFacing = player.facing;
    for (const pushable of this.pushables) pushable.prev = [...pushable.pos];

    if (++this.transition.tick < TRANSITION.outTicks) {
      const { cross } = sideAxes(exit.side);
      player.pos[cross] += (exit.side.startsWith('-') ? -1 : 1) * PLAYER.speed * DT;
      return [];
    }
    this.travel(exit);
    this.transition = { phase: 'in', tick: 0 };
    return ['room'];
  }

  /**
   * How far the screen is faded to black: 0 (clear) to 1 (black).
   * @param {number} alpha interpolation factor between the last two ticks
   */
  fadeLevel(alpha) {
    if (!this.transition) return 0;
    const { phase, tick } = this.transition;
    if (phase === 'out') return Math.min((tick + alpha) / TRANSITION.outTicks, 1);
    return Math.max(1 - (tick + alpha) / TRANSITION.inTicks, 0);
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
