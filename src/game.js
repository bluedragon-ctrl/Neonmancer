/**
 * Game state and the fixed-order update of one tick. Pure logic: views read
 * the state, they never change it.
 */
import { DT } from './core/loop.js';
import { boxCenter, castRay, cellsAlong, direction, lineOfSight, reach } from './ai/sight.js';
import { announce, say } from './core/messages.js';
import { exitCells, isBackSide, sideAxes, withExitDefaults } from './data/room-data.js';
import { Bolt, boltDirections } from './entities/bolt.js';
import { Enemy } from './entities/enemy.js';
import { createObject } from './entities/kinds.js';
import { Pickup } from './entities/pickup.js';
import { PLAYER, Player } from './entities/player.js';
import { SWITCH_KINDS } from './entities/switch.js';
import { cellBox, groundBelow, overlaps, overlapsBox, surfaceBelow, touchedCell, touchesBox } from './physics/collision.js';
import { arrival, exitAt } from './world/exits.js';
import { Grid } from './world/grid.js';
import { Progress, pickupBit } from './world/progress.js';
import { buildRoom } from './world/room.js';

/**
 * What each spell does once cast (Player.cast() spent the energy), by
 * spell id; `spell` is its tuning from defs.json.
 */
const SPELL_EFFECTS = {
  /** A bolt from his hands the way he aims (entities/bolt.js). */
  zap: (game, spell) => game.bolts.push(Bolt.cast(game.player.pos, game.player.aim(), spell)),
  /** A ring of electricity round him for a while that blocks ranged attacks (D73, D84). */
  shield: (game, spell) => game.player.raiseShield('shield', Math.round(spell.duration / DT)),
  /** A ring like the Shield that also blocks touch and burns enemies touching it (D84). */
  firewall: (game, spell) => game.player.raiseShield('firewall', Math.round(spell.duration / DT)),
  /** A bolt the way he aims that freezes the first enemy it hits (D85). */
  pause: (game, spell) => game.bolts.push(Bolt.cast(game.player.pos, game.player.aim(), { ...spell, freeze: Math.round(spell.duration / DT) })),
};

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
 * @property {'jump'|'land'|'die'|'respawn'|'push'|'plug'|'shake'|'collapse'|'regrow'|'pop'|'bounce'|'hurt'|'cast'|'deny'|'spell'|'zap'|'hit'|'break'|'switch'|'unlock'|'lock'|'exit'|'room'|'alert'|'charge'|'discharge'|'ricochet'|'block'|'freeze'|'thaw'} type
 * @property {string} [spell] the spell cast, failed or selected (cast, deny, spell)
 * @property {object} [object] the room object it happened to (push, plug,
 *   land of an object; shake, collapse and regrow of a collapsing block;
 *   hit by a spell, break of a destructible one; a switch going on or off;
 *   a spiked platform that hurt the wizard: hurt)
 * @property {object} [enemy] the enemy it happened to (pop, land of an
 *   enemy, bounce off it, hit by a spell, a discharge or a bolt; it noticed
 *   the wizard or something hit it: alert; its charged attack: charge,
 *   discharge (a burst, an arc or bolts fired)) or that hurt the wizard (hurt)
 * @property {Bolt} [bolt] the bolt that stopped (zap: the wizard's or an
 *   enemy's), where it is now, or that bounced (ricochet)
 * @property {number[]} [pos] where a bolt bounced (ricochet)
 * @property {number[]} [dir] the way it came in (ricochet)
 * @property {number} [amount] integrity lost (hurt)
 * @property {number[]} [cell] the block that hurt him (hurt), [x, y, z]
 * @property {'hole'|'void'|'damage'} [cause] how the wizard died (die)
 * @property {object} [exit] the exit walked out through (exit); a locked
 *   exit opening (unlock) or closing again (lock)
 */

export class Game {
  /**
   * @param {object} content loaded game data (see data/load.js)
   * @param {object} [options]
   * @param {string} [options.start] room to start in; world.json's start by default
   * @param {Progress} [options.progress] what he has found (a loaded save); nothing by default
   */
  constructor(content, { start = content.world.start, progress = new Progress() } = {}) {
    this.content = content;
    /** Permanent pickups found, for the whole game (D71): room resets and death leave it alone. */
    this.progress = progress;
    /** Debug mode: holes and lethal blocks never kill and hurt() does nothing. */
    this.invincible = false;
    /** 'grid' (default, D23) or 'screen' (D38); toggled with G, not saved. */
    this.movementMode = 'grid';
    /** @type {GameEvent[]} events of the tick in progress (see emit()) */
    this.events = [];
    /** The wizard, for the whole game; each room places him (enterRoom()). */
    this.player = new Player([0, 0, 0]);
    this.learnSpells();
    this.enterRoom(start);
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
   * @param {string|null} [entry] id of the exit he came in through, open for
   *   him even if locked (D75); kept on a respawn in the same room
   */
  enterRoom(id, pos, entry = id === this.room?.id ? this.entryExit : null) {
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
    /** The room's switches (entities/switch.js): targets and plates, all off. */
    this.switches = this.objects.filter((object) => SWITCH_KINDS.includes(object.kind));
    /** Objects that hurt the wizard on touch: spiked platforms (D82). */
    this.spiked = this.objects.filter((object) => object.damage > 0);
    /** The exit he came in through: it stays open for him while he is in the room (D75). */
    this.entryExit = entry;
    /** Locked exits (D75), open while every switch is on; closed ones are solid (Grid.setOpening()). */
    this.locks = this.room.exits.filter((exit) => exit.locked).map((exit) => ({ exit, open: false }));
    for (const lock of this.locks) this.setLock(lock, this.lockWanted(lock));
    /** The room's enemies (entities/enemy.js), dead ones included until the room resets. */
    this.enemies = this.room.enemies.map((enemy) => new Enemy(enemy));
    /** Bolts in flight, the wizard's Zaps and enemies' shots (entities/bolt.js); a room starts without any. */
    this.bolts = [];
    /** The room's pickups (entities/pickup.js): found permanent ones as ghosts, refills back again. */
    this.pickups = this.room.pickups.map((data) => {
      const bit = pickupBit(data, this.content.spells);
      return new Pickup(data, bit, bit !== null && this.progress.has(bit));
    });
    this.player.enter(pos ?? this.room.spawn, this.room.reset);
    this.refreshBodies();
  }

  /**
   * Work out what there is to collide with, after an object appeared or
   * vanished (a collapsing block, a popped enemy).
   */
  refreshBodies() {
    const objects = this.objects.filter((object) => object.solid !== false);
    /** The enemies still alive. */
    this.liveEnemies = this.enemies.filter((enemy) => enemy.alive);
    /** What the wizard collides with: objects (all but collapsed blocks) and solid enemies (frozen ones too, D85). */
    this.solids = [...objects, ...this.liveEnemies.filter((enemy) => enemy.solid && !enemy.passable)];
    /** What enemies collide with: the objects and the other live enemies (not the wizard). */
    this.obstacles = [...objects, ...this.liveEnemies];
    /** What blocks an enemy's line of sight and stops an arc (besides blocks): the objects. */
    this.sightBlockers = objects;
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

    this.enterRoom(link.room, arrival(exit, pos, to, target.size), to.id);
    const player = this.player;
    player.vy = vy;
    player.facing = player.prevFacing = player.targetFacing = facing;
  }

  /**
   * The wizard loses integrity, unless invincible (debug mode) or still
   * invulnerable from the last hit; losing the last point kills him. Every
   * damage source goes through here (D43): hazard blocks, enemies,
   * spiked and squeezing platforms and the debug test-damage key. Reported
   * as a 'hurt' (and 'die') event with this tick's events, or the next
   * tick's when called outside update().
   * @param {number} [amount]
   * @param {object} [source]
   * @param {number[]} [source.cell] the hazard block that hurt him, passed on with the event
   * @param {Enemy} [source.enemy] the enemy that hurt him, passed on with the event
   * @param {object} [source.object] the room object that hurt him (a spiked platform), passed on with the event
   */
  hurt(amount = 1, { cell, enemy, object } = {}) {
    if (this.invincible) return;
    const lost = this.player.hurt(amount);
    if (lost > 0) this.emit('hurt', { amount: lost, ...(cell && { cell }), ...(enemy && { enemy }), ...(object && { object }) });
    if (this.player.dead) this.died();
  }

  /** The wizard just died: report it, with a message naming the cause. */
  died() {
    const cause = this.player.deathCause;
    say(DEATH_MESSAGES[cause]);
    this.emit('die', { cause });
  }

  /**
   * The wizard casts his selected spell (the cast action), if he has the
   * energy ('cast'); without it the cast fails ('deny'). Nothing while he
   * cools down from the last cast.
   */
  castSpell() {
    const id = this.player.spell;
    if (!id) return;
    const spell = this.content.spells[id];
    const result = this.player.cast(spell.cost, Math.round(spell.cooldown / DT));
    if (result === 'cast') SPELL_EFFECTS[id](this, spell);
    if (result) this.emit(result, { spell: id });
  }

  /**
   * Bolts fly on. A bounce is reported ('ricochet', with where and the way
   * it came in, for sparks). One that stops is reported ('zap', for its
   * sparks) and gone. If it stopped at the wizard (an enemy's shot), he is
   * hurt, unless his ring absorbed it ('block', D84); at an enemy, that takes its damage (hitEnemy()),
   * or a Pause bolt freezes it (pauseEnemy()). A room object only minds
   * the wizard's Zap: a destructible one 'hit' or 'break', a target
   * 'switch' (others shrug it off).
   */
  updateBolts() {
    for (const bolt of this.bolts) {
      const stopped = bolt.update(this);
      for (const { pos, dir } of bolt.rebounds) this.emit('ricochet', { bolt, pos, dir });
      if (!stopped) continue;
      this.emit('zap', { bolt });
      const { target, owner } = bolt;
      if (target === this.player) {
        if (this.player.shield) this.block({ enemy: owner, bolt });
        else this.hurt(bolt.damage, { enemy: owner });
        continue;
      }
      if (target instanceof Enemy) {
        if (bolt.freeze) this.pauseEnemy(target, bolt.freeze);
        else this.hitEnemy(target, bolt.damage, owner ? 'bolt' : 'zap');
        continue;
      }
      if (owner || bolt.freeze) continue;
      const event = target?.hit?.(bolt.damage, 'zap');
      if (!event) continue;
      this.emit(event, { object: target });
      // Whatever stood on a broken crate falls from the next tick.
      if (event === 'break') this.refreshBodies();
    }
    if (this.bolts.some((bolt) => bolt.stopped)) this.bolts = this.bolts.filter((bolt) => !bolt.stopped);
  }

  /**
   * An enemy takes a hit, from the wizard's spell or another enemy's
   * discharge or bolt: 'hit' or, with its last integrity, 'pop' (then
   * refreshBodies()). Any hit that leaves it hostile alarms it (D80, D81):
   * the wizard gets the blame, so it turns to him ('alert').
   * @param {Enemy} enemy
   * @param {number} damage
   * @param {'zap'|'discharge'|'bolt'|'firewall'} cause
   */
  hitEnemy(enemy, damage, cause) {
    const event = enemy.hit(damage, cause);
    if (!event) return;
    this.emit(event, { enemy });
    if (event === 'pop') this.refreshBodies();
    else if (enemy.alarm(this.player)) this.emit('alert', { enemy });
  }

  /**
   * A Pause bolt hits an enemy (D85): it freezes ('freeze') and turns
   * solid, but not for the wizard while he is inside it (Enemy.passable,
   * updateFrozen()). One that can't be paused shrugs it off; that still
   * counts as a hit, so it is alarmed (D81) like any enemy left unfrozen.
   * @param {Enemy} enemy
   * @param {number} ticks
   */
  pauseEnemy(enemy, ticks) {
    const event = enemy.freeze(ticks);
    if (!event) {
      if (enemy.alarm(this.player)) this.emit('alert', { enemy });
      return;
    }
    enemy.passable = !this.player.dead && overlapsBox(this.player.box(), enemy.box());
    this.emit(event, { enemy });
    this.refreshBodies();
  }

  /**
   * A frozen enemy the wizard was inside turns solid for him once he has
   * stepped out of it (D85).
   */
  updateFrozen() {
    const box = this.player.box();
    for (const enemy of this.liveEnemies) {
      if (!enemy.passable || (!this.player.dead && overlapsBox(box, enemy.box()))) continue;
      enemy.passable = false;
      this.refreshBodies();
    }
  }

  /**
   * Enemies' charged attacks (D78, D80): one starting to charge ('charge')
   * takes aim (an arc), one charged fires (discharge()).
   */
  updateAttacks() {
    for (const enemy of this.enemies) {
      const event = enemy.updateAttack(this);
      if (!event) continue;
      if (event === 'charge') this.aimDischarge(enemy);
      this.emit(event, { enemy });
      if (event === 'discharge') this.discharge(enemy);
    }
  }

  /**
   * An arc takes aim as it starts charging: at the wizard's middle, as far
   * as its range or the first block or object in the way (the aim line).
   * @param {Enemy} enemy
   */
  aimDischarge(enemy) {
    if (enemy.data.attack !== 'arc') return;
    const from = enemy.middle();
    const dir = direction(from, boxCenter(this.player.box()));
    const { point } = castRay(from, dir, enemy.data.attackRange, this.grid, this.sightBlockers);
    enemy.aim = { dir, end: point };
  }

  /**
   * A charged attack fires (D78, D80, D81). Bolts fly off at the wizard's
   * middle as he is now, or four ways (boltDirections(); updateBolts()
   * resolves them). A burst hits every body within its range that it
   * could see: the wizard and other enemies. An arc flies along its aim
   * until a block or an object stops it (unharmed) or its range runs out,
   * and hits every body in the squares it passes through: the wizard and
   * other enemies.
   * @param {Enemy} enemy
   */
  discharge(enemy) {
    const { attack, attackRange } = enemy.data;
    const from = enemy.middle();
    if (attack === 'bolt') {
      for (const dir of boltDirections(enemy.data, from, boxCenter(this.player.box()), enemy.facing)) this.bolts.push(Bolt.shoot(enemy, dir));
      return;
    }
    let hits;
    if (attack === 'arc') {
      const { dir } = enemy.aim;
      const { point, distance } = castRay(from, dir, attackRange, this.grid, this.sightBlockers);
      enemy.boltEnd = point;
      const path = cellsAlong(from, dir, distance).map(cellBox);
      hits = (box) => path.some((cell) => overlapsBox(box, cell));
    } else {
      hits = (box) => reach(from, box) <= attackRange && lineOfSight(from, boxCenter(box), this.grid, this.sightBlockers);
    }
    const targets = [...(this.player.dead ? [] : [this.player]), ...this.liveEnemies.filter((other) => other !== enemy)];
    for (const body of targets) if (hits(body.box())) this.strike(body, enemy);
  }

  /**
   * A discharge from `enemy` hits the wizard (hurt; his Shield or Firewall
   * blocks it: 'block', D84) or another enemy (hitEnemy()).
   * @param {Player|Enemy} body
   * @param {Enemy} enemy
   */
  strike(body, enemy) {
    const { damage } = enemy.data;
    if (body === this.player) {
      if (this.player.shield) return this.block({ enemy });
      return this.hurt(damage, { enemy });
    }
    this.hitEnemy(body, damage, 'discharge');
  }

  /**
   * His Shield or Firewall blocked an attack (D84): it flares (its
   * `blockedAt` tick, for the view) and 'block' is reported.
   * @param {{ enemy: Enemy, bolt?: Bolt }} details the attacker, and the bolt it absorbed
   */
  block(details) {
    const { shield } = this.player;
    shield.blockedAt = shield.tick;
    this.emit('block', details);
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
   * One fixed tick: player → exits → his cast → his push → objects →
   * enemies (seeing, moving) → bolts → enemy attacks → bouncing off
   * enemies → enemy contact → events.
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

    // Touching a block or an object that deals damage hurts (then he is
    // invulnerable for a while). A spiked platform's sides and top hurt
    // like a hazard block's, riding it too (D82).
    const hazard = player.dead ? null : touchedCell(player.box(), this.grid, (type) => type.damage > 0);
    if (hazard) this.hurt(this.grid.typeAt(...hazard).damage, { cell: hazard });
    const spiked = player.dead ? null : this.spiked.find((object) => touchesBox(player.box(), object.box()));
    if (spiked) this.hurt(spiked.damage, { object: spiked });

    // Switch spells (Tab), then cast the selected one.
    for (const [action, step] of [['spellNext', 1], ['spellPrev', -1]]) {
      if (input.pressed(action) && player.selectSpell(step)) this.emit('spell', { spell: player.spell });
    }
    if (!player.dead && input.pressed('cast')) this.castSpell();

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
      if (enemy.sense(this)) this.emit('alert', { enemy });
      const event = enemy.update(this);
      if (event) this.emit(event, { enemy });
      if (event === 'pop' || event === 'thaw') this.refreshBodies();
    }
    // Bolts after enemies, so they hit enemies where those are now.
    this.updateBolts();
    this.updateFrozen();
    this.updateAttacks();
    const bounced = this.bounceOffEnemies();
    this.touchEnemies(bounced);
    this.burnEnemies();
    this.takePickups();
    this.updateSwitches();
    return this.takeEvents();
  }

  /**
   * Plates follow what stands on them (a crate, an enemy, the wizard);
   * targets were switched by bolts already. Then the locked exits follow
   * the switches: open while every one is on (reported as 'unlock', with a
   * terminal line), closed again ('lock') once one goes off, but never on
   * the wizard: while he stands in the opening it waits (D75).
   */
  updateSwitches() {
    if (this.switches.length === 0) return;
    const boxes = [
      ...this.objects.filter((object) => object.kind === 'pushable' && object.solid).map((object) => object.box()),
      ...this.liveEnemies.map((enemy) => enemy.box()),
      ...(this.player.dead ? [] : [this.player.box()]),
    ];
    for (const plate of this.switches) {
      if (plate.kind !== 'plate') continue;
      if (plate.press(plate.pressedBy(boxes))) this.emit('switch', { object: plate });
    }
    let unlocked = false;
    for (const lock of this.locks) {
      const open = this.lockWanted(lock);
      if (open === lock.open || (!open && this.inOpening(lock.exit))) continue;
      this.setLock(lock, open);
      this.emit(open ? 'unlock' : 'lock', { exit: lock.exit });
      unlocked ||= open;
    }
    if (unlocked) say('msg.unlocked');
  }

  /** Should a locked exit be open: every switch on, or the wizard came in through it? */
  lockWanted({ exit }) {
    return exit.id === this.entryExit || this.switches.every((object) => object.on);
  }

  /** Open or close a locked exit (its opening in the grid). */
  setLock(lock, open) {
    lock.open = open;
    this.grid.setOpening(lock.exit, open);
  }

  /** Is the wizard in the opening of `exit` (its row of cells beyond the side)? */
  inOpening(exit) {
    const box = this.player.box();
    return exitCells(exit, this.room.size).outside.some((cell) => overlapsBox(box, cellBox(cell)));
  }

  /**
   * Is the exit open? Every exit is, except a locked one while its switches
   * are not all on (D75).
   * @param {object} exit exit of the current room
   */
  exitOpen(exit) {
    return this.locks.find((lock) => lock.exit === exit)?.open ?? true;
  }

  /** How many of the room's switches are on (the lights on its locked exits). */
  switchesOn() {
    return this.switches.filter((object) => object.on).length;
  }

  /**
   * The wizard takes the pickups he touches (D71), if they are any use: a
   * data disk installs its spell for good (with an install animation
   * on him, D73); a refill restores integrity or
   * energy, and is left lying while that is full. Reported as 'pickup'.
   */
  takePickups() {
    for (const pickup of this.pickups) pickup.update();
    const { player } = this;
    if (player.dead) return;
    const box = player.box();
    for (const pickup of this.pickups) {
      if (pickup.state !== 'idle' || !overlapsBox(box, pickup.box())) continue;
      if (!this.use(pickup.data, pickup.bit)) continue;
      pickup.take();
      this.emit('pickup', { pickup });
    }
  }

  /**
   * What a pickup does.
   * @param {object} data the pickup (buildRoom()): kind, spell or stat and amount
   * @param {number|null} bit its save bit
   * @returns {boolean} whether he took it
   */
  use(data, bit) {
    const { player } = this;
    if (data.kind === 'disk') {
      this.progress.collect(bit);
      this.learnSpells(data.spell);
      const [x, y, z] = data.at;
      player.startInstall(data.spell, [x + 0.5, y + 0.5, z + 0.5]);
      const name = this.content.strings[`spell.${data.spell}`] ?? data.spell.toUpperCase();
      announce('banner.spell', { spell: name }, { sub: 'banner.spellSub', color: this.content.spells[data.spell].color });
      say('msg.spellInstalled', { spell: name });
      return true;
    }
    // A refill: integrity or energy, up to his maximum.
    const max = data.stat === 'integrity' ? player.maxIntegrity : player.maxEnergy;
    if (player[data.stat] >= max) return false;
    player[data.stat] = Math.min(max, player[data.stat] + data.amount);
    say(data.stat === 'integrity' ? 'msg.refillIntegrity' : 'msg.refillEnergy');
    return true;
  }

  /**
   * Give the wizard the spells of the data disks found (in slot order) and
   * select `select` (a spell just installed); he keeps his selection otherwise.
   * @param {string} [select]
   */
  learnSpells(select) {
    const { player } = this;
    player.spells = this.progress.knownSpells(this.content.spells);
    if (select) player.spell = select;
    else if (!player.spells.includes(player.spell)) player.spell = player.spells[0] ?? null;
  }

  /**
   * Falling onto the top of a bouncy enemy (not a frozen one, D85) bounces the wizard up (D48),
   * harmlessly: his feet were above its top last tick and are at or below
   * it now (on it, if it is solid), over its footprint.
   * @returns {Enemy|null} the enemy he bounced off
   */
  bounceOffEnemies() {
    const { player } = this;
    if (player.dead || player.pos[1] >= player.prev[1]) return null;
    const [px, , pz] = player.box();
    for (const enemy of this.liveEnemies) {
      if (!enemy.bouncy) continue;
      const [bx, by, bz] = enemy.box();
      const top = by[1];
      if (player.prev[1] >= top - BOUNCE_REACH && player.pos[1] <= top + 1e-6 && overlaps(px, bx) && overlaps(pz, bz)) {
        player.bounce(top);
        enemy.bounced = 0;
        this.emit('bounce', { enemy });
        return enemy;
      }
    }
    return null;
  }

  /**
   * Touching a hostile enemy with a touch attack hurts the wizard (D43):
   * overlapping it, or leaning on or standing on a solid one (the hazard
   * rule, D44). Not the enemy he just bounced off, and nothing while his
   * Firewall is up (D84).
   * @param {Enemy|null} bounced
   */
  touchEnemies(bounced) {
    const { player } = this;
    if (player.dead || player.shield?.spell === 'firewall') return;
    const box = player.box();
    for (const enemy of this.liveEnemies) {
      if (!enemy.hurtsOnContact || enemy === bounced) continue;
      if (touchesBox(box, enemy.box())) {
        this.hurt(enemy.data.damage, { enemy });
        return;
      }
    }
  }

  /**
   * Firewall burns every live enemy touching its ring (D84): a hit of its
   * damage ('firewall'), then again every burnInterval while it stays.
   */
  burnEnemies() {
    const { player } = this;
    const { shield } = player;
    if (player.dead || shield?.spell !== 'firewall') return;
    const { damage, burnInterval } = this.content.spells.firewall;
    const box = player.shieldBox();
    for (const [enemy, ticks] of shield.burns) {
      if (ticks > 1) shield.burns.set(enemy, ticks - 1);
      else shield.burns.delete(enemy);
    }
    for (const enemy of this.liveEnemies) {
      if (shield.burns.has(enemy) || !touchesBox(box, enemy.box())) continue;
      shield.burns.set(enemy, Math.round(burnInterval / DT));
      this.hitEnemy(enemy, damage, 'firewall');
    }
  }

  /**
   * Color of the room behind an exit of the current room (its biome color),
   * for the exit's stream. An exit the room editor hasn't connected yet
   * shows the current room's color.
   * @param {object} exit exit of the current room
   */
  destinationColor(exit) {
    const link = this.content.links.get(`${this.room.id}.${exit.id}`);
    const room = this.content.rooms.get(link?.room ?? this.room.id);
    return this.content.biomes[room.biome].color;
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
    for (const bolt of this.bolts) bolt.savePrevious();

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
