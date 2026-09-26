/**
 * Game state and the fixed-order update of one tick. Pure logic: views read
 * the state, they never change it.
 */
import { DT } from './core/loop.js';
import { announce, say } from './core/messages.js';
import { isBackSide, sideAxes, withExitDefaults } from './data/room-data.js';
import { Enemy } from './entities/enemy.js';
import { createObject } from './entities/kinds.js';
import { PLAYER, Player } from './entities/player.js';
import { groundBelow, overlaps, surfaceBelow, touchedCell } from './physics/collision.js';
import { arrival, exitAt } from './world/exits.js';
import { CELL, Grid } from './world/grid.js';
import { buildRoom } from './world/room.js';

/** Terminal message for each way to die (Player.deathCause). */
const DEATH_MESSAGES = { hole: 'msg.die', void: 'msg.void', damage: 'msg.derez' };

/**
 * How far below a bouncy enemy's top his feet may have been last tick and
 * still bounce (it may have hopped up a little into him).
 */
const BOUNCE_REACH = 0.05;

/** Room transition timing in ticks (60 per second). */
export const TRANSITION = {
  /** Fade to black while the wizard walks on through the exit; the world is frozen. */
  outTicks: 12,
  /** Fade in from black in the new room; the game already runs. */
  inTicks: 15,
};

/**
 * Something that happened, for views, the HUD and (later) sound. Returned
 * by Game.update() for the tick it happened in.
 * @typedef {object} GameEvent
 * @property {'jump'|'land'|'die'|'respawn'|'push'|'plug'|'shake'|'collapse'|'regrow'|'pop'|'bounce'|'hurt'|'exit'|'room'} type
 * @property {object} [object] the room object it happened to (push, plug,
 *   land of an object; shake, collapse and regrow of a collapsing block)
 * @property {object} [enemy] the enemy it happened to (pop, land of an
 *   enemy, bounce off it) or that hurt the wizard (hurt)
 * @property {number} [amount] integrity lost (hurt)
 * @property {number[]} [cell] the hazard block that hurt him (hurt), [x, y, z]
 * @property {'hole'|'void'|'damage'} [cause] how the wizard died (die)
 * @property {object} [exit] the exit walked out through (exit)
 */

export class Game {
  /** @param {object} content loaded game data (see data/load.js) */
  constructor(content) {
    this.content = content;
    /** Debug mode: holes and void blocks never kill and hurt() does nothing. */
    this.invincible = false;
    /** 'grid' (default, D23) or 'screen' (D38); toggled with G, not saved. */
    this.movementMode = 'grid';
    /** @type {GameEvent[]} events of the tick in progress (see emit()) */
    this.events = [];
    /** The wizard, for the whole game; each room places him (enterRoom()). */
    this.player = new Player([0, 0, 0]);
    this.enterRoom(content.world.start);
    /**
     * Room transition in progress, or null: { phase: 'out' | 'in', tick, exit }.
     * Views read it through fadeLevel().
     */
    this.transition = null;
  }

  /**
   * Build the room fresh from data (rooms fully reset on entry) and put the
   * wizard at `pos`; he respawns at the room's own `reset` point instead
   * (D39), wherever he entered.
   * @param {string} id room id
   * @param {number[]} [pos] feet center to appear at (e.g. arriving through an
   *   exit, mid-jump); the room's own spawn by default
   */
  enterRoom(id, pos) {
    // Announce the room when it is a different one (not on a respawn).
    if (id !== this.room?.id) {
      const data = this.content.rooms.get(id);
      const biome = this.content.biomes[data.biome];
      announce('banner.room', { room: data.name }, { sub: 'banner.biome', subValues: { biome: biome.name }, color: biome.color });
    }
    this.room = buildRoom(this.content.rooms.get(id), this.content);
    this.grid = new Grid(this.room);
    /** The room's objects (pushables, platforms, collapsing blocks), by kind (entities/kinds.js). */
    this.objects = this.room.objects.map(createObject);
    /** The objects in update order, lowest first; re-sorted in place every tick. */
    this.updateOrder = [...this.objects];
    /** The room's enemies (entities/enemy.js), dead ones included until the room resets. */
    this.enemies = this.room.enemies.map((enemy) => new Enemy(enemy));
    this.player.enter(pos ?? this.room.spawn, this.room.reset);
    this.refreshBodies();
  }

