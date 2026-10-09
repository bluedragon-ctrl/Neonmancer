/**
 * Game state and the fixed-order update of one tick. Pure logic: views read
 * the state, they never change it.
 */
import { DT } from './core/loop.js';
import { announce, say, showText } from './core/messages.js';
import { bounceOffEnemies, burnEnemies, touchEnemies, updateArmor, updateAttacks, updateBolts, updateFrozen } from './combat.js';
import { LORE_REACH, loreLines } from './data/lore.js';
import { isBackSide, sideAxes, withExitDefaults } from './data/room-data.js';
import { BOOST_EFFECTS, boostTicks } from './entities/boost.js';
import { Enemy } from './entities/enemy.js';
import { createObject } from './entities/kinds.js';
import { BUFF_COLORS, FRAGMENT_COLOR, Pickup, SECRET_COLOR } from './entities/pickup.js';
import { PLAYER, Player } from './entities/player.js';
import { PUSHABLE } from './entities/pushable.js';
import { hiddenThings, updateScan } from './entities/scan.js';
import { SWITCH_KINDS } from './entities/switch.js';
import { groundBelow, moveAxis, overlapsBox, restsOn, surfaceBelow, touchedCell, touchesBox } from './physics/collision.js';
import { castSpell } from './spells.js';
import { createLocks, updateSwitches } from './switches.js';
import { arrival, exitAt } from './world/exits.js';
import { Grid } from './world/grid.js';
import { nearestShrine } from './world/map.js';
import { RunMap, roomsAround } from './world/run-map.js';
import { Progress, SAVE_BLOCKS, pickupBit, saveBit } from './world/progress.js';
import { buildRoom } from './world/room.js';
import { completion, placedBits, scoreOf } from './world/score.js';

/** Terminal message for each way to die (Player.deathCause). */
/** Tuning of the shove off a spiked crate's top (D198): the gap left beyond its edge, the hop's launch speed. */
const KNOCK_OFF = { gap: 0.02, hop: 4 };

const DEATH_MESSAGES = { hole: 'msg.die', void: 'msg.void', damage: 'msg.derez', timeout: 'msg.timeout' };

/** Banner color of a system crash (D97): alarm red. */
const CRASH_COLOR = '#ff3b5c';

/** Room transition timing in ticks (60 per second). */
export const TRANSITION = {
  /** Fade to black while the wizard walks on through the exit; the world is frozen. */
  outTicks: 12,
  /** Fade in from black in the new room; the game already runs. */
  inTicks: 15,
};

/** A room's watchdog timer (D172): its last seconds tick, once a second. */
export const WATCHDOG = { warnTicks: 5 * 60 };

/**
 * Something that happened, for views, the HUD and (later) sound. Returned
 * by Game.update() for the tick it happened in.
 * @typedef {object} GameEvent
 * @property {'jump'|'land'|'die'|'respawn'|'push'|'plug'|'shake'|'collapse'|'regrow'|'pop'|'bounce'|'hurt'|'cast'|'deny'|'spell'|'zap'|'hit'|'break'|'switch'|'tick'|'gate'|'unlock'|'lock'|'exit'|'room'|'alert'|'charge'|'discharge'|'ricochet'|'block'|'freeze'|'thaw'|'warp'|'fizzle'|'cut'|'paste'|'pull'|'compile'|'fork'|'expire'|'scan'|'reveal'|'airjump'|'reflect'|'shrine'|'crash'|'access'|'win'|'read'|'armor'|'exposed'|'armored'|'phase'|'teleport'|'drop'|'pickup'} type
 * @property {string} [spell] the spell cast, failed, fizzled (nowhere to
 *   go, energy kept) or selected (cast, deny, fizzle, spell); the teleport (warp)
 * @property {number[]} [from] where a Blink or Warp started (warp)
 * @property {number[]} [to] where it ended (warp)
 * @property {number[]} [cell] the cell a crate or enemy was cut from or
 *   pasted into, pulled from or compiled into (cut, paste, pull, compile; the enemy's own cell, rounded down, for a
 *   frozen one stopped mid-step); the fake block a scan revealed (reveal, D128)
 * @property {object} [decoy] the decoy a Fork cast stands (fork, D129)
 * @property {object} [object] the room object it happened to (push, plug,
 *   land of an object; shake, collapse and regrow of a collapsing block;
 *   hit by a spell, break of a destructible one; a switch going on or off,
 *   a timed one counting down (tick, D140); a gate opening or closing (gate, D140);
 *   a crate cut, pasted, pulled or compiled, a compiled one derezzing: expire (D125);
 *   a spiked platform that hurt the wizard: hurt)
 * @property {object} [enemy] the enemy it happened to (pop, land of an
 *   enemy, bounce off it, hit by a spell, a discharge or a bolt; it noticed
 *   the wizard or something hit it: alert; its charged attack: charge,
 *   discharge (a burst, an arc or bolts fired); cut, pasted or pulled) or that
 *   hurt the wizard (hurt)
 * @property {Bolt} [bolt] the bolt that stopped (zap: the wizard's or an
 *   enemy's), where it is now, that bounced (ricochet) or that his Shield+
 *   sent back (reflect, D95)
 * @property {number[]} [pos] where a bolt bounced (ricochet)
 * @property {number[]} [dir] the way it came in (ricochet)
 * @property {number} [amount] integrity lost (hurt)
 * @property {number[]} [cell] the block that hurt him (hurt), [x, y, z]
 * @property {'hole'|'void'|'damage'|'timeout'} [cause] how the wizard died (die)
 * @property {boolean} [crash] he died with no backups left (die): he
 *   reboots on the nearest backup shrine (D97)
 * @property {object} [exit] the exit walked out through (exit); a locked
 *   exit opening (unlock) or closing again (lock); a hidden exit a scan
 *   revealed (reveal, D128)
 * @property {number} [level] his new access level (access, D101)
 * @property {boolean} [open] the gate opened, not closed (gate, D140)
 */

