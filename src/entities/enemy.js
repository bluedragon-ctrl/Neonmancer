/**
 * An enemy (a corrupted program): a small body that moves one grid cell at
 * a time where its movement behavior (ai/behaviors.js) leads it, and falls
 * when nothing holds it up (D48). Everything about it comes from its type
 * in defs.json and the room's overrides: model, movement, attack,
 * hostility, aggro range, integrity, damage, speeds, bounce, color and the
 * discharge attack's values; any look, movement and attack combine (D77).
 * Pure logic, one call each to sense(), update() and updateAttack() per
 * fixed tick (Game.update()).
 *
 *   rest ──behavior steps, cell free and safe──► walk ──arrive──► rest
 *     │ └─cell blocked, or a hole or void block there: turn back, wait turnTicks
 *     └──no support──► fall ──land──► rest
 *   falls into a hole or onto a void block ──► dead (pops; gone until the room resets)
 *   hit by a spell or a discharge ──► integrity − damage; at 0 ──► dead (pops)
 *
 * It never steps into a hole or where it would land on a lethal block
 * (D77); it only ends up in one when the ground goes from under it.
 * Seeing: a hostile enemy with an aggro range notices the wizard within it
 * when nothing blocks the line between them (ai/sight.js); a "!" pops up
 * over it then, and when a provoked one turns hostile.
 * Discharge attack: seeing him within its attack range at rest, it stops,
 * charges, fires (Game.discharge()), then cools down.
 *
 * It only starts a step from a whole cell (so on a platform, only at a
 * stop). The wizard walks through it, unless it is solid: then it blocks
 * him, carries him when he stands on it and shoves him when it walks into
 * him (turning back if he is pinned), like a moving platform. Touching a
 * hostile one with a touch attack hurts him, and landing on a bouncy one
 * bounces him up (Game.update()). Crates, platforms, walls, other
 * enemies and a step up block it. Pushables rest on it and can't be pushed
 * into it; platforms carry it and wait for it (entities/platform.js).
 */
import { DT } from '../core/loop.js';
import { BEHAVIORS } from '../ai/behaviors.js';
import { DISCHARGES } from '../data/room-data.js';
import { boxCenter, lineOfSight, reach } from '../ai/sight.js';
import { REST_EPS, moveAxis, overlapsBox, overlapsSolid, restsOn, shoveClear, surfaceBelow } from '../physics/collision.js';

/** Tuning values (units, ticks). */
export const ENEMY = {
  /** Hitbox; centered in its cell, standing on the cell's floor. */
  size: [0.6, 0.6, 0.6],
  gravity: 30,
  maxFall: 18,
  /** Ticks it waits after its way was blocked, before heading back. */
  turnTicks: 12,
  /** Farthest a solid enemy shoves the wizard in one tick (as platforms do). */
  maxShove: 0.35,
  /** Height of its eyes above its cell floor: where it looks from and discharges from. */
  eyeHeight: 0.4,
  /** Ticks the lightning of a discharge lasts. */
  dischargeTicks: 10,
  /** Ticks the "!" stays up at least, once it notices him or is provoked. */
  alertTicks: 60,
};

/** A step this close to done counts as done. */
const SNAP = 1e-9;