  /**
   * Work out what there is to collide with, after an object appeared or
   * vanished (a collapsing block, a popped enemy).
   */
  refreshBodies() {
    /** The objects that are there to collide with: all but collapsed blocks. */
    this.solids = this.objects.filter((object) => object.solid !== false);
    /** The enemies still alive. */
    this.liveEnemies = this.enemies.filter((enemy) => enemy.alive);
    /** What enemies collide with: the solid objects and the other live enemies (not the wizard). */
    this.obstacles = [...this.solids, ...this.liveEnemies];
    /** Everything objects collide with: the solid objects, live enemies and the wizard. */
    this.bodies = [...this.obstacles, this.player];
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

    this.enterRoom(link.room, arrival(exit, pos, to, target.size));
    const player = this.player;
    player.vy = vy;
    player.facing = player.prevFacing = player.targetFacing = facing;
  }

  /**
   * The wizard loses integrity, unless invincible (debug mode) or still
   * invulnerable from the last hit; losing the last point kills him. Every
   * damage source goes through here (D43): hazard blocks, enemies,
   * squeezing platforms and the debug test-damage key. Reported
   * as a 'hurt' (and 'die') event with this tick's events, or the next
   * tick's when called outside update().
   * @param {number} [amount]
   * @param {object} [source]
   * @param {number[]} [source.cell] the hazard block that hurt him, passed on with the event
   * @param {Enemy} [source.enemy] the enemy that hurt him, passed on with the event
   */
  hurt(amount = 1, { cell, enemy } = {}) {
    if (this.invincible) return;
    const lost = this.player.hurt(amount);
    if (lost > 0) this.emit('hurt', { amount: lost, ...(cell && { cell }), ...(enemy && { enemy }) });
    if (this.player.dead) this.died();
  }

  /** The wizard just died: report it, with a message naming the cause. */
  died() {
    const cause = this.player.deathCause;
    say(DEATH_MESSAGES[cause]);
    this.emit('die', { cause });
  }

  /**
   * Record an event for this tick's (or, outside update(), the next tick's)
   * list.
   * @param {GameEvent['type']} type
   * @param {Omit<GameEvent, 'type'>} [details]
   */
  emit(type, details) {
    this.events.push({ type, ...details });
  }

  /** The events recorded so far, cleared. @returns {GameEvent[]} */
  takeEvents() {
    return this.events.splice(0);
  }

