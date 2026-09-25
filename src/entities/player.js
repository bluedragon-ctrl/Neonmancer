/**
 * The wizard: movement along the grid axes, jump, gravity, death in holes
 * and respawn. Pure logic, one call to update() per fixed tick.
 */
import { DT } from '../core/loop.js';
import { PLAYER_HITBOX } from '../core/rules.js';
import { moveAxis } from '../physics/collision.js';

/** Tuning values (units, seconds, ticks). */
export const PLAYER = {
  /** Walking speed in units per second. */
  speed: 4.5,
  gravity: 30,
  /**
   * Apex of every jump above the take-off height: clears 1 block, never 2
   * (D3). Jumps have a fixed height (no short hops), like the block rule.
   */
  jumpHeight: 1.2,
  /** Fastest fall in units per second (below 1 unit per tick, see collision.js). */
  maxFall: 18,
  /** A jump still works this many ticks after walking off a ledge. */
  coyoteTicks: 6,
  /** A jump pressed this many ticks before landing still happens on landing. */
  jumpBufferTicks: 6,
  /** Share of the remaining turn done each tick. */
  turnRate: 0.35,
  /** Ticks between dying and respawning. */
  deathTicks: 45,
};

/** Take-off speed that reaches exactly jumpHeight: v = √(2gh). */
export const JUMP_SPEED = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight);

/**
 * Movement [dx, dz] per action along the grid axes (D23): Right = −z (screen
 * up-right), Up = −x (screen up-left), Left = +z, Down = +x.
 */
const DIRECTIONS = { up: [-1, 0], down: [1, 0], left: [0, 1], right: [0, -1] };

/** Feet this close to y = 0 count as standing on the floor. */
const FLOOR_EPS = 1e-4;

export class Player {
  /** @param {number[]} spawn feet center [x, y, z] */
  constructor(spawn) {
    this.size = PLAYER_HITBOX;
    this.spawn = [...spawn];
    this.respawn();
  }

  /** Put the wizard back at the spawn point, alive and still. */
  respawn() {
    this.pos = [...this.spawn];
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
    this.deathTimer = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
  }

  /**
   * One fixed tick.
   * @param {{ down(a: string): boolean, pressed(a: string): boolean }} input
   * @param {import('../world/grid.js').Grid} grid
   * @returns {string|null} event: 'jump', 'land', 'die', 'respawn' or null
   */
  update(input, grid) {
    this.prev = [...this.pos];
    this.prevFacing = this.facing;

    if (this.dead) {
      // Drop into the pit (drifting to the middle of the hole tile, so the
      // body doesn't hang over the rim), then recompile at the spawn.
      this.vy = Math.max(this.vy - PLAYER.gravity * DT, -PLAYER.maxFall);
      this.pos[1] += this.vy * DT;
      for (const axis of [0, 2]) {
        const middle = Math.floor(this.prev[axis]) + 0.5;
        this.pos[axis] += (middle - this.pos[axis]) * 0.25;
      }
      if (--this.deathTimer > 0) return null;
      this.respawn();
      return 'respawn';
    }

    let event = null;

    // Walk along the grid axes; diagonals are normalised.
    let dx = 0;
    let dz = 0;
    for (const [action, [ax, az]] of Object.entries(DIRECTIONS)) {
      if (input.down(action)) {
        dx += ax;
        dz += az;
      }
    }
    this.moving = dx !== 0 || dz !== 0;
    if (this.moving) {
      const step = (PLAYER.speed * DT) / Math.hypot(dx, dz);
      moveAxis(this.pos, this.size, 0, dx * step, grid);
      moveAxis(this.pos, this.size, 2, dz * step, grid);
      this.targetFacing = Math.atan2(dx, dz);
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
    const blocked = moveAxis(this.pos, this.size, 1, ((vy + this.vy) / 2) * DT, grid);
    if (blocked) {
      this.grounded = this.vy < 0;
      this.vy = 0;
    } else {
      this.grounded = false;
    }
    if (this.grounded && !wasGrounded) event = 'land';

    // Standing on a hole at floor level: fall in (D18).
    if (this.grounded && this.pos[1] < FLOOR_EPS && grid.isHole(this.pos[0], this.pos[2])) {
      this.dead = true;
      this.deathTimer = PLAYER.deathTicks;
      this.grounded = false;
      this.vy = 0;
      return 'die';
    }
    return event;
  }
}
