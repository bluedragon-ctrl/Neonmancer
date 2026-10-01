/**
 * The monster editor's live preview (D119): an enemy of the edited
 * template facing the wizard on a small floor, with the game's own models
 * and effects, in a 6 s loop: calm for 3 s (walking at its speed unless
 * stationary), then after the wizard (a provoked one as if a Zap hit it):
 * a "!" if it notices him, its chase speed, and a charged attack charging
 * and firing (a burst or arc of lightning, or bolts, aimed or four ways).
 * A peaceful one stays calm. A taller body is drawn bigger, a boss wears
 * its gold rings (shut while plate armor is calm, D135). Dev tool
 * (tools/monster-editor.js).
 */
import { Group } from 'three';
import { ENEMY } from '../src/entities/enemy.js';
import { BOLT } from '../src/entities/bolt.js';
import { CHARGED_ATTACKS, DISCHARGES } from '../src/data/room-data.js';
import { frameRoom } from '../src/render/camera.js';
import { chargeGlow, createDischarge, dischargeLook, placeDischarge } from '../src/render/discharge.js';
import { createAlertMark, placeAlertMark } from '../src/render/alert-mark.js';
import { bodyScale, createBossMark } from '../src/render/boss-mark.js';
import { ENEMY_MODELS } from '../src/render/entity-view.js';
import { createFloor } from '../src/render/floor.js';
import { PALETTE, disposeTree } from '../src/render/neon.js';
import { createWizard } from '../src/render/wizard.js';
import { createBolt, placeBolt } from '../src/render/zap-view.js';

/** Floor size, where the enemy stands, and the wizard: 3 units to its right on screen. */
const FLOOR = [7, 2, 7];
const AT = [2, 0, 4];
const WIZARD = [AT[0] + 2.1, 0, AT[2] - 2.1];
/** Seconds: the loop, when it turns to the wizard, when a charged attack starts. */
const LOOP = 6;
const ALERT_AT = 3;
const ATTACK_AT = 3.5;
/** How far bolts fly before they fade (units). */
const BOLT_FLIGHT = 3.5;
/** The camera's zoom on the floor. */
const ZOOM = 3;

