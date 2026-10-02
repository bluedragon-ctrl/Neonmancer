/**
 * An enemy (a corrupted program): a small body that moves one grid cell at
 * a time where its movement behavior (ai/behaviors.js) leads it, and falls
 * when nothing holds it up (D48). Everything about it comes from its
 * template in defs.json (D119; a room gives only its cell and path): look,
 * movement, attack, hostility, aggro range, integrity, damage, speeds,
 * bounce, color and the charged attack's values; any look, movement and
 * attack combine (D78).
 * Pure logic, one call each to sense(), update() and updateAttack() per
 * fixed tick (Game.update()).
 *
 *   rest ──behavior steps, cell free and safe──► walk ──arrive──► rest
 *     │ └─cell blocked, or a hole or void block there: turn back, wait turnTicks
 *     └──no support──► fall ──land──► rest
 *   falls into a hole or onto a void block ──► dead (pops; gone until the room resets)
 *   hit by a spell, a discharge or a bolt ──► integrity − damage; at 0 ──► dead (pops)
 *   hit by Pause ──► frozen for a while (still falls; hits still hurt it) ──► thaws
 *   pulled (D124) ──► walk a cell towards the wizard, frozen or not (it can't act until there)
 *
 * It never steps into a hole or where it would land on a lethal block
 * (D78); it only ends up in one when the ground goes from under it (while
 * walking too: it drops as it walks on). It never starts a step into a
 * cell another enemy is walking into, and something in its way mid-step
 * turns it back to the cell it left, where it waits turnTicks (D80).
 * Seeing: a hostile enemy with an aggro range notices the wizard within it
 * when nothing blocks the line between them (ai/sight.js); a "!" pops up
 * over it then, when a provoked one turns hostile, and when anything hits
 * it (it turns to the wizard and looks for him there, alarm(), D80, D81).
 * Charged attack (burst, arc or bolt): seeing him within its attack range
 * at rest, it stops, charges, fires (discharge() in combat.js), then cools down.
 * Frozen by Pause (D85), it stops where it is, even mid-step, sees nothing,
 * attacks nothing and hurts nothing, and is solid (a platform, the D51
 * rules) until it thaws; it still falls, rides platforms and takes hits.
 * A boss (a template with a `boss` block, D134, D135) is never frozen nor
 * pulled; it wakes when it first sees the wizard or is hit, and stays
 * awake. Its phases change its values as its integrity drops (bossPhases()
 * in data/room-data.js); one may teleport it to another cell now and then
 * (teleport()); plate armor turns hits away unless it stands on a floor
 * plate (`exposed`, set every tick by updateArmor() in combat.js).
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
import { CHARGED_ATTACKS, DISCHARGES, bossPhases } from '../data/room-data.js';
import { seededRandom, stringSeed } from '../core/random.js';
import { boxCenter, lineOfSight, reach } from '../ai/sight.js';
import { REST_EPS, moveAxis, overlapsBox, overlapsSolid, restsOn, shoveClear, surfaceBelow } from '../physics/collision.js';

/** Tuning values (units, ticks). */
export const ENEMY = {
  /** Hitbox; centered in its cell, standing on the cell's floor. */
  size: [0.6, 0.6, 0.6],
  gravity: 30,
  maxFall: 18,
  /** Ticks it waits after its way was blocked, before heading on. */
  turnTicks: 12,
  /** Farthest a solid enemy shoves the wizard in one tick (as platforms do). */
  maxShove: 0.35,
  /** Height of its eyes above its cell floor: where it looks from and its attacks leave from. */
  eyeHeight: 0.4,
  /** Ticks the lightning of a discharge lasts (and a bolt's firing pose). */
  dischargeTicks: 10,
  /** Ticks the "!" stays up at least, once it notices him or is provoked. */
  alertTicks: 60,
  /** Units per second it slides when Pull drags it (D124): as fast as a pushed crate. */
  pullSpeed: 3,
};

