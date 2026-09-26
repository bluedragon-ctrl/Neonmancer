/**
 * The wizard: movement along the grid axes, jump, gravity, pushing,
 * integrity (health), invulnerability after a hit, death (in a hole, on a
 * void block, or with no integrity left) and respawn. Pure logic, one call to
 * update() per fixed tick. One Player lasts the whole game: entering a room
 * places him (enter()), so integrity carries over.
 */
import { DT } from '../core/loop.js';
import { PLAYER_HITBOX } from '../core/rules.js';
import { bodyBox, moveAxis } from '../physics/collision.js';
import { CELL } from '../world/grid.js';

/** Tuning values (units, seconds, ticks). */
export const PLAYER = {
  /** Walking speed in units per second. */
  speed: 4.5,
  /**
   * Share of the walking speed kept in the air. A full jump lasts ~0.57 s, so
   * it covers ~1.65 units: over a 1-tile gap, never a 2-tile one (D34).
   */
  airSpeed: 0.65,
  gravity: 30,
  /**
   * Apex of every jump above the take-off height: clears 1 block, never 2
   * (D3). Jumps have a fixed height (no short hops), like the block rule.
   */
  jumpHeight: 1.2,
  /**
   * Apex of a bounce off a bouncy enemy above its top (D48): clears 2
   * blocks, so a bouncy enemy is a way up to a 2-high ledge.
   */
  bounceHeight: 2.2,
  /** Fastest fall in units per second (below 1 unit per tick, see collision.js). */
  maxFall: 18,
  /** A jump still works this many ticks after walking off a ledge. */
  coyoteTicks: 6,
  /** Ticks of walking into an object before it moves (a short, deliberate shove). */
  pushDelay: 8,
  /** A jump pressed this many ticks before landing still happens on landing. */
  jumpBufferTicks: 6,
  /** Share of the remaining turn done each tick. */
  turnRate: 0.35,
  /** Ticks between dying and respawning. */
  deathTicks: 68,
  /** Integrity (health) at the start and after respawning; at most 15 fits the save key. */
  maxIntegrity: 8,
  /** Ticks after a hit during which nothing hurts him (he blinks, D43). */
  invulnerableTicks: 60,
};

/** Take-off speed that reaches exactly jumpHeight: v = √(2gh). */
export const JUMP_SPEED = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight);

/** Speed a bounce launches him up with, reaching bounceHeight. */
export const BOUNCE_SPEED = Math.sqrt(2 * PLAYER.gravity * PLAYER.bounceHeight);

/**
 * Movement [dx, dz] per action along the grid axes, the default (D23):
 * Right = −z (screen up-right), Up = −x (screen up-left), Left = +z, Down = +x.
 */
const GRID_DIRECTIONS = Object.entries({ up: [-1, 0], down: [1, 0], left: [0, 1], right: [0, -1] });

/**
 * Movement [dx, dz] per action relative to the screen (D38): each key moves
 * the wizard that way on screen instead of along a single grid axis. Every
 * vector is the sum of the two grid axes that make up that screen direction
 * (e.g. screen "up" = grid Up + grid Right), so combining two keys collapses
 * to a single grid axis, as classic isometric controls do.
 */
const SCREEN_DIRECTIONS = Object.entries({ up: [-1, -1], down: [1, 1], left: [-1, 1], right: [1, -1] });

/** Feet this close to y = 0 count as standing on the floor. */
const FLOOR_EPS = 1e-4;

export class Player {
  /**
   * @param {number[]} pos feet center [x, y, z] to appear at right now
   * @param {number[]} [resetPoint] where he reappears after dying (D39);
   *   defaults to `pos`, so a Player made without a room (e.g. tests) just
   *   respawns where it started
   */
  constructor(pos, resetPoint = pos) {
    this.size = PLAYER_HITBOX;
    this.maxIntegrity = PLAYER.maxIntegrity;
    /** Integrity (health), 0..maxIntegrity; it carries over between rooms. */
    this.integrity = this.maxIntegrity;
    /** Ticks left in which he can't be hurt (after a hit); carries over between rooms. */
    this.invulnerable = 0;
    this.enter(pos, resetPoint);
  }

  /**
   * Arrive in a room at `pos`, alive and still.
   * @param {number[]} pos feet center
   * @param {number[]} resetPoint the room's death-respawn point (D39),
   *   independent of how he entered the room
   */
  enter(pos, resetPoint) {
    this.resetPoint = [...resetPoint];
    this.place(pos);
  }

