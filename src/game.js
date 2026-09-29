/**
 * Game state and the fixed-order update of one tick. Pure logic: views read
 * the state, they never change it.
 */
import { DT } from './core/loop.js';
import { announce, say } from './core/messages.js';
import { bounceOffEnemies, burnEnemies, touchEnemies, updateAttacks, updateBolts, updateFrozen } from './combat.js';
import { isBackSide, sideAxes, withExitDefaults } from './data/room-data.js';
import { Enemy } from './entities/enemy.js';
import { createObject } from './entities/kinds.js';
import { BUFF_COLORS, Pickup } from './entities/pickup.js';
import { PLAYER, Player } from './entities/player.js';
import { SWITCH_KINDS } from './entities/switch.js';
import { groundBelow, overlapsBox, surfaceBelow, touchedCell, touchesBox } from './physics/collision.js';
import { castSpell } from './spells.js';
import { createLocks, updateSwitches } from './switches.js';
import { arrival, exitAt } from './world/exits.js';
import { Grid } from './world/grid.js';
import { nearestShrine } from './world/map.js';
import { Progress, pickupBit } from './world/progress.js';
import { buildRoom } from './world/room.js';

/** Terminal message for each way to die (Player.deathCause). */
const DEATH_MESSAGES = { hole: 'msg.die', void: 'msg.void', damage: 'msg.derez' };

/** Banner color of a system crash (D96): alarm red. */
const CRASH_COLOR = '#ff3b5c';

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
 * @property {'jump'|'land'|'die'|'respawn'|'push'|'plug'|'shake'|'collapse'|'regrow'|'pop'|'bounce'|'hurt'|'cast'|'deny'|'spell'|'zap'|'hit'|'break'|'switch'|'unlock'|'lock'|'exit'|'room'|'alert'|'charge'|'discharge'|'ricochet'|'block'|'freeze'|'thaw'|'warp'|'fizzle'|'cut'|'paste'|'airjump'|'reflect'|'shrine'|'crash'} type
 * @property {string} [spell] the spell cast, failed, fizzled (nowhere to
 *   go, energy kept) or selected (cast, deny, fizzle, spell); the teleport (warp)
 * @property {number[]} [from] where a Blink or Warp started (warp)
 * @property {number[]} [to] where it ended (warp)
 * @property {number[]} [cell] the cell a crate or enemy was cut from or
 *   pasted into (cut, paste; the enemy's own cell, rounded down, for a
 *   frozen one stopped mid-step)
 * @property {object} [object] the room object it happened to (push, plug,
 *   land of an object; shake, collapse and regrow of a collapsing block;
 *   hit by a spell, break of a destructible one; a switch going on or off;
 *   a crate cut or pasted;
 *   a spiked platform that hurt the wizard: hurt)
 * @property {object} [enemy] the enemy it happened to (pop, land of an
 *   enemy, bounce off it, hit by a spell, a discharge or a bolt; it noticed
 *   the wizard or something hit it: alert; its charged attack: charge,
 *   discharge (a burst, an arc or bolts fired); cut or pasted) or that
 *   hurt the wizard (hurt)
 * @property {Bolt} [bolt] the bolt that stopped (zap: the wizard's or an
 *   enemy's), where it is now, that bounced (ricochet) or that his Shield+
 *   sent back (reflect, D95)
 * @property {number[]} [pos] where a bolt bounced (ricochet)
 * @property {number[]} [dir] the way it came in (ricochet)
 * @property {number} [amount] integrity lost (hurt)
 * @property {number[]} [cell] the block that hurt him (hurt), [x, y, z]
 * @property {'hole'|'void'|'damage'} [cause] how the wizard died (die)
 * @property {boolean} [crash] he died with no backups left (die): he
 *   reboots on the nearest backup shrine (D96)
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
    /** Things pasted so far, for their ids. */
    this.pastes = 0;
    /** Room of the backup shrine used last (D96), or null: it wins a tie for the nearest one. */
    this.lastShrine = null;
    /** He died with no backups left: when he recompiles, the system crashes (D96). */
    this.crashing = false;
    this.learnSpells();
    this.applyUpgrades();
    // A loaded save starts him buffed and full.
    this.applyBuffs();
    this.player.integrity = this.player.maxIntegrity;
    this.player.energy = this.player.maxEnergy;
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
    this.locks = createLocks(this);
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
    /** Is he on the backup shrine? Stepping onto it uses it (touchShrine()). */
    this.onShrine = false;
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

  /**
   * The wizard just died: report it, with a message naming the cause. It
   * uses one of his backups (D96); with none left, the system crashes when
   * he recompiles (crash()).
   */
  died() {
    const { player } = this;
    const cause = player.deathCause;
    say(DEATH_MESSAGES[cause]);
    this.crashing = player.backups === 0;
    if (this.crashing) say('msg.noBackups');
    else player.backups--;
    this.emit('die', { cause, ...(this.crashing && { crash: true }) });
  }

  /**
   * He recompiled with no backups left (D96): the system crashes and he
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
   * Stepping onto the room's backup shrine (D96) uses it: standing on its
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

  /** Use the room's backup shrine: refill him, and remember it for a tie (crash()). */
  useShrine() {
    this.refill();
    this.lastShrine = this.room.id;
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
    if (!player.dead && input.pressed('cast')) castSpell(this);

    // (Not an object he has just cut away.)
    const intent = player.pushIntent;
    if (intent && this.objects.includes(intent.body) && intent.body.push(intent.dir, this)) this.emit('push', { object: intent.body });

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
    updateBolts(this);
    updateFrozen(this);
    updateAttacks(this);
    const bounced = bounceOffEnemies(this);
    touchEnemies(this, bounced);
    burnEnemies(this);
    this.takePickups();
    this.touchShrine();
    updateSwitches(this);
    return this.takeEvents();
  }

  /**
   * The wizard takes the pickups he touches (D71), if they are any use: a
   * data disk installs its spell for good (with an install animation
   * on him, D73); a buff chip makes him stronger for good (D93), an
   * upgrade card improves a spell or his jump (D95); a refill restores integrity or
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
    // A refill: integrity or energy, up to his maximum.
    const max = data.stat === 'integrity' ? player.maxIntegrity : player.maxEnergy;
    if (player[data.stat] >= max) return false;
    player[data.stat] = Math.min(max, player[data.stat] + data.amount);
    say(data.stat === 'integrity' ? 'msg.refillIntegrity' : 'msg.refillEnergy');
    return true;
  }

  /**
   * What a permanent pickup gives him, and how it is announced.
   * @param {object} data the pickup (buildRoom()): a data disk, a buff chip or an upgrade card
   * @returns {{ banner: { key: string, values: object, options: object }, message: { key: string, values: object } }}
   */
  gain(data) {
    const { player } = this;
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