/** Boss tuning (D135; units, ticks). */
export const BOSS = {
  /** Ticks a teleport takes: it flickers out, jumps half way through, flickers in. */
  teleportTicks: 30,
  /** It never teleports nearer the wizard (or his decoy) than this. */
  teleportClear: 3,
  /** Ticks it waits before trying again when there was no cell to teleport to. */
  teleportRetry: 30,
};

/** A step this close to done counts as done. */
const SNAP = 1e-9;

/** The four steps along the grid axes [dx, dz]. */
const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class Enemy {
  /**
   * @param {object} enemy runtime room enemy (id, template, at, path, behavior, speed, damage...)
   */
  constructor(enemy) {
    /** Its values (template, filled in) in each phase; one phase unless it is a boss (D135). */
    this.phases = enemy.boss ? bossPhases(enemy) : [enemy];
    /** The phase it is in (an index into phases); a boss's goes up as its integrity drops (updatePhase()). */
    this.phase = 0;
    /** Its values now: its template's (filled in), changed by its phase. */
    this.data = this.phases[0];
    this.id = enemy.id;
    this.template = enemy.template;
    /** The boss block of its template (D135), or null. */
    this.boss = enemy.boss ?? null;
    /** The id of the room pickup a boss holds until it is beaten (D104), or null. */
    this.dropId = enemy.drop ?? null;
    /** A boss is awake from when it first sees the wizard or is hit: its bar shows, it teleports. */
    this.awake = false;
    /** Plate armor (D135): does it stand on a plate, its armor open? Set by updateArmor() in combat.js. */
    this.exposed = !this.boss || this.boss.armor !== 'plate';
    /** A teleport under way: { tick, to } (the cell it jumps to), or null; see teleport(). */
    this.warp = null;
    /** Ticks until a teleport is due (while awake, in a phase that teleports). */
    this.teleportClock = 0;
    /** Its own dice, for where it teleports: the same every time the room resets. */
    this.random = seededRandom(stringSeed(enemy.id));
    this.size = [ENEMY.size[0], enemy.height ?? ENEMY.size[1], ENEMY.size[2]];
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
    /** Walking speed in units per second (its template's, D119). */
    this.speed = enemy.speed;
    /** Speed of the step it is taking: its chase speed while after the wizard. */
    this.stepSpeed = this.speed;
    this.behavior = new BEHAVIORS[enemy.movement](enemy.at, enemy.path, enemy);
    /** Does it see the wizard (hostile, within aggro range, nothing in the way)? See sense(). */
    this.sees = false;
    /** The column [x, z] it last saw him in (or was hit from, alarm()), or null. */
    this.lastSeen = null;
    /** Is he within its attack range (while it sees him)? */
    this.inRange = false;
    /** What it sees and goes after: the wizard, or his Fork's decoy when that is nearer (D129); null when it sees nothing. */
    this.focus = null;
    /** Ticks since the "!" popped up (it noticed him, was provoked or hit), or null. */
    this.alert = null;
    /** Charged attack: ticks since it started charging (null: not attacking), ticks until it may again. */
    this.attackTick = null;
    this.cooldown = 0;
    this.chargeTicks = 0;
    this.cooldownTicks = 0;
    this.timeAttack();
    /** An arc's aim, fixed when it starts charging: { dir, end } (aimDischarge() in combat.js). */
    this.aim = null;
    /** Where the last arc stopped (discharge() in combat.js). */
    this.boltEnd = null;
    /** Integrity left; a hit takes some (hit()), at 0 it pops. */
    this.integrity = enemy.integrity;
    /** Ticks since something last hit it (for the view), or null. */
    this.hitTicks = null;
    /** A 'provoked' enemy turns hostile once attacked (provoke()). */
    this.provoked = false;
    /** Ticks since the wizard last bounced off it (for the view), or null. */
    this.bounced = null;
    /** Ticks left before it may start a step (after being blocked). */
    this.wait = 0;
    /** Frozen by Pause (D85): { tick, ticks }, tick counting up to its duration ticks; null while not. */
    this.frozen = null;
    /**
     * Frozen round the wizard (he was inside it): not solid for him until he
     * has stepped out of it, so freezing never traps him (updateFrozen() in combat.js).
     */
    this.passable = false;
    /** How it died: 'hole' | 'void' | 'zap' | 'discharge' | 'bolt' | 'firewall' | 'blink'; null while alive. */
    this.deathCause = null;
    /** Ticks since it died, for the pop. */
    this.timer = 0;
    /**
     * Being pulled (D124): the whole cell it goes back to if something
     * stops it on the way ([x, y, z]), or null. It walks there while
     * frozen too, and does nothing else until it arrives.
     */
    this.pulled = null;
  }

  get alive() {
    return this.state !== 'dead';
  }

  /** The ticks of its charged attack and of its teleports, from its values now. */
  timeAttack() {
    this.chargeTicks = Math.max(1, Math.round(this.data.attackCharge / DT));
    this.cooldownTicks = Math.round(this.data.attackCooldown / DT);
    this.teleportTicks = this.data.teleport ? Math.round(this.data.teleport / DT) : 0;
  }

  /** Its integrity at its fullest (its template's). */
  get maxIntegrity() {
    return this.phases[0].integrity;
  }

  /**
   * A boss moves on to the phase its integrity has come down to (D135):
   * its values change, a new movement starts afresh, an attack it was
   * charging is cut off (it cools down first) and its teleport clock
   * starts over.
   * @returns {boolean} whether a new phase started
   */
  updatePhase() {
    const share = this.integrity / this.maxIntegrity;
    let phase = this.phase;
    while (phase + 1 < this.phases.length && share <= this.boss.phases[phase + 1].from) phase++;
    if (phase === this.phase) return false;
    const { movement } = this.data;
    this.phase = phase;
    this.data = this.phases[phase];
    this.speed = this.data.speed;
    if (this.data.movement !== movement) this.behavior = new BEHAVIORS[this.data.movement](this.data.at, this.data.path, this.data);
    if (this.attackTick !== null) this.endAttack();
    this.timeAttack();
    this.teleportClock = this.teleportTicks;
    return true;
  }

  /**
   * A boss wakes (D135): its bar shows from now on, and its teleport
   * clock starts. Once only.
   */
  wake() {
    if (!this.boss || this.awake) return;
    this.awake = true;
    this.teleportClock = this.teleportTicks;
  }

  /** Does it block the wizard (and carry and shove him)? Solid ones, and frozen ones (D85). */
  get solid() {
    return this.alive && (this.data.solid || this.frozen !== null);
  }

  /** Does it attack the wizard: hostile by type, or provoked by an attack? */
  get hostile() {
    const { hostility } = this.data;
    return this.alive && (hostility === 'hostile' || (hostility === 'provoked' && this.provoked));
  }

  /** Does touching it hurt: hostile, with a touch attack, and not frozen? */
  get hurtsOnContact() {
    return this.hostile && this.data.attack === 'touch' && this.frozen === null;
  }

  /** Does landing on it bounce the wizard up: a bouncy one, not frozen (then it is a plain platform)? */
  get bouncy() {
    return this.data.bounce && this.frozen === null;
  }

  /**
   * Pause hits it (D85): it is provoked (a provoked one thaws hostile) and,
   * unless its type isn't pausable, frozen for `ticks`; freezing a frozen
   * one starts it over. Whatever it was doing stops: an attack is cut off
   * and it sees nothing (sense()).
   * @param {number} ticks
   * @returns {'freeze'|null} event (null if it was dead already or can't be paused)
   */
  freeze(ticks) {
    if (!this.alive) return null;
    this.provoke();
    if (!this.data.pausable || this.boss) return null;
    if (this.attackTick !== null) this.endAttack();
    this.frozen = { tick: 0, ticks };
    this.sees = false;
    this.inRange = false;
    return 'freeze';
  }

  /**
   * Pull drags it a cell along `dir` towards the wizard (D124), from the
   * cell it stands in, or of the two it is walking between the one it is
   * nearer: the way it walks, but over anything, so a hole or a lethal
   * floor there is its end. Frozen or not, it slides there at
   * ENEMY.pullSpeed and does nothing else until it arrives; an attack it
   * was charging is cut off. A block, the room's side or a body (the
   * wizard too) in that cell, or another enemy walking into it, holds it;
   * a boss doesn't budge (D135).
   * @param {number[]} dir [dx, dz]
   * @param {import('../game.js').Game} game grid, obstacles, liveEnemies and player
   * @returns {boolean} whether it moves
   */
  pull([dx, dz], game) {
    if (!this.alive || this.state === 'fall' || this.boss || this.warp) return false;
    const base = this.state === 'walk' ? (this.walked < 0.5 ? this.from : this.target) : this.pos;
    if (!Number.isInteger(base[0]) || !Number.isInteger(base[2])) return false; // riding a platform between stops
    const [x, y, z] = [base[0], this.pos[1], base[2]];
    const target = [x + dx, y, z + dz];
    if (!game.grid.isInside(target[0], target[2]) || this.claimed(target, game)) return false;
    if (this.blockedAt(target, game, [...game.obstacles, game.player])) return false;
    if (this.attackTick !== null) this.endAttack();
    this.pulled = [x, y, z];
    this.pullTo(target);
    return true;
  }

  /** Can the wizard push it: a frozen one, as a block (a boss never freezes, D135)? */
  get pushable() {
    return this.alive && this.frozen !== null && !this.boss;
  }

  /**
   * The wizard pushes a frozen enemy a cell along `dir`, like a crate but
   * slid the way Pull drags it (pull()): over anything, so a hole or a lethal
   * floor there is its end. It stays frozen on the way.
   * @param {number[]} dir [dx, dz]
   * @param {import('../game.js').Game} game
   * @returns {boolean} whether it moves
   */
  push(dir, game) {
    return this.pushable && !this.pulled && this.pull(dir, game);
  }

  /** Slide from where it is to the cell `target`, at the pull's speed. */
  pullTo(target) {
    this.state = 'walk';
    this.from = [...this.pos];
    this.target = target;
    this.walked = 0;
    this.stepSpeed = ENEMY.pullSpeed / (Math.hypot(target[0] - this.pos[0], target[2] - this.pos[2]) || 1);
  }

  /** Is its attack charged (a burst, an arc or a bolt)? */
  get charged() {
    return CHARGED_ATTACKS.includes(this.data.attack);
  }

  /** Is its attack a discharge of lightning (a burst or an arc)? */
  get discharges() {
    return DISCHARGES.includes(this.data.attack);
  }

  /** It was attacked (something hit it): a 'provoked' enemy turns hostile, and a "!" pops up. */
  provoke() {
    if (this.data.hostility === 'provoked' && !this.provoked) this.alert = 0;
    this.provoked = true;
  }

  /**
   * Something hit it (D80, D81: his Zap, or another enemy's discharge or
   * bolt; the wizard gets the blame): if that leaves it hostile, it turns
   * to him and looks for him where he stands (a chaser searches there) and
   * a "!" pops up.
   * @param {{ pos: number[], dead: boolean }} player
   * @returns {boolean} whether it has just noticed him (a new "!"; not if it saw him already)
   */
  alarm(player) {
    if (!this.hostile || player.dead) return false;
    this.wake();
    this.lastSeen = [Math.floor(player.pos[0]), Math.floor(player.pos[2])];
    this.faceTowards(player.pos);
    this.behavior.alarm?.();
    if (this.sees) return false;
    this.alert = 0;
    return true;
  }

  /** Is the "!" over it: for a while after it popped up, and as long as it sees him. */
  get alerted() {
    return this.alive && this.alert !== null && (this.alert < ENEMY.alertTicks || this.sees);
  }

  /** Its eyes: where it looks from and its attacks leave from. */
  middle() {
    const [x, y, z] = this.pos;
    return [x + 0.5, y + this.eyeHeight, z + 0.5];
  }

  /** Height of its eyes above its feet: as far up its body as a small one's (ENEMY.eyeHeight). */
  get eyeHeight() {
    return (ENEMY.eyeHeight * this.size[1]) / ENEMY.size[1];
  }

  /**
   * Look for the wizard, or his decoy (D129): does it see one (hostile,
   * within its aggro range, nothing solid in between), and is it within its attack range? Then
   * its behavior follows what it sees. Once a tick, before update(); a
   * dead enemy sees nothing and thinks nothing.
   * @param {import('../game.js').Game} game grid, player and sightBlockers
   * @returns {boolean} whether it has just noticed him (a new "!")
   */
  sense({ grid, player, decoy, sightBlockers }) {
    if (!this.alive) return false;
    if (this.alert !== null) this.alert++;
    const saw = this.sees;
    this.sees = false;
    this.inRange = false;
    this.focus = null;
    if (this.frozen) return false;
    if (this.hostile && this.data.aggroRange > 0) {
      const eyes = this.middle();
      // The nearest of the wizard and his decoy it sees; the decoy wins a tie (D129).
      let nearest = Infinity;
      for (const body of [decoy?.active ? decoy : null, player.dead ? null : player]) {
        if (!body) continue;
        const box = body.box();
        const distance = reach(eyes, box);
        if (distance >= nearest || distance > this.data.aggroRange || !lineOfSight(eyes, boxCenter(box), grid, sightBlockers)) continue;
        nearest = distance;
        this.focus = body;
        this.sees = true;
        this.lastSeen = [Math.floor(body.pos[0]), Math.floor(body.pos[2])];
        this.inRange = this.charged && distance <= this.data.attackRange;
      }
    }
    this.behavior.update?.(this);
    if (this.sees) this.wake();
    if (!this.sees || saw) return false;
    this.alert = 0;
    return true;
  }

  /** What it looks at and attacks: what it sees (the wizard or his decoy), else the wizard. */
  aimAt({ player }) {
    return this.focus ?? player;
  }

  /** Turn to face the point `[x, , z]`. */
  faceTowards([x, , z]) {
    const [mx, , mz] = this.middle();
    if (x !== mx || z !== mz) this.facing = Math.atan2(x - mx, z - mz);
  }

  /** Will it attack as soon as it stands still: he is in range and it is ready? */
  get readyToAttack() {
    return this.inRange && this.cooldown === 0 && this.attackTick === null && this.warp === null;
  }

  /**
   * The charged attack, once a tick after update(): start charging when
   * it sees him within range, stands still and is ready ('charge'), fire
   * when charged ('discharge', resolved by discharge() in combat.js), then cool
   * down. Falling or dying cuts it off.
   * @param {import('../game.js').Game} game
   * @returns {'charge'|'discharge'|null}
   */
  updateAttack(game) {
    if (!this.charged || this.frozen) return null;
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
    this.faceTowards(this.aimAt(game).pos);
    return 'charge';
  }

  /** The attack is over (or cut off): cool down. */
  endAttack() {
    this.attackTick = null;
    this.aim = null;
    this.cooldown = this.cooldownTicks;
  }

  /** Has a hit taken some of its integrity? */
  get damaged() {
    return this.integrity < this.data.integrity;
  }

  /**
   * A spell, a discharge or a bolt hits it: it is provoked and loses
   * `damage` integrity; losing the last pops it. A boss in plate armor
   * off a plate shrugs it off ('armor', D135).
   * @param {number} damage
   * @param {'zap'|'discharge'|'bolt'|'firewall'|'blink'} cause
   * @returns {'hit'|'pop'|'armor'|null} event (null if it was dead already)
   */
  hit(damage, cause) {
    if (!this.alive) return null;
    this.provoke();
    if (!this.exposed) {
      this.hitTicks = 0;
      return 'armor';
    }
    this.integrity = Math.max(0, this.integrity - damage);
    this.hitTicks = 0;
    return this.integrity === 0 ? this.die(cause) : 'hit';
  }

  /** Keep this tick's start for render interpolation (copied in place). */
  savePrevious() {
    for (let i = 0; i < 3; i++) this.prev[i] = this.pos[i];
  }

  /**
   * Collision box [[minX, maxX], [minY, maxY], [minZ, maxZ]]. A frozen enemy
   * is a whole cell (D155), at least a block high: a block to stand on, climb
   * from and push, as a crate is.
   */
  box() {
    return this.frozen ? enemyBox(this.pos, [1, Math.max(1, this.size[1]), 1]) : enemyBox(this.pos, this.size);
  }

  /**
   * One fixed tick.
   * @param {import('../game.js').Game} game grid and `obstacles` (solid objects and live enemies)
   * @returns {'pop'|'land'|'thaw'|'teleport'|null} event
   */
  update(game) {
    this.savePrevious();
    if (this.state === 'dead') {
      this.timer++;
      return null;
    }
    if (this.warp) return this.teleport(game);
    if (this.bounced !== null) this.bounced++;
    if (this.hitTicks !== null) this.hitTicks++;
    if (this.frozen && ++this.frozen.tick >= this.frozen.ticks) {
      this.frozen = null;
      this.passable = false;
      return 'thaw';
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
    if (this.frozen || this.attackTick !== null || this.readyToAttack) return null;
    if (this.teleportDue(game)) return null;
    if (this.wait > 0) {
      this.wait--;
      return null;
    }
    if (!this.pos.every(Number.isInteger)) return null; // riding a platform between stops
    if (this.solid && this.loaded(game)) return null; // a crate on top holds it down
    const [x, y, z] = this.pos;
    const found = this.behavior.next(x, z, this, (column) => this.route(column, game));
    if (!found) {
      // Holding its ground or searching: it keeps its eyes on him.
      if (this.sees) this.faceTowards(this.aimAt(game).pos);
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

  /**
   * A boss whose phase teleports (D135), awake and at rest on a whole
   * cell: once its clock runs out it starts a teleport to a cell picked by
   * teleportCell() (or, with none, tries again a little later).
   * @returns {boolean} whether a teleport started
   */
  teleportDue(game) {
    if (!this.awake || this.teleportTicks === 0 || !this.pos.every(Number.isInteger)) return false;
    if (--this.teleportClock > 0) return false;
    const to = this.teleportCell(game);
    if (!to) {
      this.teleportClock = BOSS.teleportRetry;
      return false;
    }
    this.warp = { tick: 0, to, from: null };
    return true;
  }

  /**
   * Where a boss teleports to (D135): a whole cell of the floor it stands
   * on (its height), free and safe, nobody walking into it, at least
   * BOSS.teleportClear from the wizard and his decoy. Of those, one from
   * which it sees the wizard if there is any (so he must find new cover),
   * picked by its own dice.
   * @param {import('../game.js').Game} game
   * @returns {number[]|null} the cell [x, y, z]
   */
  teleportCell(game) {
    const { grid, player, decoy, sightBlockers } = game;
    const [cx, y, cz] = this.pos;
    const [w, , d] = grid.size;
    const away = [player.dead ? null : player, decoy?.active ? decoy : null].filter(Boolean).map((body) => body.box());
    const free = [];
    const seeing = [];
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        if (x === cx && z === cz) continue;
        const cell = [x, y, z];
        if (this.landing(cell, game) !== y || this.claimed(cell, game)) continue;
        const eyes = [x + 0.5, y + this.eyeHeight, z + 0.5];
        if (away.some((box) => reach(eyes, box) < BOSS.teleportClear)) continue;
        free.push(cell);
        if (!player.dead && lineOfSight(eyes, boxCenter(player.box()), grid, sightBlockers)) seeing.push(cell);
      }
    }
    const cells = seeing.length > 0 ? seeing : free;
    return cells.length > 0 ? cells[Math.floor(this.random() * cells.length)] : null;
  }

  /**
   * A teleport under way: it flickers out, and half way through it jumps
   * to its cell ('teleport', with `warp.from` where it was; no
   * interpolated slide across the room), facing the wizard, then flickers
   * in, its clock wound up again.
   */
  teleport(game) {
    const { warp } = this;
    warp.tick++;
    if (warp.tick === BOSS.teleportTicks / 2) {
      warp.from = [...this.pos];
      for (let i = 0; i < 3; i++) this.pos[i] = this.prev[i] = warp.to[i];
      if (!game.player.dead) this.faceTowards(this.aimAt(game).pos);
      return 'teleport';
    }
    if (warp.tick >= BOSS.teleportTicks) {
      this.warp = null;
      this.teleportClock = this.teleportTicks;
    }
    return null;
  }

  /**
   * Walking into the next cell; something in the way turns it back to the
   * cell it left. If the ground goes from under it (a block collapses, a
   * crate breaks), it drops as it walks on.
   */
  walk(game) {
    const { from, target, next } = this;
    const support = this.support(game);
    if (this.vy !== 0 || support < this.pos[1] - REST_EPS) {
      if (this.drop(support) && support < 0) return this.die('hole');
      from[1] = target[1] = this.pos[1];
      if (this.pulled) this.pulled[1] = this.pos[1];
    }
    if (this.frozen && !this.pulled) return null; // stopped mid-step; it walks on once it thaws
    // Distance from the cell it left, counted on its own so that whole
    // cells are exact (adding up small float steps drifts).
    const walked = Math.min(this.walked + this.stepSpeed * DT, 1);
    const arrived = walked >= 1 - SNAP;
    for (let i = 0; i < 3; i++) next[i] = arrived ? target[i] : from[i] + (target[i] - from[i]) * walked;
    // Something in the way, or (solid) the wizard pinned: turn back instead of crushing him.
    if (this.blockedAt(next, game) || (this.solid && !this.carryPlayer(next, game))) {
      // Pulled: back to the whole cell it was pulled from (or wait there on the way).
      if (!this.pulled) this.turnAround();
      else if (!target.every((v, i) => v === this.pulled[i])) this.pullTo([...this.pulled]);
      return null;
    }
    for (let i = 0; i < 3; i++) this.pos[i] = next[i];
    this.walked = walked;
    if (arrived) {
      this.state = 'rest';
      this.from = this.target = null;
      this.pulled = null;
      // Off a ledge or onto a hole: fall right away.
      if (!this.startFalling(game) && this.onLethal(game.grid)) return this.die('void');
    }
    return null;
  }

  /**
   * Mid-step, head back to the cell it left, and wait there before the
   * next step, so two enemies meeting in the middle don't bump back and
   * forth for ever.
   */
  turnAround() {
    [this.from, this.target] = [this.target, this.from];
    this.walked = 1 - this.walked;
    this.facing = Math.atan2(this.target[0] - this.from[0], this.target[2] - this.from[2]);
    this.behavior.turnBack();
    this.wait = ENEMY.turnTicks;
  }

  /** Start falling if nothing holds it up (keeping its fall speed off a step). @returns {boolean} whether it did */
  startFalling(game) {
    if (this.support(game) >= this.pos[1] - REST_EPS) return false;
    this.state = 'fall';
    return true;
  }

  /** Falling whole cells straight down; a hole or a void block below is its end. */
  fall(game) {
    const support = this.support(game);
    if (!this.drop(support)) return null;
    if (support < 0) return this.die('hole');
    this.state = 'rest';
    if (this.onLethal(game.grid)) return this.die('void');
    return 'land';
  }

  /**
   * One tick of gravity, down to the surface at `support` at most.
   * @param {number} support
   * @returns {boolean} whether it landed there
   */
  drop(support) {
    this.vy = Math.max(this.vy - ENEMY.gravity * DT, -ENEMY.maxFall);
    const y = this.pos[1] + this.vy * DT;
    if (y > support) {
      this.pos[1] = y;
      return false;
    }
    this.pos[1] = support;
    this.vy = 0;
    return true;
  }

  /** @param {'hole'|'void'|'zap'|'discharge'|'bolt'|'firewall'|'blink'} cause */
  die(cause) {
    this.state = 'dead';
    this.frozen = null;
    this.pulled = null;
    this.warp = null;
    this.deathCause = cause;
    this.timer = 0;
    this.sees = false;
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

  /**
   * Can it step into the cell `target` now: inside the room, clear of
   * blocks and bodies, no other enemy walking into it (D80), and safe
   * there (see landing())?
   */
  canStep(target, game) {
    return !this.claimed(target, game) && this.landing(target, game) !== null;
  }

  /** Is another enemy walking into the cell `target`? */
  claimed([x, y, z], { liveEnemies }) {
    return liveEnemies.some((other) => other !== this && other.state === 'walk' && other.target[0] === x && other.target[1] === y && other.target[2] === z);
  }

  /**
   * Where it would stand after stepping into the cell `target`: its height
   * there (lower, off a ledge), or null if it can't go there (outside the
   * room, a block or one of `bodies` in the way) or wouldn't be safe (a
   * hole, or a lethal block to land on).
   * @param {number[]} target cell [x, y, z]
   * @param {import('../game.js').Game} game
   * @param {object[]} [bodies] what can be in the way; `game.obstacles` by default
   * @returns {number|null}
   */
  landing(target, game, bodies = game.obstacles) {
    const [x, , z] = target;
    if (!game.grid.isInside(x, z) || this.blockedAt(target, game, bodies)) return null;
    const ground = this.supportAt(target, game, bodies);
    if (ground < 0) return null;
    // On a block top (whole heights); objects and platforms are never lethal.
    if (Number.isInteger(ground) && game.grid.typeAt(x, ground - 1, z)?.lethal) return null;
    return ground;
  }

  /**
   * The first step [dx, dz] of a shortest walk from its cell to the column
   * `[tx, tz]` (at whatever height it ends up), round blocks, holes, lethal
   * blocks, objects and enemies standing still (walking ones will have
   * moved on), down ledges but never up a step (D80). Null when it is
   * there or can't get there. A breadth-first search over the room's
   * cells, only asked for from a whole cell when a behavior wants it.
   * @param {number[]} column [x, z]
   * @param {import('../game.js').Game} game
   * @returns {number[]|null}
   */
  route([tx, tz], game) {
    const [x, y, z] = this.pos;
    if (x === tx && z === tz) return null;
    const bodies = game.obstacles.filter((body) => !(body instanceof Enemy && body.state === 'walk'));
    // Steps towards the target first, so of equally short walks it takes the straightest.
    const toward = (dx, dz) => Math.abs(tx - x - dx) + Math.abs(tz - z - dz);
    const steps = [...STEPS].sort((a, b) => toward(...a) - toward(...b));
    /** First step of the walk to each cell reached, by "x,y,z". */
    const first = new Map([[`${x},${y},${z}`, null]]);
    const queue = [[x, y, z]];
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
      for (const [dx, dz] of steps) {
        const next = [cell[0] + dx, cell[1], cell[2] + dz];
        const ground = this.landing(next, game, bodies);
        if (ground === null) continue;
        next[1] = ground;
        const key = next.join();
        if (first.has(key)) continue;
        const step = first.get(cell.join()) ?? [dx, dz];
        if (next[0] === tx && next[2] === tz) return step;
        first.set(key, step);
        queue.push(next);
      }
    }
    return null;
  }

  /** Would its box at `pos` run into a block, a solid object or another enemy (of `bodies`)? */
  blockedAt(pos, { grid, obstacles }, bodies = obstacles) {
    const box = enemyBox(pos, this.size);
    if (overlapsSolid(box, grid)) return true;
    for (const body of bodies) {
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

  /** Height it would stand at in the cell with its lower corner at `pos`, on blocks and `bodies` (see support()). */
  supportAt(pos, { grid, obstacles, player }, bodies = obstacles) {
    const box = enemyBox(pos, this.size);
    let top = surfaceBelow(box, grid, bodies, this);
    if (this.solid && !this.passable && !player.dead) top = Math.max(top, surfaceBelow(box, grid, [player], this));
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