  /**
   * Switch between grid-aligned and screen-relative movement (D38),
   * announcing the new mode as a terminal message.
   */
  toggleMovementMode() {
    this.movementMode = this.movementMode === 'grid' ? 'screen' : 'grid';
    say(this.movementMode === 'grid' ? 'msg.movementGrid' : 'msg.movementScreen');
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
   * One fixed tick: player → exits → his push → objects → enemies →
   * bouncing off enemies → enemy contact → events.
   * Walking out through an exit starts a transition: fade out (frozen
   * world), load the next room, fade in (running).
   * @param {import('./core/input.js').Input} input
   * @returns {GameEvent[]} what happened this tick
   */
  update(input) {
    if (this.transition?.phase === 'out') return this.fadeOut();
    if (this.transition && ++this.transition.tick >= TRANSITION.inTicks) this.transition = null;

    const { player } = this;
    const playerEvent = player.update(input, this.grid, {
      bodies: this.solids,
      invincible: this.invincible,
      movementMode: this.movementMode,
    });

    // Dying drained his integrity (Player). Respawning restores it and
    // resets the room, so no puzzle stays broken.
    if (playerEvent === 'respawn') {
      say('msg.respawn');
      this.enterRoom(this.room.id, this.room.reset);
      this.emit('respawn');
      this.emit('room');
      return this.takeEvents();
    }

    const exit = player.dead ? null : exitAt(this.room, player.pos);
    if (exit) {
      this.transition = { phase: 'out', tick: 0, exit };
      this.emit('exit', { exit });
      return this.takeEvents();
    }
    if (playerEvent === 'die') this.died();
    else if (playerEvent) this.emit(playerEvent);

    // Touching a hazard block hurts (then he is invulnerable for a while).
    const hazard = player.dead ? null : touchedCell(player.box(), this.grid, CELL.hazard);
    if (hazard) this.hurt(this.room.blockTypes.hazard.damage, { cell: hazard });

    const intent = player.pushIntent;
    if (intent && intent.body.push(intent.dir, this)) this.emit('push', { object: intent.body });

    // Lower objects first, so a stack settles in one tick.
    this.updateOrder.sort((a, b) => a.pos[1] - b.pos[1]);
    for (const object of this.updateOrder) {
      const event = object.update(this);
      if (event) this.emit(event, { object });
      if (event === 'plug') say('msg.plug');
      // Objects above it see the change this same tick (a crate on a collapsed block falls).
      if (event === 'collapse' || event === 'regrow') this.refreshBodies();
    }

    // Enemies after objects, so they step off platforms and crates where those are now.
    // Dead ones too: their pop runs on.
    for (const enemy of this.enemies) {
      const event = enemy.update(this);
      if (event) this.emit(event, { enemy });
      if (event === 'pop') this.refreshBodies();
    }
    this.bounceOffEnemies();
    this.touchEnemies();
    return this.takeEvents();
  }

  /**
   * Falling onto the top of a bouncy enemy bounces the wizard up (D48),
   * harmlessly: his feet were above its top last tick and are at or below
   * it now, over its footprint.
   */
  bounceOffEnemies() {
    const { player } = this;
    if (player.dead || player.vy >= 0) return;
    const [px, , pz] = player.box();
    for (const enemy of this.liveEnemies) {
      if (!enemy.data.bounce) continue;
      const [bx, by, bz] = enemy.box();
      const top = by[1];
      if (player.prev[1] >= top - BOUNCE_REACH && player.pos[1] <= top && overlaps(px, bx) && overlaps(pz, bz)) {
        player.bounce(top);
        enemy.bounced = 0;
        this.emit('bounce', { enemy });
        return;
      }
    }
  }

  /** Touching a hostile enemy with a contact attack hurts the wizard (D43); he walks through them. */
  touchEnemies() {
    const { player } = this;
    if (player.dead) return;
    const box = player.box();
    for (const enemy of this.liveEnemies) {
      if (!enemy.hurtsOnContact) continue;
      const other = enemy.box();
      if (box.every((range, i) => overlaps(range, other[i]))) {
        this.hurt(enemy.data.damage, { enemy });
        return;
      }
    }
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
   * @returns {GameEvent[]}
   */
  fadeOut() {
    const { exit } = this.transition;
    const player = this.player;
    player.savePrevious();
    for (const object of this.objects) object.savePrevious();
    for (const enemy of this.enemies) enemy.savePrevious();

    if (++this.transition.tick < TRANSITION.outTicks) {
      const { cross } = sideAxes(exit.side);
      player.pos[cross] += (isBackSide(exit.side) ? -1 : 1) * PLAYER.speed * DT;
      return this.takeEvents();
    }
    this.travel(exit);
    this.transition = { phase: 'in', tick: 0 };
    this.emit('room');
    return this.takeEvents();
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
    const y = groundBelow(pos, size, this.grid, this.solids);
    if (y === 0 && this.grid.isHole(pos[0], pos[2])) return null;
    return y;
  }

  /**
   * Drop shadow height under a falling object at `pos` (lower corner), or
   * null above a hole.
   * @param {{ size: number[] }} object
   * @param {number[]} pos interpolated lower corner
   */
  objectShadowHeight(object, pos) {
    const box = pos.map((p, i) => [p, p + object.size[i]]);
    const y = surfaceBelow(box, this.grid, this.bodies, object);
    const [x, , z] = object.size;
    if (y === 0 && this.grid.isHole(pos[0] + x / 2, pos[2] + z / 2)) return null;
    return y;
  }
}