export class Enemy {
  /**
   * @param {object} enemy runtime room enemy (id, type, at, path, behavior, speed, damage...)
   */
  constructor(enemy) {
    this.data = enemy;
    this.id = enemy.id;
    this.type = enemy.type;
    this.size = ENEMY.size;
    /** Lower corner of its cell [x, y, z]; whole cells except while walking, falling or riding. */
    this.pos = [...enemy.at];
    /** Position at the previous tick, for render interpolation. */
    this.prev = [...this.pos];
    /** 'rest' | 'walk' | 'fall' | 'dead' */
    this.state = 'rest';
    this.vy = 0;
    /** While walking: the cell it left, the cell it walks into and how far it got (0..1). */
    this.from = null;
    this.target = null;
    this.walked = 0;
    /** Scratch position for the step being tried (walk()), reused every tick. */
    this.next = [0, 0, 0];
    /** Direction it faces, radians around y (0 looks along +z, like the models). */
    this.facing = 0;
    /** Walking speed in units per second: the path's own, else its type's. */
    this.speed = enemy.path?.speed ?? enemy.speed;
    /** Speed of the step it is taking: its chase speed while after the wizard. */
    this.stepSpeed = this.speed;
    this.behavior = new BEHAVIORS[enemy.movement](enemy.at, enemy.path, enemy);
    /** Does it see the wizard (hostile, within aggro range, nothing in the way)? See sense(). */
    this.sees = false;
    /** The column [x, z] it last saw him in, or null. */
    this.lastSeen = null;
    /** Is he within its discharge range (while it sees him)? */
    this.inRange = false;
    /** Ticks since the "!" popped up (it noticed him or was provoked), or null. */
    this.alert = null;
    /** Discharge attack: ticks since it started charging (null: not attacking), ticks until it may again. */
    this.attackTick = null;
    this.cooldown = 0;
    this.chargeTicks = Math.max(1, Math.round(enemy.attackCharge / DT));
    this.cooldownTicks = Math.round(enemy.attackCooldown / DT);
    /** An arc's aim, fixed when it starts charging: { dir, end } (Game.aimDischarge()). */
    this.aim = null;
    /** Where the last arc stopped (Game.discharge()). */
    this.boltEnd = null;
    /** Integrity left; a spell hit takes some (hit()), at 0 it pops. */
    this.integrity = enemy.integrity;
    /** Ticks since a spell last hit it (for the view), or null. */
    this.hitTicks = null;
    /** A 'provoked' enemy turns hostile once attacked (provoke()). */
    this.provoked = false;
    /** Ticks since the wizard last bounced off it (for the view), or null. */
    this.bounced = null;
    /** Ticks left before it may start a step (after being blocked). */
    this.wait = 0;
    /** How it died: 'hole' | 'void' | 'zap'; null while alive. */
    this.deathCause = null;
    /** Ticks since it died, for the pop. */
    this.timer = 0;
  }

  get alive() {
    return this.state !== 'dead';
  }

  /** Does it block the wizard (and carry and shove him)? */
  get solid() {
    return this.alive && this.data.solid;
  }

  /** Does it attack the wizard: hostile by type, or provoked by an attack? */
  get hostile() {
    const { hostility } = this.data;
    return this.alive && (hostility === 'hostile' || (hostility === 'provoked' && this.provoked));
  }

  /** Does touching it hurt: hostile, with a touch attack? */
  get hurtsOnContact() {
    return this.hostile && this.data.attack === 'touch';
  }

  /** Is its attack a discharge (burst or arc)? */
  get discharges() {
    return DISCHARGES.includes(this.data.attack);
  }

  /** It was attacked (a spell hit it): a 'provoked' enemy turns hostile, and a "!" pops up. */
  provoke() {
    if (this.data.hostility === 'provoked' && !this.provoked) this.alert = 0;
    this.provoked = true;
  }

  /** Is the "!" over it: for a while after it popped up, and as long as it sees him. */
  get alerted() {
    return this.alive && this.alert !== null && (this.alert < ENEMY.alertTicks || this.sees);
  }

  /** Its eyes: where it looks and discharges from. */
  middle() {
    const [x, y, z] = this.pos;
    return [x + 0.5, y + ENEMY.eyeHeight, z + 0.5];
  }