  /** Put the wizard back at the room's reset point, alive, still and whole. */
  respawn() {
    this.integrity = this.maxIntegrity;
    this.invulnerable = 0;
    this.place(this.resetPoint);
  }

  /**
   * Lose integrity (at least 0 left), then stay invulnerable for a while.
   * Nothing happens while invulnerable or dead. Losing the last point kills
   * him (he derezzes). No knockback (D43).
   * @param {number} amount
   * @returns {number} how much was actually lost
   */
  hurt(amount) {
    if (this.dead || this.invulnerable > 0 || amount <= 0) return 0;
    const lost = Math.min(amount, this.integrity);
    this.integrity -= lost;
    this.invulnerable = PLAYER.invulnerableTicks;
    if (this.integrity === 0) this.die('damage');
    return lost;
  }

  /**
   * Die: all integrity gone; he respawns after PLAYER.deathTicks.
   * @param {'hole'|'void'|'damage'} cause a hole drops him into the pit;
   *   otherwise he derezzes where he is
   */
  die(cause) {
    this.integrity = 0;
    this.dead = true;
    /** Why he died, while dead: 'hole', 'void' or 'damage'. */
    this.deathCause = cause;
    this.deathTimer = PLAYER.deathTicks;
    this.grounded = false;
    this.vy = 0;
  }

  /**
   * Bounce off the top of a bouncy enemy at height `top`: launched up to
   * PLAYER.bounceHeight above it, whatever the jump key does.
   * @param {number} top
   */
  bounce(top) {
    this.pos[1] = top;
    this.vy = BOUNCE_SPEED;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
  }

  /** Appear at `pos`, alive, still and facing the camera. */
  place(pos) {
    this.pos = [...pos];
    /** Position at the previous tick, for render interpolation. */
    this.prev = [...this.pos];
    this.vy = 0;
    this.grounded = false;
    /** Facing angle around y; 0 looks along +z. Starts looking at the camera (+x +z). */
    this.facing = Math.PI / 4;
    this.prevFacing = this.facing;
    /** Angle the wizard turns towards. */
    this.targetFacing = this.facing;
    this.moving = false;
    this.dead = false;
    this.deathCause = null;
    this.deathTimer = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    /** Object being walked into, and for how many ticks. */
    this.pushTarget = null;
    this.pushTicks = 0;
    /** Set when a push is due this tick: { body, dir: [dx, dz] }; the game carries it out. */
    this.pushIntent = null;
  }

  /** Keep this tick's start for render interpolation (copied in place: no new array every tick). */
  savePrevious() {
    for (let i = 0; i < 3; i++) this.prev[i] = this.pos[i];
    this.prevFacing = this.facing;
  }

  /** Collision box, so objects can rest on and avoid the wizard. */
  box() {
    return bodyBox(this.pos, this.size);
  }

