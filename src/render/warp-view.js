/**
 * three.js pieces of the Blink dash and the Warp afterimage (D86; timing
 * in warp-fx.js), in the spell's color: Blink's light streaks and the
 * pixels kicked up where it started; Warp's stream of pixels from where
 * he was to where he is.
 */
import { Group } from 'three';
import { createPixelBurst, placePixels } from './pixels.js';
import { fadingLines, lineMaterial, neonLines } from './neon.js';
import { WARP_FX, dashLook, kickPixels, streakLook, warpPixels } from './warp-fx.js';

/**
 * The trail of a Blink (`dash`: streaks and a kick) or a Warp (`pixels`)
 * in the spell's `color`, hidden until placeWarpTrail() shows it.
 * @param {number|string} color
 * @param {'blink'|'warp'} spell
 */
export function createWarpTrail(color, spell) {
  const view = new Group();
  const style = spell === 'blink' ? 'dash' : 'pixels';
  view.userData.style = style;
  if (style === 'dash') {
    // Unit lines along +z, bright at his end (z = 1), stretched along the way.
    const segments = WARP_FX.streakHeights.map((y) => [
      [0, y, 1],
      [0, y, 0],
    ]);
    const streak = new Group().add(
      fadingLines(segments, { color, width: 5, brightness: 2 }),
      neonLines(
        segments.map(([a, b]) => [a, [0, b[1], 0.6]]),
        lineMaterial({ color: 0xffffff, width: 1.5, brightness: 2.2 }),
      ),
    );
    const kick = createPixelBurst(WARP_FX.kickPixels, WARP_FX.pixelSize, [color, 0xffffff]);
    Object.assign(view.userData, { streak, kick });
    view.add(streak, kick);
  } else {
    const burst = createPixelBurst(WARP_FX.pixels, WARP_FX.pixelSize, [color, 0xffffff]);
    view.userData.burst = burst;
    view.add(burst);
  }
  view.visible = false;
  return view;
}

/**
 * Where the wizard is drawn `tick` ticks after a Blink or Warp: a Blink
 * dash draws him short of where he is, shooting forward (dashLook()),
 * stretched along the way; after a Warp he is where he is.
 * @param {{ spell: string, from: number[], to: number[] }|null} warp
 * @param {number[]} pos where he is (drawn), which may have moved on since (a fall)
 * @param {number} tick may be fractional
 * @returns {{ pos: number[], stretch: number }}
 */
export function dashPose(warp, pos, tick) {
  if (warp?.spell !== 'blink') return { pos, stretch: 1 };
  const { along, stretch } = dashLook(tick);
  const { from, to } = warp;
  return { pos: pos.map((v, k) => v - (to[k] - from[k]) * (1 - along)), stretch };
}

/**
 * Show the trail `tick` ticks after a Blink or Warp from `from` to `to`
 * (feet centers), or hide it (warp null).
 * @param {Group} view from createWarpTrail()
 * @param {{ from: number[], to: number[] }|null} warp
 * @param {number} tick may be fractional
 */
export function placeWarpTrail(view, warp, tick) {
  view.visible = warp !== null;
  if (!warp) return;
  const { from, to } = warp;
  const { style, streak, kick, burst } = view.userData;
  if (style === 'dash') {
    const d = [to[0] - from[0], to[2] - from[2]];
    const length = Math.hypot(...d);
    const head = dashLook(tick).along;
    const { visible, tail } = streakLook(tick);
    const from1 = Math.min(tail, head);
    streak.visible = visible && head - from1 > 1e-3;
    streak.position.set(from[0] + d[0] * from1, to[1], from[2] + d[1] * from1);
    streak.rotation.y = Math.atan2(d[0], d[1]);
    streak.scale.set(1, 1, Math.max(length * (head - from1), 1e-3));
    const dir = length > 0 ? [d[0] / length, d[1] / length] : [0, 1];
    placePixels(kick, kickPixels(tick, dir), from);
  } else {
    placePixels(burst, warpPixels(tick, from, to), [0, 0, 0]);
  }
}