  /**
   * Look for the wizard: does it see him (hostile, within its aggro range,
   * nothing solid in between), and is he within its discharge range? Then
   * its behavior follows what it sees. Once a tick, before update().
   * @param {import('../game.js').Game} game grid, player and sightBlockers
   * @returns {boolean} whether it has just noticed him (a new "!")
   */
  sense({ grid, player, sightBlockers }) {
    if (this.alert !== null) this.alert++;
    const saw = this.sees;
    this.sees = false;
    this.inRange = false;
    if (this.alive && this.hostile && !player.dead && this.data.aggroRange > 0) {
      const eyes = this.middle();
      const box = player.box();
      const distance = reach(eyes, box);
      this.sees = distance <= this.data.aggroRange && lineOfSight(eyes, boxCenter(box), grid, sightBlockers);
      if (this.sees) {
        this.lastSeen = [Math.floor(player.pos[0]), Math.floor(player.pos[2])];
        this.inRange = this.discharges && distance <= this.data.attackRange;
      }
    }
    this.behavior.update?.(this);
    if (!this.sees || saw) return false;
    this.alert = 0;
    return true;
  }

  /** Turn to face the point `[x, , z]`. */
  faceTowards([x, , z]) {
    const [mx, , mz] = this.middle();
    if (x !== mx || z !== mz) this.facing = Math.atan2(x - mx, z - mz);
  }

  /** Will it attack as soon as it stands still: he is in range and it is ready? */
  get readyToAttack() {
    return this.inRange && this.cooldown === 0 && this.attackTick === null;
  }

  /**
   * The discharge attack, once a tick after update(): start charging when
   * it sees him within range, stands still and is ready ('charge'), fire
   * when charged ('discharge', resolved by Game.discharge()), then cool
   * down. Falling or dying cuts it off.
   * @param {import('../game.js').Game} game
   * @returns {'charge'|'discharge'|null}
   */
  updateAttack(game) {
    if (!this.discharges) return null;
    if (this.cooldown > 0) this.cooldown--;
    if (this.attackTick !== null) {
      if (!this.alive || this.state === 'fall') {
        this.endAttack();
        return null;
      }
      this.attackTick++;
      if (this.attackTick === this.chargeTicks) return 'discharge';
      if (this.attackTick >= this.chargeTicks + ENEMY.dischargeTicks) this.endAttack();
      return null;
    }
    if (!this.alive || !this.readyToAttack || this.state !== 'rest') return null;
    this.attackTick = 0;
    this.faceTowards(game.player.pos);
    return 'charge';
  }

  /** The attack is over (or cut off): cool down. */
  endAttack() {
    this.attackTick = null;
    this.aim = null;
    this.cooldown = this.cooldownTicks;
  }

  /** Has a spell taken some of its integrity? */
  get damaged() {
    return this.integrity < this.data.integrity;
  }

  /**
   * A spell or a discharge hits it: it is provoked and loses `damage`
   * integrity; losing the last pops it.
   * @param {number} damage
   * @param {'zap'|'discharge'} cause
   * @returns {'hit'|'pop'|null} event (null if it was dead already)
   */
  hit(damage, cause) {
    if (!this.alive) return null;
    this.provoke();
    this.integrity = Math.max(0, this.integrity - damage);
    this.hitTicks = 0;
    return this.integrity === 0 ? this.die(cause) : 'hit';
  }

  /** Keep this tick's start for render interpolation (copied in place). */
  savePrevious() {
    for (let i = 0; i < 3; i++) this.prev[i] = this.pos[i];
  }

  /** Collision box [[minX, maxX], [minY, maxY], [minZ, maxZ]]. */
  box() {
    return enemyBox(this.pos, this.size);
  }

  /**
   * One fixed tick.
   * @param {import('../game.js').Game} game grid and `obstacles` (solid objects and live enemies)
   * @returns {'pop'|'land'|null} event
   */
  update(game) {
    this.savePrevious();
    if (this.bounced !== null) this.bounced++;
    if (this.hitTicks !== null) this.hitTicks++;
    if (this.state === 'dead') {
      this.timer++;
      return null;
    }
    if (this.state === 'walk') return this.walk(game);
    if (this.state === 'fall') return this.fall(game);
    return this.rest(game);
  }