/** Unit directions [x, 0, z] of a four-way (cross) bolt attack. */
const CROSS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export class MonsterPreview {
  /** @param {import('../src/render/renderer.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    renderer.scene.add(createFloor(FLOOR, PALETTE.amber));
    const wizard = createWizard();
    wizard.position.set(...WIZARD);
    wizard.rotation.y = Math.atan2(AT[0] - WIZARD[0], AT[2] - WIZARD[2]);
    renderer.scene.add(wizard);
    frameRoom(renderer.camera, FLOOR);
    renderer.camera.zoom = ZOOM;
    renderer.camera.updateProjectionMatrix();
    /** What is rebuilt for each template: the enemy, its "!", lightning and bolts. */
    this.group = new Group();
    renderer.scene.add(this.group);
    this.values = null;
    this.key = '';
    this.walked = 0;
  }

  /**
   * Show an enemy with these values (a template filled in, withEnemyDefaults()).
   * @param {object|null} values
   */
  show(values) {
    this.values = values;
    // Rebuilt only when what it is built from changes.
    const key = values ? JSON.stringify([values.look, values.color, values.attack, values.attackColor, values.attackRange, values.boltPattern, values.height, Boolean(values.boss)]) : '';
    if (key === this.key) return;
    this.key = key;
    disposeTree(this.group);
    this.group.clear();
    this.parts = null;
    const kind = values && ENEMY_MODELS[values.look];
    if (!kind) return;
    const model = kind.create(values.color);
    // A taller body is drawn bigger; a boss wears its gold rings (D134).
    const scale = bodyScale(values.height);
    model.scale.setScalar(scale);
    model.position.set(AT[0] + 0.5, AT[1], AT[2] + 0.5);
    model.rotation.y = Math.atan2(WIZARD[0] - AT[0] - 0.5, WIZARD[2] - AT[2] - 0.5);
    const mark = createAlertMark();
    mark.position.copy(model.position);
    this.group.add(model, mark);
    const ring = values.boss ? createBossMark(values.height) : null;
    if (ring) {
      ring.position.copy(model.position);
      this.group.add(ring);
    }
    const discharge = DISCHARGES.includes(values.attack) ? createDischarge({ color: values.attackColor, shape: values.attack, range: values.attackRange }) : null;
    if (discharge) this.group.add(discharge);
    const bolts = values.attack === 'bolt' ? (values.boltPattern === 'cross' ? CROSS : [null]).map(() => createBolt(values.attackColor)) : [];
    this.group.add(...bolts);
    this.parts = { kind, model, mark, ring, scale, discharge, bolts, mood: null };
  }

  /**
   * One frame of the loop.
   * @param {number} dt seconds since the last frame
   * @param {number} time seconds
   */
  update(dt, time) {
    const { values, parts } = this;
    if (!parts) return;
    const { kind, model, mark, discharge, bolts } = parts;
    const t = time % LOOP;
    const after = t >= ALERT_AT && values.hostility !== 'peaceful';
    const mood = values.hostility === 'hostile' || after ? 'hostile' : values.hostility;
    if (mood !== parts.mood) kind.setMood(model, (parts.mood = mood));
    const noticed = after && values.aggroRange > 0;
    const charged = after && CHARGED_ATTACKS.includes(values.attack) && values.aggroRange >= values.attackRange;
    const chargeTicks = Math.round(values.attackCharge * 60);
    const tick = charged && t >= ATTACK_AT ? (t - ATTACK_AT) * 60 : null;
    const attacking = tick !== null && tick < chargeTicks + ENEMY.dischargeTicks;

    // Walking in place: calm at its speed, after him at its chase speed; still while it attacks.
    const moves = values.movement !== 'stationary' && !attacking;
    const pace = !moves ? 0 : noticed && values.movement === 'chase' ? values.chaseSpeed : values.speed;
    this.walked += dt * pace;
    kind.animate(model, { state: pace > 0 ? 'walk' : 'rest', walked: this.walked, time, alert: noticed ? 1 : 0, attack: attacking ? tick : null, charge: chargeTicks });
    model.userData.flash.amount.value = chargeGlow(dischargeLook(attacking ? tick : null, chargeTicks));
    model.userData.flash.color.value.set(0xffffff);
    placeAlertMark(mark, noticed ? 1 : 0, time, kind.markHeight * this.parts.scale);
    this.parts.ring?.userData.update(dt, { armored: values.boss?.armor === 'plate' ? !after : null });

    const eyes = [AT[0] + 0.5, (ENEMY.eyeHeight * values.height) / ENEMY.size[1], AT[2] + 0.5];
    if (discharge) placeDischarge(discharge, attacking ? tick : null, chargeTicks, eyes, [WIZARD[0], 0.75, WIZARD[2]]);
    // Bolts leave when the charge is done and fly at the bolt speed.
    const flown = tick === null ? -1 : tick - chargeTicks;
    const aim = [WIZARD[0] - eyes[0], 0.75 - eyes[1], WIZARD[2] - eyes[2]];
    const length = Math.hypot(...aim);
    bolts.forEach((bolt, i) => {
      const dir = values.boltPattern === 'cross' ? CROSS[i] : aim.map((v) => v / length);
      const traveled = (flown / 60) * values.boltSpeed;
      const range = values.boltPattern === 'cross' ? BOLT_FLIGHT : Math.min(BOLT_FLIGHT, length - BOLT.reach);
      bolt.visible = flown >= 0 && traveled < range;
      if (bolt.visible) placeBolt(bolt, eyes.map((v, k) => v + dir[k] * (BOLT.reach + traveled)), dir, flown, traveled);
    });
  }
}