  /**
   * One fixed tick.
   * @param {{ down(a: string): boolean, pressed(a: string): boolean }} input
   * @param {import('../world/grid.js').Grid} grid
   * @param {object} [options]
   * @param {Iterable<{ box(): number[][] }>} [options.bodies] pushable objects
   * @param {boolean} [options.invincible] debug mode: holes and void blocks never kill
   * @param {'grid'|'screen'} [options.movementMode] which key → direction mapping to use (D38)
   * @returns {string|null} event: 'jump', 'land', 'die', 'respawn' or null
   */
  update(input, grid, { bodies = [], invincible = false, movementMode = 'grid' } = {}) {
    this.savePrevious();
    this.pushIntent = null;

    if (this.dead) {
      // In a hole, drop into the pit (drifting to the middle of the hole
      // tile, so the body doesn't hang over the rim); otherwise derez on the
      // spot. Then recompile at the reset point.
      if (this.deathCause === 'hole') {
        this.vy = Math.max(this.vy - PLAYER.gravity * DT, -PLAYER.maxFall);
        this.pos[1] += this.vy * DT;
        for (const axis of [0, 2]) {
          const middle = Math.floor(this.prev[axis]) + 0.5;
          this.pos[axis] += (middle - this.pos[axis]) * 0.25;
        }
      }
      if (--this.deathTimer > 0) return null;
      this.respawn();
      return 'respawn';
    }

    let event = null;
    if (this.invulnerable > 0) this.invulnerable--;

    // Walk along the grid axes, or screen-relative (D38); diagonals are normalised.
    const directions = movementMode === 'screen' ? SCREEN_DIRECTIONS : GRID_DIRECTIONS;
    let dx = 0;
    let dz = 0;
    for (const [action, [ax, az]] of directions) {
      if (input.down(action)) {
        dx += ax;
        dz += az;
      }
    }
    this.moving = dx !== 0 || dz !== 0;
    if (this.moving) {
      const speed = this.grounded ? PLAYER.speed : PLAYER.speed * PLAYER.airSpeed;
      const step = (speed * DT) / Math.hypot(dx, dz);
      const hitX = moveAxis(this.pos, this.size, 0, dx * step, grid, bodies, this);
      const hitZ = moveAxis(this.pos, this.size, 2, dz * step, grid, bodies, this);
      this.targetFacing = Math.atan2(dx, dz);
      this.trackPush(dx === 0 ? hitZ : dz === 0 ? hitX : null, [dx, dz]);
    } else {
      this.trackPush(null);
    }
    // Turn quickly but visibly towards the walking direction.
    const turn = Math.atan2(Math.sin(this.targetFacing - this.facing), Math.cos(this.targetFacing - this.facing));
    this.facing += turn * PLAYER.turnRate;

    // Jump, with a little forgiveness on both sides of the ground contact.
    this.coyote = this.grounded ? PLAYER.coyoteTicks : Math.max(0, this.coyote - 1);
    this.jumpBuffer = input.pressed('jump') ? PLAYER.jumpBufferTicks : Math.max(0, this.jumpBuffer - 1);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = JUMP_SPEED;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      event = 'jump';
    }

    // Gravity. Integrate the move first so a jump peaks at jumpHeight.
    const vy = this.vy;
    this.vy = Math.max(vy - PLAYER.gravity * DT, -PLAYER.maxFall);
    const wasGrounded = this.grounded;
    const blocked = moveAxis(this.pos, this.size, 1, ((vy + this.vy) / 2) * DT, grid, bodies, this);
    if (blocked) {
      this.grounded = this.vy < 0;
      this.vy = 0;
    } else {
      this.grounded = false;
    }
    if (this.grounded && !wasGrounded) event = 'land';

    // Standing on a hole at floor level: fall in (D18); standing on a void
    // block: derez. Both drain all integrity; respawning restores it. Only
    // the tile under his center counts, so grazing an edge is safe.
    if (this.grounded && !invincible) {
      if (this.pos[1] < FLOOR_EPS && grid.isHole(this.pos[0], this.pos[2])) {
        this.die('hole');
        return 'die';
      }
      if (this.standingOn(grid) === CELL.void) {
        this.die('void');
        return 'die';
      }
    }
    return event;
  }

  /**
   * The grid cell type right under his feet center: CELL.empty when he
   * stands on an object, CELL.solid on the floor.
   * @param {import('../world/grid.js').Grid} grid
   */
  standingOn(grid) {
    return grid.cellAt(Math.floor(this.pos[0]), Math.round(this.pos[1]) - 1, Math.floor(this.pos[2]));
  }

  /**
   * Count how long the wizard walks into the same object along one axis,
   * standing on the ground at its level and lined up with it; from
   * pushDelay ticks on, a push is due every tick until the object moves.
   * @param {object|boolean|null} hit what stopped the walk (a body, or true for a wall)
   * @param {number[]} [dir] [dx, dz] walking direction
   */
  trackPush(hit, dir) {
    const body = hit && typeof hit === 'object' && hit.push ? hit : null;
    if (!body || !this.grounded || !this.linedUp(body, dir)) {
      this.pushTarget = null;
      this.pushTicks = 0;
      return;
    }
    this.pushTicks = body === this.pushTarget ? this.pushTicks + 1 : 1;
    this.pushTarget = body;
    if (this.pushTicks >= PLAYER.pushDelay) this.pushIntent = { body, dir: dir.map(Math.sign) };
  }

  /** Feet at the object's level, and the wizard's center within its span across the push. */
  linedUp(body, [dx]) {
    const box = body.box();
    const across = dx !== 0 ? 2 : 0;
    const center = this.pos[across];
    return Math.abs(this.pos[1] - box[1][0]) < 0.5 && center > box[across][0] && center < box[across][1];
  }
}