  /**
   * Standing: fall if unsupported, die on void, else take the next step
   * (the first free and safe one its behavior offers). It stands still
   * while it attacks, and when it is about to.
   */
  rest(game) {
    if (this.startFalling(game)) return this.fall(game);
    if (this.onLethal(game.grid)) return this.die('void');
    if (this.attackTick !== null || this.readyToAttack) return null;
    if (this.wait > 0) {
      this.wait--;
      return null;
    }
    if (!this.pos.every(Number.isInteger)) return null; // riding a platform between stops
    if (this.solid && this.loaded(game)) return null; // a crate on top holds it down
    const [x, y, z] = this.pos;
    const found = this.behavior.next(x, z, this);
    if (!found) {
      // Holding its ground or searching: it keeps its eyes on him.
      if (this.sees) this.faceTowards(game.player.pos);
      return null;
    }
    const steps = Array.isArray(found[0]) ? found : [found];
    const step = steps.find(([dx, dz]) => this.canStep([x + dx, y, z + dz], game)) ?? null;
    const [dx, dz] = step ?? steps[0];
    this.facing = Math.atan2(dx, dz);
    if (!step) {
      this.behavior.turnBack();
      this.wait = ENEMY.turnTicks;
      return null;
    }
    const target = [x + dx, y, z + dz];
    this.stepSpeed = this.behavior.chasing ? this.data.chaseSpeed : this.speed;
    this.state = 'walk';
    this.from = [...this.pos];
    this.target = target;
    this.walked = 0;
    return this.walk(game); // no standing still between cells
  }

  /** Walking into the next cell; something in the way turns it back to the cell it left. */
  walk(game) {
    // Distance from the cell it left, counted on its own so that whole
    // cells are exact (adding up small float steps drifts).
    const walked = Math.min(this.walked + this.stepSpeed * DT, 1);
    const arrived = walked >= 1 - SNAP;
    const { from, target, next } = this;
    for (let i = 0; i < 3; i++) next[i] = arrived ? target[i] : from[i] + (target[i] - from[i]) * walked;
    // Something in the way, or (solid) the wizard pinned: turn back instead of crushing him.
    if (this.blockedAt(next, game) || (this.solid && !this.carryPlayer(next, game))) {
      this.turnAround();
      return null;
    }
    for (let i = 0; i < 3; i++) this.pos[i] = next[i];
    this.walked = walked;
    if (arrived) {
      this.state = 'rest';
      this.from = this.target = null;
      // Off a ledge or onto a hole: fall right away.
      if (!this.startFalling(game) && this.onLethal(game.grid)) return this.die('void');
    }
    return null;
  }

  /** Mid-step, head back to the cell it left. */
  turnAround() {
    [this.from, this.target] = [this.target, this.from];
    this.walked = 1 - this.walked;
    this.facing = Math.atan2(this.target[0] - this.from[0], this.target[2] - this.from[2]);
    this.behavior.turnBack();
  }

  /** Start falling if nothing holds it up. @returns {boolean} whether it did */
  startFalling(game) {
    if (this.support(game) >= this.pos[1] - REST_EPS) return false;
    this.state = 'fall';
    this.vy = 0;
    return true;
  }

  /** Falling whole cells straight down; a hole or a void block below is its end. */
  fall(game) {
    const support = this.support(game);
    this.vy = Math.max(this.vy - ENEMY.gravity * DT, -ENEMY.maxFall);
    const y = this.pos[1] + this.vy * DT;
    if (y > support) {
      this.pos[1] = y;
      return null;
    }
    this.pos[1] = support;
    this.vy = 0;
    if (support < 0) return this.die('hole');
    this.state = 'rest';
    if (this.onLethal(game.grid)) return this.die('void');
    return 'land';
  }