export class Game {
  /**
   * @param {object} content loaded game data (see data/load.js)
   * @param {object} [options]
   * @param {string} [options.start] room to start in; world.json's start by default
   * @param {Progress} [options.progress] what he has found (a loaded save); nothing by default
   * @param {number} [options.backups] backups left (a loaded save, D106); full by default
   */
  constructor(content, options) {
    this.content = content;
    /** Save bits of the permanent pickups placed in the world: what 100% means (D100). */
    this.placedBits = placedBits(content.pickupTypes, content.spells, content.rooms.values());
    /** Debug mode: holes and lethal blocks never kill and hurt() does nothing. */
    this.invincible = false;
    /** 'grid' (default, D23) or 'screen' (D38); toggled with G, not saved. */
    this.movementMode = 'grid';
    this.reset(options);
  }

  /**
   * Start the game over: a new wizard with what `progress` holds, in the
   * room `start`, reset. Quitting to the title does this (a new game), and
   * so does loading a save (world/save-game.js). Views keep this Game, so
   * it changes in place.
   * @param {object} [options] as for the constructor
   * @param {string} [options.start]
   * @param {Progress} [options.progress]
   * @param {number} [options.backups]
   */
  reset({ start = this.content.world.start, progress = new Progress(), backups = PLAYER.backups } = {}) {
    /** Permanent pickups found, for the whole game (D71): room resets and death leave it alone. */
    this.progress = progress;
    // enterRoom() builds a different room even when it has the same id.
    this.room = null;
    /** @type {GameEvent[]} events of the tick in progress (see emit()) */
    this.events = [];
    /** The wizard, for the whole game; each room places him (enterRoom()). */
    this.player = new Player([0, 0, 0]);
    /** Things pasted so far, for their ids. */
    this.pastes = 0;
    /** Crates compiled so far (D125), for their ids. */
    this.compiles = 0;
    /** Room of the backup shrine used last (D97), or null: it wins a tie for the nearest one. */
    this.lastShrine = null;
    /** The rooms of this run on his map (D112): never saved, so a load starts it empty. */
    this.map = new RunMap();
    /** He died with no backups left: when he recompiles, the system crashes (D97). */
    this.crashing = false;
    /** Key fragments (world.json, D101): how many reboot the Grid, and the access levels they earn. */
    this.fragmentRules = this.content.world.fragments ?? { required: SAVE_BLOCKS.fragments.size, access: [] };
    /** The core took every fragment it needs: the Grid rebooted (D101); he plays on. */
    this.won = false;
    this.learnSpells();
    this.applyUpgrades();
    // A loaded save starts him buffed and full, with its backups left (D106).
    this.applyBuffs();
    this.player.integrity = this.player.maxIntegrity;
    this.player.backups = Math.min(backups, PLAYER.backups);
    this.player.energy = this.player.maxEnergy;
    this.enterRoom(start, undefined, null);
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
      this.announceRoom(id);
      /** Ids of the screens whose text was shown on this visit (D118): not again, even after a respawn. */
      this.readTexts = new Set();
    }
    this.room = buildRoom(this.content.rooms.get(id), this.content);
    this.map.visit(id);
    this.grid = new Grid(this.room);
    /** The room's objects (pushables, platforms, gate blocks: switched and collapsing, D141), by kind (entities/kinds.js). */
    this.objects = this.room.objects.map(createObject);
    /** The objects in update order, lowest first; re-sorted in place every tick. */
    this.updateOrder = [...this.objects];
    /** The room's switches (entities/switch.js): targets and plates, all off; they power exits, gates and platforms (D140). */
    this.switches = this.objects.filter((object) => SWITCH_KINDS.includes(object.kind));
    /** Objects that hurt the wizard on touch: spiked platforms (D82). */
    this.spiked = this.objects.filter((object) => object.damage > 0);
    /** Screens with a text (D118); the ones read on this visit stay read. */
    this.screens = this.objects.filter((object) => object.kind === 'deco' && object.text);
    for (const screen of this.screens) screen.read = this.readTexts.has(screen.id);
    /** The central core, if it is in this room (D101). */
    this.core = this.objects.find((object) => object.kind === 'core') ?? null;
    /** Is he touching the core? Touching it again only counts after he stepped away (touchCore()). */
    this.onCore = false;
    /** The exit he came in through: it stays open for him while he is in the room (D75). */
    this.entryExit = entry;
    /** What a scan has yet to reveal (D128): fake block cells and hidden exits. */
    this.hidden = hiddenThings(this.room, entry);
    /** The wizard's Fork decoy (D129, entities/decoy.js), or null; a room starts without one. */
    this.decoy = null;
    /** How many things scans revealed since the room was built (the room view rebuilds after one). */
    this.reveals = 0;
    /** The room's pickups (entities/pickup.js): found permanent ones as ghosts, refills back again. */
    this.pickups = this.room.pickups.map((data) => {
      const bit = pickupBit(data, this.content.spells);
      return new Pickup(data, bit, bit !== null && this.progress.has(bit));
    });
    /**
     * The room's enemies (entities/enemy.js), dead ones included until the
     * room resets. A boss whose drop is found already stays away (D104).
     */
    this.enemies = this.room.enemies
      .filter((enemy) => !enemy.boss || this.pickups.find((pickup) => pickup.data.id === enemy.drop)?.state !== 'ghost')
      .map((enemy) => new Enemy(enemy));
    /** The room's boss (D135), while it is here (a beaten one too, until the room resets), or null. */
    this.boss = this.enemies.find((enemy) => enemy.boss) ?? null;
    // It holds its drop until it is beaten.
    if (this.boss) this.pickups.find((pickup) => pickup.data.id === this.boss.dropId)?.hold();
    /** Bolts in flight, the wizard's Zaps and enemies' shots (entities/bolt.js); a room starts without any. */
    this.bolts = [];
    /** Locked exits (D75), open while their switches are all on (D140); closed ones are solid (Grid.setOpening()). */
    this.locks = createLocks(this);
    this.player.enter(pos ?? this.room.spawn, this.room.reset);
    // Functional boosts end with the room (D152); cosmetic ones stay.
    this.player.boosts = {};
    /** Is he on the backup shrine? Stepping onto it uses it (touchShrine()). */
    this.onShrine = false;
    /**
     * Ticks left on the room's watchdog timer (D172), or null in a room
     * without one or with nothing left for it to guard (watchdogGuards()).
     * It starts again whenever the room is built (entering, respawning) and
     * runs once the room has faded in (tickWatchdog()).
     */
    this.timeLeft = this.room.timer && this.watchdogGuards() ? Math.round(this.room.timer / DT) : null;
    /** Has the watchdog stopped: he took what it guarded? The time left stays on show. */
    this.watchdogStopped = false;
    if (this.timeLeft !== null) say('msg.watchdog', { seconds: this.room.timer });
    this.refreshBodies();
  }

  /**
   * The room's banner: its name, its biome under it, in the biome's color.
   * @param {string} [id] the room; the one he is in by default
   */
  announceRoom(id = this.room.id) {
    const data = this.content.rooms.get(id);
    const biome = this.content.biomes[data.biome];
    announce('banner.room', { room: data.name }, { sub: 'banner.biome', subValues: { biome: biome.name }, color: biome.color });
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
    /** The objects that are there (what lies on a spiked crate covers it, D198). */
    this.objectBodies = objects;
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
    const patched = this.player.boosts.patch > 0;
    const lost = this.player.hurt(amount);
    // A patch took the hit (D152).
    if (patched && !(this.player.boosts.patch > 0)) {
      say('msg.patchUsed');
      this.emit('patch');
    }
    if (lost > 0) this.emit('hurt', { amount: lost, ...(cell && { cell }), ...(enemy && { enemy }), ...(object && { object }) });
    if (this.player.dead) this.died();
  }

  /**
   * The spiked crate (D198) whose bare top he stands on, or null: his feet
   * are on it and nothing lies on it.
   * @returns {import('./entities/pushable.js').Pushable|null}
   */
  spikedTopUnder() {
    const box = this.player.box();
    return this.objects.find((object) => object.topDamage > 0 && restsOn(box, object.box()) && object.topHurts(this.objectBodies)) ?? null;
  }

  /**
   * Shove him off the top of a spiked crate (D198), the shortest way that
   * leaves its footprint with room for him, with a small hop; nowhere to
   * go (walled in) and he stays, to be hurt again once the blinking ends.
   * @param {import('./entities/pushable.js').Pushable} crate
   */
  knockOff(crate) {
    const { player } = this;
    const box = crate.box();
    const options = [];
    for (const axis of [0, 2]) {
      const half = player.size[axis] / 2;
      options.push([axis, box[axis][0] - half - KNOCK_OFF.gap - player.pos[axis]], [axis, box[axis][1] + half + KNOCK_OFF.gap - player.pos[axis]]);
    }
    options.sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
    for (const [axis, delta] of options) {
      const moved = [...player.pos];
      if (moveAxis(moved, player.size, axis, delta, this.grid, this.solids, player) !== false) continue;
      player.pos[axis] = moved[axis];
      player.vy = KNOCK_OFF.hop;
      player.grounded = false;
      return;
    }
  }

  /**
   * A frozen enemy can't stand on a spiked top (D198): impaled on it, it
   * pops (active ones cross it unhurt).
   */
  impaleFrozen() {
    for (const enemy of this.liveEnemies) {
      if (enemy.frozen === null || enemy.pulled) continue;
      const box = enemy.box();
      if (!this.objects.some((object) => object.topDamage > 0 && restsOn(box, object.box()) && object.topHurts(this.objectBodies))) continue;
      this.emit(enemy.die('spikes'), { enemy });
      this.refreshBodies();
    }
  }

  /**
   * The wizard just died: report it, with a message naming the cause. It
   * uses one of his backups (D97); with none left, the system crashes when
   * he recompiles (crash()).
   */
  died() {
    const { player } = this;
    const cause = player.deathCause;
    say(DEATH_MESSAGES[cause]);
    // Any death takes the cosmetic boosts (D152).
    player.looks.clear();
    this.crashing = player.backups === 0;
    if (this.crashing) say('msg.noBackups');
    else player.backups--;
    this.emit('die', { cause, ...(this.crashing && { crash: true }) });
  }

  /**
   * The room's watchdog timer (D172) runs down while he is alive, the room
   * has faded in, he is not invincible (debug mode) and it has not stopped
   * (stopWatchdog()); menus, the map and
   * the editor hold the whole game, so they hold it too. At zero he dies
   * ('timeout'), and his respawn resets the room and the timer. Its last
   * seconds tick.
   */
  tickWatchdog() {
    if (!this.timeLeft || this.watchdogStopped || this.transition || this.player.dead || this.invincible) return;
    this.timeLeft--;
    if (this.timeLeft === 0) {
      this.player.die('timeout');
      this.died();
    } else if (this.timeLeft <= WATCHDOG.warnTicks && this.timeLeft % Math.round(1 / DT) === 0) this.emit('tick');
  }

  /**
   * Does the room's watchdog (D172) guard anything? It guards the room's
   * permanent pickups while any is left to find; a room without any (a
   * dash) it guards always. One whose pickups are all found arms no timer.
   */
  watchdogGuards() {
    const permanent = this.pickups.filter((pickup) => pickup.bit !== null);
    return permanent.length === 0 || permanent.some((pickup) => pickup.state === 'idle' || pickup.state === 'held');
  }

  /** He took a permanent pickup: if it was the last one the watchdog guarded, it stops (D172). */
  stopWatchdog() {
    if (!this.timeLeft || this.watchdogStopped || this.watchdogGuards()) return;
    this.watchdogStopped = true;
    say('msg.watchdogStopped');
  }

  /**
   * He recompiled with no backups left (D97): the system crashes and he
   * reboots on the backup shrine nearest to the room on the world map
   * (lastShrine wins a tie), which refills him. Everything found stays
   * found; the clipboard went with his death. With no shrine in the world,
   * he reboots at the start.
   */
  crash() {
    this.crashing = false;
    const { rooms, world } = this.content;
    const id = nearestShrine(rooms, world.positions ?? {}, this.room.id, this.lastShrine);
    const shrine = id && rooms.get(id).shrine;
    this.enterRoom(id ?? world.start, shrine ? [shrine[0] + 0.5, 0, shrine[1] + 0.5] : undefined, null);
    this.transition = { phase: 'in', tick: 0 };
    if (shrine) this.useShrine();
    else this.refill();
    say('msg.crash');
    announce('banner.crash', {}, { sub: 'banner.crashSub', subValues: { room: this.room.name }, color: CRASH_COLOR });
    this.emit('crash');
  }

  /** Fill his integrity, energy and backups (a backup shrine, a crash). */
  refill() {
    const { player } = this;
    player.integrity = player.maxIntegrity;
    player.energy = player.maxEnergy;
    player.backups = PLAYER.backups;
  }

  /**
   * Coming near a screen with a text (D118), alive, shows the text in his
   * terminal: in front of it, at its side or on top, within LORE_REACH.
   * Once per visit to the room; reported as 'read'.
   */
  readScreens() {
    const { player } = this;
    if (player.dead) return;
    const box = player.box();
    for (const screen of this.screens) {
      if (screen.read || !touchesBox(box, screen.box(), LORE_REACH)) continue;
      screen.read = true;
      this.readTexts.add(screen.id);
      const text = this.content.lore?.[screen.text];
      if (text) showText(loreLines(text));
      this.emit('read', { object: screen });
    }
  }

  /**
   * Stepping onto the room's backup shrine (D97) uses it: standing on its
   * floor tile, alive. Staying on it doesn't use it again.
   */
  touchShrine() {
    const { player, room } = this;
    const [x, y, z] = player.pos;
    const on = !!room.shrine && !player.dead && y < 0.01 && Math.floor(x) === room.shrine[0] && Math.floor(z) === room.shrine[1];
    if (on && !this.onShrine) {
      this.useShrine();
      say('msg.backupSaved');
    }
    this.onShrine = on;
  }

  /**
   * Touching the central core (D101), alive: it counts his fragments. When
   * they earn a higher access level it raises his (the room's access locks
   * follow at once, updateSwitches()); with every fragment it needs, the
   * Grid reboots (the end of the game, once). Otherwise it tells him how
   * many more he needs. Staying against it doesn't count again.
   */
  touchCore() {
    const { player, core } = this;
    const on = !!core && !player.dead && touchesBox(player.box(), core.box());
    if (on && !this.onCore) this.deliver();
    this.onCore = on;
  }

  /** The core takes his fragments: a higher access level, the reboot, or how many more it needs. */
  deliver() {
    const { progress, fragmentRules } = this;
    const found = progress.count('fragments');
    const earned = progress.earnedAccess(fragmentRules.access);
    const raised = earned > progress.accessLevel;
    if (raised) {
      progress.accessLevel = earned;
      say('msg.access', { level: earned });
      announce('banner.access', { level: earned }, { sub: 'banner.accessSub', color: FRAGMENT_COLOR });
      this.emit('access', { level: earned });
    }
    if (found >= fragmentRules.required && !this.won) {
      this.won = true;
      say('msg.reboot');
      this.emit('win');
    } else if (!raised) {
      const needed = fragmentRules.access.find((n) => n > found);
      if (needed !== undefined) say('msg.coreAccess', { found, needed, level: earned + 1 });
      else if (found < fragmentRules.required) say('msg.coreReboot', { found, needed: fragmentRules.required });
    }
  }

  /** The fragments found, by slot (D101): which modules of the boot key he has. */
  fragmentSlots() {
    const { start, size } = SAVE_BLOCKS.fragments;
    const slots = [];
    for (let slot = 0; slot < size; slot++) if (this.progress.has(start + slot)) slots.push(slot);
    return slots;
  }

  /**
   * Debug mode: find the next `count` fragments not found yet (by slot),
   * placed or not, to try access levels without walking the world.
   * @param {number} [count]
   */
  debugGrantFragments(count = 8) {
    for (let slot = 0, left = count; slot < SAVE_BLOCKS.fragments.size && left > 0; slot++) {
      if (this.progress.collect(saveBit('fragments', slot))) left--;
    }
    say('msg.debugFragments', { found: this.progress.count('fragments') });
  }

  /** Use the room's backup shrine: refill him, remember it for a tie (crash()), and map the area. */
  useShrine() {
    this.refill();
    this.lastShrine = this.room.id;
    // The shrine shows the rooms around it on his map (D112).
    this.map.reveal(roomsAround(this.content.world.positions ?? {}, this.room.id));
    this.onShrine = true;
    this.emit('shrine');
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
   * enemies (seeing, moving) → boss armor → bolts → enemy attacks →
   * bouncing off enemies → enemy contact → a beaten boss's drop → events.
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
      if (this.crashing) this.crash();
      else {
        say('msg.respawn', { backups: player.backups });
        this.enterRoom(this.room.id, this.room.reset);
      }
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
    this.tickWatchdog();

    // Touching a block or an object that deals damage hurts (then he is
    // invulnerable for a while). A spiked platform's sides and top hurt
    // like a hazard block's, riding it too (D82).
    const hazard = player.dead ? null : touchedCell(player.box(), this.grid, (type) => type.damage > 0);
    if (hazard) this.hurt(this.grid.typeAt(...hazard).damage, { cell: hazard });
    const spiked = player.dead ? null : this.spiked.find((object) => touchesBox(player.box(), object.box()));
    if (spiked) this.hurt(spiked.damage, { object: spiked });
    // A spiked crate's bare top (D198) hurts him and shoves him off, even while he blinks.
    const spikedTop = player.dead ? null : this.spikedTopUnder();
    if (spikedTop) {
      this.hurt(spikedTop.topDamage, { object: spikedTop });
      if (!player.dead) this.knockOff(spikedTop);
    }

    // Switch spells (Tab), then cast the selected one.
    for (const [action, step] of [['spellNext', 1], ['spellPrev', -1]]) {
      if (input.pressed(action) && player.selectSpell(step)) this.emit('spell', { spell: player.spell });
    }
    if (!player.dead && input.pressed('cast')) castSpell(this);
    updateScan(this);

    // (Not an object he has just cut away.)
    const intent = player.pushIntent;
    // A frozen enemy can be pushed too.
    if (intent && (this.objects.includes(intent.body) || this.liveEnemies.includes(intent.body)) && intent.body.push(intent.dir, this)) {
      this.emit('push', intent.body instanceof Enemy ? { enemy: intent.body } : { object: intent.body });
    }

    // Lower objects first, so a stack settles in one tick.
    this.updateOrder.sort((a, b) => a.pos[1] - b.pos[1]);
    for (const object of this.updateOrder) {
      const event = object.update(this);
      if (event) this.emit(event, { object });
      if (event === 'plug') say('msg.plug');
      // Objects above it see the change this same tick (a crate on a collapsed block falls).
      if (event === 'collapse' || event === 'regrow' || event === 'expire') this.refreshBodies();
    }
    this.dropExpired();
    this.decoy?.update(this);
    if (this.decoy?.finished) this.decoy = null;

    this.impaleFrozen();

    // Enemies after objects, so they step off platforms and crates where those are now.
    // Dead ones too: their pop runs on.
    for (const enemy of this.enemies) {
      if (enemy.sense(this)) this.emit('alert', { enemy });
      const event = enemy.update(this);
      if (event) this.emit(event, { enemy });
      if (event === 'pop' || event === 'thaw') this.refreshBodies();
    }
    updateArmor(this);
    // Bolts after enemies, so they hit enemies where those are now.
    updateBolts(this);
    updateFrozen(this);
    updateAttacks(this);
    const bounced = bounceOffEnemies(this);
    touchEnemies(this, bounced);
    burnEnemies(this);
    this.defeatBoss();
    this.takePickups();
    this.touchShrine();
    this.touchCore();
    this.readScreens();
    updateSwitches(this);
    return this.takeEvents();
  }

  /**
   * The boss is beaten (D104): it lets its drop fall ('drop'), and a
   * banner and a terminal line say so. Once, whatever popped it (a spell,
   * or the ground going from under it).
   */
  defeatBoss() {
    const { boss } = this;
    if (!boss || boss.alive) return;
    const pickup = this.pickups.find((one) => one.data.id === boss.dropId);
    if (pickup?.state !== 'held') return;
    pickup.release();
    const name = this.bossName(boss);
    announce('banner.bossDefeated', { boss: name }, { sub: 'banner.bossDefeatedSub', color: boss.data.color });
    say('msg.bossDefeated', { boss: name });
    this.emit('drop', { enemy: boss, pickup });
  }

  /**
   * A boss's name (strings.json "boss.<template>"), or its template id in
   * capitals.
   * @param {Enemy} boss
   */
  bossName(boss) {
    return this.content.strings[`boss.${boss.template}`] ?? boss.template.toUpperCase().replaceAll('_', ' ');
  }

  /**
   * Compiled crates (D125) that derezzed a while ago (their pixels have
   * flown) leave the room's objects, so casting often doesn't pile them up.
   */
  dropExpired() {
    const gone = (object) => object.temporary && object.state === 'broken' && object.timer >= PUSHABLE.expiredTicks;
    if (!this.objects.some(gone)) return;
    for (const list of [this.objects, this.updateOrder]) {
      for (let i = list.length - 1; i >= 0; i--) if (gone(list[i])) list.splice(i, 1);
    }
  }

  /**
   * The wizard takes the pickups he touches (D71), if they are any use: a
   * data disk installs its spell for good (with an install animation
   * on him, D73); a buff chip makes him stronger for good (D93), an
   * upgrade card improves a spell or his jump (D95); a refill restores integrity or
   * energy, and is left lying while that is full; an access pass raises his
   * access level (for testing). Reported as 'pickup'.
   */
  takePickups() {
    for (const pickup of this.pickups) pickup.update();
    const { player } = this;
    if (player.dead) return;
    const box = player.box();
    for (const pickup of this.pickups) {
      if (!pickup.takeable || !overlapsBox(box, pickup.box())) continue;
      if (!this.use(pickup.data, pickup.bit)) continue;
      pickup.take();
      this.emit('pickup', { pickup });
      if (pickup.bit !== null) this.stopWatchdog();
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
    // Every permanent pickup installs into the wizard the same way (D93):
    // saved, the install animation, a banner and a terminal line.
    if (bit !== null) {
      this.progress.collect(bit);
      const [x, y, z] = data.at;
      player.startInstall(data.type, [x + 0.5, y + 0.5, z + 0.5]);
      const { banner, message } = this.gain(data);
      announce(banner.key, banner.values, banner.options);
      say(message.key, message.values);
      return true;
    }
    // An access pass (for testing): his access level, as the core raises
    // it (D101); left lying while he has that level already.
    if (data.kind === 'access') {
      if (this.progress.accessLevel >= data.level) return false;
      this.progress.accessLevel = data.level;
      say('msg.accessPass', { level: data.level });
      announce('banner.access', { level: data.level }, { sub: 'banner.accessPassSub', color: FRAGMENT_COLOR });
      this.emit('access', { level: data.level });
      return true;
    }
    if (data.kind === 'boost') return this.useBoost(data);
    // A refill: integrity or energy, up to his maximum.
    const max = data.stat === 'integrity' ? player.maxIntegrity : player.maxEnergy;
    if (player[data.stat] >= max) return false;
    player[data.stat] = Math.min(max, player[data.stat] + data.amount);
    say(data.stat === 'integrity' ? 'msg.refillIntegrity' : 'msg.refillEnergy');
    return true;
  }

  /**
   * A boost (D152): a functional one runs for its seconds (taking it again
   * starts over) until the room resets; a cosmetic one stays until a crash
   * or a reload, and is left lying while he has it. Reported as 'boost'.
   * @param {object} data the pickup: effect and, for a functional one, seconds
   * @returns {boolean} whether he took it
   */
  useBoost({ effect, seconds }) {
    const { player } = this;
    const name = this.content.strings[`boost.${effect}`] ?? effect.toUpperCase();
    if (BOOST_EFFECTS[effect].functional) {
      player.boosts[effect] = boostTicks(seconds);
      say('msg.boostOn', { boost: name, seconds });
    } else {
      if (player.looks.has(effect)) return false;
      player.looks.add(effect);
      say('msg.boostLook', { boost: name });
    }
    this.emit('boost', { effect });
    return true;
  }

  /**
   * What a permanent pickup gives him, and how it is announced.
   * @param {object} data the pickup (buildRoom()): a data disk, a buff chip, an upgrade card, a secret or a fragment
   * @returns {{ banner: { key: string, values: object, options: object }, message: { key: string, values: object } }}
   */
  gain(data) {
    const { player } = this;
    if (data.kind === 'fragment') {
      const values = { found: this.progress.count('fragments'), total: this.fragmentRules.required };
      return {
        banner: { key: 'banner.fragment', values, options: { sub: 'banner.fragmentSub', color: FRAGMENT_COLOR } },
        message: { key: 'msg.fragmentFound', values },
      };
    }
    if (data.kind === 'secret') {
      const values = { found: this.progress.count('secrets'), total: this.secretsPlaced() };
      return {
        banner: { key: 'banner.secret', values, options: { sub: 'banner.secretSub', subValues: values, color: SECRET_COLOR } },
        message: { key: 'msg.secretFound', values },
      };
    }
    if (data.kind === 'buff') {
      this.applyBuffs();
      // Taking one fills what it raised (D93).
      if (data.stat === 'integrity') player.integrity = player.maxIntegrity;
      if (data.stat === 'energy') player.energy = player.maxEnergy;
      const stat = this.content.strings[`buff.${data.stat}`] ?? data.stat.toUpperCase();
      const values = { stat, amount: data.stat === 'recharge' ? '' : ` +${data.amount}` };
      return {
        banner: { key: 'banner.buff', values, options: { sub: 'banner.buffSub', color: BUFF_COLORS[data.stat] } },
        message: { key: 'msg.buffInstalled', values },
      };
    }
    if (data.kind === 'upgrade') {
      this.applyUpgrades();
      // A spell upgrade selects the spell it improves, if he knows it.
      if (data.spell && player.spells.includes(data.spell)) player.spell = data.spell;
      const values = { upgrade: this.content.strings[`upgrade.${data.upgrade}`] ?? data.upgrade.toUpperCase() };
      return {
        banner: { key: 'banner.upgrade', values, options: { sub: 'banner.upgradeSub', color: data.color } },
        message: { key: 'msg.upgradeInstalled', values },
      };
    }
    this.learnSpells(data.spell);
    const spell = this.content.strings[`spell.${data.spell}`] ?? data.spell.toUpperCase();
    return {
      banner: { key: 'banner.spell', values: { spell }, options: { sub: 'banner.spellSub', color: this.content.spells[data.spell].color } },
      message: { key: 'msg.spellInstalled', values: { spell } },
    };
  }

  /** The score (D100): what he has found, worked out from his save bits. */
  get score() {
    return scoreOf(this.progress, this.content.score);
  }

  /** How much of the world's permanent pickups he has found, in whole percent (D100). */
  get completion() {
    return completion(this.progress, this.placedBits);
  }

  /** How many secrets lie in the world (D100), each counted once however often it is placed. */
  secretsPlaced() {
    let n = 0;
    for (const type of Object.values(this.content.pickupTypes)) {
      if (type.kind === 'secret' && this.placedBits.has(pickupBit(type, this.content.spells))) n++;
    }
    return n;
  }

  /**
   * Make the wizard as strong as the buffs found say (D93): his maximum
   * integrity and energy, and how fast energy recharges. Current values
   * stay, within the new maxima.
   */
  applyBuffs() {
    const { player } = this;
    const buffs = this.progress.buffs(this.content.pickupTypes);
    player.maxIntegrity = PLAYER.maxIntegrity + buffs.integrity;
    player.maxEnergy = PLAYER.maxEnergy + buffs.energy;
    player.energyTicks = Math.max(1, PLAYER.energyTicks - buffs.recharge);
    player.integrity = Math.min(player.integrity, player.maxIntegrity);
    player.energy = Math.min(player.energy, player.maxEnergy);
  }

  /**
   * Give the wizard the upgrades found (D95): Zap+ and Shield+ change
   * how those spells work when cast (spells.js), the double jump gives him
   * a jump in mid-air.
   */
  applyUpgrades() {
    const { player } = this;
    player.upgrades = this.progress.upgrades(this.content.pickupTypes);
    player.airJumps = player.upgrades.has('double_jump') ? 1 : 0;
  }

  /**
   * The HUD name of a spell (a strings.json key): an upgrade found for it
   * replaces it in the Tab cycle (D88, D95), so ZAP shows as ZAP+.
   * @param {string} spell
   */
  spellNameKey(spell) {
    for (const [upgrade, type] of this.player.upgrades) if (type.spell === spell) return `upgrade.${upgrade}`;
    return `spell.${spell}`;
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
   * Color of the room behind an exit of the current room (its biome color),
   * for the exit's stream. An exit the room editor hasn't connected yet
   * shows the current room's color.
   * @param {object} exit exit of the current room
   */
  destinationColor(exit) {
    return this.destinationBiome(exit).color;
  }

  /**
   * The biome of the room an exit leads to: its color and look (D183 asks for `starExits`).
   * @param {object} exit exit of the current room
   */
  destinationBiome(exit) {
    const link = this.content.links.get(`${this.room.id}.${exit.id}`);
    const room = this.content.rooms.get(link?.room ?? this.room.id);
    return this.content.biomes[room.biome];
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
