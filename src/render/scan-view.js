/**
 * three.js pieces of Scan (D128; shapes and timing in scan-fx.js): the
 * wave spreading from the wizard's feet, and the derez of what it
 * reveals (a fake block, a hidden exit's patch of wall), in the room's
 * color. The room view itself is rebuilt without them (room-scene.js).
 */
import { Color, Group } from 'three';
import { TICK_RATE } from '../core/loop.js';
import { BLOCK_BODY, DEREZ } from './derez-fx.js';
import { lineMaterial, neonLines } from './neon.js';
import { createDerez, placeDerez } from './pixels.js';
import { SCAN_FX, exitSlab, scanSquare, waveBrightness } from './scan-fx.js';
import { scanReach } from '../entities/scan.js';

/** A unit line along +x from the origin; a side of a square is one, placed and stretched. */
const UNIT = [[[0, 0, 0], [1, 0, 0]]];

/**
 * The wave of a scan (the square and the one trailing it, four sides
 * each) in the spell's `color`, hidden until placeWave() shows it.
 * @param {number|string} color
 */
export function createWave(color) {
  const group = new Group();
  group.userData.color = new Color(color);
  group.userData.squares = [SCAN_FX.brightness, SCAN_FX.trailBrightness].map((brightness) => {
    const material = lineMaterial({ color, width: 2.5, brightness });
    const sides = [0, 1, 2, 3].map(() => neonLines(UNIT, material));
    group.add(...sides);
    return { brightness, material, sides };
  });
  group.visible = false;
  return group;
}

/**
 * Show the wave `tick` ticks after a scan from `origin` with `range`, in a
 * room of `size`, clipped to its floor; `tick` null hides it.
 * @param {Group} wave from createWave()
 * @param {number|null} tick may be fractional
 * @param {number[]} origin his feet center when he cast it
 * @param {number} range
 * @param {number[]} size room size
 */
export function placeWave(wave, tick, origin, range, size) {
  wave.visible = tick !== null;
  if (tick === null) return;
  const reach = scanReach(tick, range);
  const fade = waveBrightness(tick);
  for (const [i, { brightness, material, sides }] of wave.userData.squares.entries()) {
    material.color.copy(wave.userData.color).multiplyScalar(brightness * fade);
    scanSquare(origin, Math.max(reach - i * SCAN_FX.trail, 0), size).forEach((segment, k) => {
      const side = sides[k];
      side.visible = segment !== null;
      if (!segment) return;
      const [a, b] = segment;
      side.position.set(...a);
      // Sides along x (−z, +z) are stretched as they are; along z turned first.
      side.rotation.y = k % 2 === 0 ? 0 : -Math.PI / 2;
      side.scale.set(Math.max(Math.hypot(b[0] - a[0], b[2] - a[2]), 1e-3), 1, 1);
    });
  }
}

/**
 * The derez of what a scan revealed: a fake block's cell [x, y, z], or a
 * hidden exit's patch of wall.
 * @param {{ cell?: number[], exit?: object }} found
 * @param {number[]} size room size
 * @returns {{ body: import('./derez-fx.js').DerezBody, at: number[] }}
 */
export function revealBody({ cell, exit }, size) {
  return cell ? { body: BLOCK_BODY, at: [cell[0] + 0.5, cell[1], cell[2] + 0.5] } : exitSlab(exit, size);
}

export class ScanView {
  /**
   * @param {import('../game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.wave = createWave(game.content.spells.scan?.color ?? 0xffffff);
    /** Derezzes of what the scan revealed: { mesh, pos, tick }. */
    this.bursts = [];
    this.group = new Group().add(this.wave);
  }

  /**
   * A scan revealed something ('reveal'): it derezzes in the room's color.
   * @param {import('../game.js').GameEvent} event
   */
  reveal(event) {
    const { room } = this.game;
    const { body, at } = revealBody(event, room.size);
    const mesh = createDerez(body, [room.color, 0xffffff]);
    this.group.add(mesh);
    this.bursts.push({ mesh, pos: at, tick: 0 });
  }

  /**
   * Once per frame.
   * @param {number} alpha interpolation factor 0..1 between the last two ticks
   * @param {number} dt seconds since the last frame
   */
  sync(alpha, dt) {
    const { player, room } = this.game;
    const { scan } = player;
    placeWave(this.wave, scan ? scan.tick + alpha : null, scan?.origin, scan?.range, room.size);
    this.bursts = this.bursts.filter((burst) => {
      burst.tick += dt * TICK_RATE;
      if (burst.tick < DEREZ.ticks) {
        placeDerez(burst.mesh, burst.tick, burst.pos);
        return true;
      }
      this.group.remove(burst.mesh);
      burst.mesh.geometry.dispose();
      burst.mesh.material.dispose();
      return false;
    });
  }
}