  /** @param {'hole'|'void'|'zap'} cause */
  die(cause) {
    this.state = 'dead';
    this.deathCause = cause;
    this.timer = 0;
    return 'pop';
  }

  /**
   * A solid enemy moving to `next`: carry the wizard if he stands on top
   * (walls scrape him off), then shove him clear of its new box. False, and
   * nothing moves, if he is pinned.
   * @returns {boolean}
   */
  carryPlayer(next, { grid, solids, player }) {
    if (player.dead) return true;
    const newBox = enemyBox(next, this.size);
    const playerBox = player.box();
    const riding = restsOn(playerBox, this.box());
    if (!riding && !overlapsBox(playerBox, newBox)) return true; // not in its way
    const others = solids.filter((body) => body !== this);
    const pos = [...player.pos];
    if (riding) {
      moveAxis(pos, player.size, 0, next[0] - this.pos[0], grid, others, player);
      moveAxis(pos, player.size, 2, next[2] - this.pos[2], grid, others, player);
    }
    const shoved = shoveClear(pos, player.size, newBox, grid, others, player, ENEMY.maxShove);
    if (!shoved) return false;
    player.pos = shoved;
    return true;
  }

  /** Does a crate or another body rest on top of it? */
  loaded({ obstacles }) {
    const box = this.box();
    return obstacles.some((body) => body !== this && restsOn(body.box(), box));
  }

  /** Can it step into the cell `target`: inside the room, clear of blocks and bodies? */
  canEnter(target, game) {
    return game.grid.isInside(target[0], target[2]) && !this.blockedAt(target, game);
  }

  /**
   * Can it step into the cell `target`, and is it safe there: whatever it
   * would stand on (or land on, off a ledge) is no hole and no lethal block?
   */
  canStep(target, game) {
    if (!this.canEnter(target, game)) return false;
    const ground = this.supportAt(target, game);
    if (ground < 0) return false;
    const [x, , z] = target;
    // On a block top (whole heights); objects and platforms are never lethal.
    return !(Number.isInteger(ground) && game.grid.typeAt(x, ground - 1, z)?.lethal);
  }

  /** Would its box at `pos` run into a block, a solid object or another enemy? */
  blockedAt(pos, { grid, obstacles }) {
    const box = enemyBox(pos, this.size);
    if (overlapsSolid(box, grid)) return true;
    for (const body of obstacles) {
      if (body !== this && overlapsBox(box, body.box())) return true;
    }
    return false;
  }

  /**
   * Height it would stand at: the highest surface under it (blocks, solid
   * objects, other enemies; the wizard only under a solid enemy), or −1
   * above a hole.
   */
  support(game) {
    return this.supportAt(this.pos, game);
  }

  /** Height it would stand at in the cell with its lower corner at `pos` (see support()). */
  supportAt(pos, { grid, obstacles, player }) {
    const box = enemyBox(pos, this.size);
    let top = surfaceBelow(box, grid, obstacles, this);
    if (this.solid && !player.dead) top = Math.max(top, surfaceBelow(box, grid, [player], this));
    const [x, , z] = pos;
    if (top === 0 && grid.isHole(x + 0.5, z + 0.5)) return -1;
    return top;
  }

  /** Is it standing right on a lethal block (void)? */
  onLethal(grid) {
    const [x, y, z] = this.pos;
    return Number.isInteger(y) && Boolean(grid.typeAt(Math.floor(x + 0.5), y - 1, Math.floor(z + 0.5))?.lethal);
  }
}

/**
 * Box of an enemy of `size` in the cell with its lower corner at `pos`:
 * centered, on the cell floor.
 * @param {number[]} pos
 * @param {number[]} size
 */
export function enemyBox([x, y, z], [w, h, d]) {
  const mx = (1 - w) / 2;
  const mz = (1 - d) / 2;
  return [
    [x + mx, x + mx + w],
    [y, y + h],
    [z + mz, z + mz + d],
  ];
}
