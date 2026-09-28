/**
 * The alert mark: a red "!" bobbing above an enemy while it chases the
 * wizard (Phase 3 step 5), so a chase reads at a glance.
 */
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { shared } from './neon.js';

/** Sizes in units. */
export const ALERT_MARK = { bar: [0.05, 0.16, 0.05], dot: 0.05, color: 0xff2a3a, glow: 2.5, bob: 0.05, rate: 6 };

const BAR = shared(new BoxGeometry(...ALERT_MARK.bar));
const DOT = shared(new BoxGeometry(ALERT_MARK.dot, ALERT_MARK.dot, ALERT_MARK.dot));
const MATERIAL = shared(new MeshBasicMaterial());
MATERIAL.color.set(ALERT_MARK.color).multiplyScalar(ALERT_MARK.glow);

/** A hidden "!" (its bottom at y = 0), placed with placeAlertMark(). */
export function createAlertMark() {
  const bar = new Mesh(BAR, MATERIAL);
  bar.position.y = ALERT_MARK.bar[1] / 2 + ALERT_MARK.dot * 1.6;
  const mark = new Group().add(bar, new Mesh(DOT, MATERIAL));
  mark.visible = false;
  return mark;
}

/**
 * Show the mark while `alert` is over half, bobbing at `height`.
 * @param {Group} mark from createAlertMark()
 * @param {number} alert 0..1
 * @param {number} time seconds
 * @param {number} height
 */
export function placeAlertMark(mark, alert, time, height) {
  mark.visible = alert > 0.5;
  mark.position.y = height + Math.abs(Math.sin(time * ALERT_MARK.rate)) * ALERT_MARK.bob;
}
