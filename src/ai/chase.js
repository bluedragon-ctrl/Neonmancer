/**
 * Chase behavior (D78): go after the wizard while seeing him, search where
 * he was last seen for a while, then go home. Pure logic; the enemy does
 * the seeing (Enemy.sense()) and hands it over every tick (update()).
 *
 *   calm ──sees him──► chase ──loses sight──► search ──memory runs out──► return ──home──► calm
 *     ▲                  ▲                      │                            │
 *     │                  └──────sees him────────┴────────────────────────────┘
 *     └── with a path, it patrols while calm, and goes straight back to it after a search
 *
 * Stepping is greedy: towards the target along the axis where it is
 * farther, else along the other one; the enemy takes the first of these
 * steps that is free and safe. So a wall between them stops it: the wizard
 * can hide behind blocks and trap it with crates. While he is within its
 * attack range it holds its ground (it attacks from there).
 */
import { DT } from '../core/loop.js';
import { Patrol } from './patrol.js';

export class Chase {
  /**
   * @param {number[]} at the enemy's start cell [x, y, z]: its post
   * @param {{ points: number[][], mode?: string, pause?: number }} [path] walked while calm
   * @param {{ memory: number }} data seconds it searches after losing sight of him
   */
  constructor(at, path, { memory }) {
    this.patrol = path ? new Patrol(at, path) : null;
    /** Column it goes back to after a search (without a path). */
    this.home = [at[0], at[2]];
    this.memoryTicks = Math.round(memory / DT);
    /** 'calm' | 'chase' | 'search' | 'return' */
    this.mode = 'calm';
    /** Ticks of searching left. */
    this.search = 0;
  }

  /** Is it after the wizard (chasing or searching)? Then it moves at its chase speed. */
  get chasing() {
    return this.mode === 'chase' || this.mode === 'search';
  }

  /**
   * One tick of what the enemy senses.
   * @param {{ sees: boolean }} senses
   */
  update({ sees }) {
    if (sees) {
      this.mode = 'chase';
      this.search = this.memoryTicks;
      return;
    }
    if (this.mode === 'chase') this.mode = 'search';
    if (this.mode === 'search' && --this.search <= 0) this.mode = this.patrol ? 'calm' : 'return';
  }

  /**
   * The steps worth trying from the column [x, z], best first, or null to
   * stay put.
   * @param {number} x
   * @param {number} z
   * @param {{ lastSeen: number[]|null, inRange: boolean }} senses where it last saw
   *   him (a column), and whether he is within its attack range
   * @returns {number[]|number[][]|null}
   */
  next(x, z, { lastSeen, inRange }) {
    if (this.mode === 'chase') return inRange ? null : towards(x, z, lastSeen);
    // Searching: to where he was, then it waits there, looking.
    if (this.mode === 'search') return towards(x, z, lastSeen);
    if (this.mode === 'return') {
      const steps = towards(x, z, this.home);
      if (!steps) this.mode = 'calm';
      return steps;
    }
    return this.patrol ? this.patrol.next(x, z) : null;
  }

  /** Its way was blocked. Calm: the patrol turns back; going home: it gives up and stays. */
  turnBack() {
    if (this.mode === 'calm') this.patrol?.turnBack();
    else if (this.mode === 'return') this.mode = 'calm';
  }
}

/**
 * Greedy steps from [x, z] towards the column `target`: along the axis
 * where it is farther first (x on a tie), then along the other if that
 * brings it closer too. Null when it is there (or has no target).
 * @param {number} x
 * @param {number} z
 * @param {number[]|null} target
 * @returns {number[][]|null}
 */
export function towards(x, z, target) {
  if (!target) return null;
  const dx = target[0] - x;
  const dz = target[1] - z;
  if (dx === 0 && dz === 0) return null;
  const alongX = [Math.sign(dx), 0];
  const alongZ = [0, Math.sign(dz)];
  const steps = Math.abs(dx) >= Math.abs(dz) ? [alongX, alongZ] : [alongZ, alongX];
  return steps.filter(([sx, sz]) => sx !== 0 || sz !== 0);
}
