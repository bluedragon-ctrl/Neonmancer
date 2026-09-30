import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOTION, WizardMotion, eyesOpen, landSquash, springStep, wizardPose } from '../src/render/wizard-motion.js';
import { WIZARD, createWizard } from '../src/render/wizard.js';
import { addXray } from '../src/render/xray.js';

const STILL = { phase: 0, walk: 0, air: 0, speed: 0, landed: null, time: 0 };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('wizard motion: the spring settles on its target after overshooting it', () => {
  let state = { x: 0, v: 0 };
  let peak = 0;
  for (let i = 0; i < 180; i++) {
    state = springStep(state, 1, 1 / 60);
    peak = Math.max(peak, state.x);
  }
  assert.ok(peak > 1.05, 'the hat wobbles past where it goes');
  assert.ok(close(state.x, 1, 0.01) && Math.abs(state.v) < 0.05, 'and comes to rest there');
});

test('wizard motion: a slow frame steps the spring in short steps, not one big jump', () => {
  const one = springStep({ x: 0, v: 0 }, 1, 0.1);
  let many = { x: 0, v: 0 };
  for (let i = 0; i < 12; i++) many = springStep(many, 1, 0.1 / 12);
  assert.ok(close(one.x, many.x, 1e-6));
});

test('wizard motion: landing squashes at once and springs back through a stretch', () => {
  assert.equal(landSquash(null), 0);
  assert.equal(landSquash(MOTION.land.time), 0);
  assert.ok(close(landSquash(0), MOTION.land.depth));
  const samples = Array.from({ length: 20 }, (_, i) => landSquash((i / 20) * MOTION.land.time));
  assert.ok(Math.min(...samples) < 0, 'a little stretch on the rebound');
});

test('wizard motion: the eyes blink shut once in each stretch and are open otherwise', () => {
  const { every } = MOTION.blink;
  for (let n = 0; n < 5; n++) {
    const samples = Array.from({ length: 1000 }, (_, i) => eyesOpen(n * every + (i / 1000) * every));
    assert.ok(Math.min(...samples) < 0.1, `blink ${n} closes the eyes`);
    assert.ok(samples.filter((open) => open === 1).length > 900, 'open most of the time');
  }
});

test('wizard motion: standing, he is upright with his hands at rest (bar the float)', () => {
  const pose = wizardPose(STILL);
  assert.equal(pose.lean, 0);
  assert.ok(close(pose.headY, 0));
  for (const [x, , z] of pose.hands) assert.ok(close(x, 0) && close(z, 0));
  assert.ok(close(pose.scale[1], 1) && close(pose.scale[0], 1));
});

test('wizard motion: walking bobs the head at each step and swings the hands in turn', () => {
  const walk = { ...STILL, walk: 1 };
  const step = wizardPose({ ...walk, phase: 0.25 });
  assert.ok(close(step.headY, -MOTION.bob), 'lowest at a step');
  assert.ok(step.scale[1] < 1, 'body squashed a little');
  assert.ok(step.lean > 0, 'leaning forward');
  const [left, right] = step.hands;
  assert.ok(close(left[2], MOTION.swing) && close(right[2], -MOTION.swing), 'one hand forward, one back');
  const other = wizardPose({ ...walk, phase: 0.75 });
  assert.ok(close(other.hands[0][2], -MOTION.swing), 'and the other way at the next step');
  const again = wizardPose({ ...walk, phase: 1.25 });
  assert.deepEqual(again.hands, step.hands, 'the cycle repeats');
});

test('wizard motion: the body keeps its volume when it squashes or stretches', () => {
  for (const pose of [wizardPose({ ...STILL, landed: 0 }), wizardPose({ ...STILL, air: 1, speed: 1 })]) {
    const [x, y, z] = pose.scale;
    assert.ok(close(x * y * z, 1, 1e-9));
  }
  assert.ok(wizardPose({ ...STILL, landed: 0 }).scale[1] < 1);
  assert.ok(wizardPose({ ...STILL, air: 1, speed: 1 }).scale[1] > 1);
});

test('wizard motion: in the air his hands go up and out', () => {
  const [left, right] = wizardPose({ ...STILL, air: 1 }).hands;
  assert.ok(left[1] > 0 && right[1] > 0);
  assert.ok(left[0] < 0 && right[0] > 0);
});

/** Walk a wizard along +z (facing +z) for `frames` frames at `speed`. */
function walk(motion, frames, { speed = 4.5, from = [0, 0, 0], grounded = true, moving = true } = {}) {
  const pos = [...from];
  for (let i = 0; i < frames; i++) {
    pos[2] += speed / 60;
    motion.update({ dt: 1 / 60, time: i / 60, pos, facing: 0, grounded, moving, vy: 0 });
  }
  return pos;
}

test('wizard motion: the steps follow the distance walked', () => {
  const motion = new WizardMotion(createWizard());
  walk(motion, 60);
  assert.ok(close(motion.phase, (4.5 - 4.5 / 60) / MOTION.stride, 1e-6));
  assert.ok(motion.walk > 0.99);
});

test('wizard motion: riding without walking, or a jump cut, takes no steps', () => {
  const motion = new WizardMotion(createWizard());
  walk(motion, 30, { moving: false });
  assert.equal(motion.phase, 0);
  motion.update({ dt: 1 / 60, time: 1, pos: [5, 0, 5], facing: 0, grounded: true, moving: true, vy: 0 });
  assert.equal(motion.phase, 0, 'a respawn or Warp is not a step');
});

test('wizard motion: walking forward tips the hat back; stopping lets it wobble back', () => {
  const wizard = createWizard();
  const motion = new WizardMotion(wizard);
  const pos = walk(motion, 60);
  const hat = wizard.userData.rig.hat;
  assert.ok(hat.rotation.x < -WIZARD.hatTilt - 0.1, 'trailing back');
  let forward = -Infinity;
  for (let i = 0; i < 120; i++) {
    motion.update({ dt: 1 / 60, time: 1 + i / 60, pos, facing: 0, grounded: true, moving: false, vy: 0 });
    forward = Math.max(forward, hat.rotation.x);
  }
  assert.ok(forward > -WIZARD.hatTilt, 'swings forward past its rest');
  assert.ok(close(hat.rotation.x, -WIZARD.hatTilt, 0.01), 'and settles');
});

test('wizard motion: touching down squashes him and kicks the hat', () => {
  const wizard = createWizard();
  const motion = new WizardMotion(wizard);
  walk(motion, 10, { speed: 0, grounded: false, moving: false });
  const { rig } = wizard.userData.rig;
  motion.update({ dt: 1 / 60, time: 1, pos: [0, 0, 0], facing: 0, grounded: true, moving: false, vy: 0 });
  assert.equal(motion.landed, 0);
  assert.ok(rig.scale.y < 1 && rig.scale.x > 1);
  assert.ok(motion.pitch.v < 0);
});

test('wizard motion: the rig moves the x-ray ghosts with the parts', () => {
  const wizard = createWizard();
  const ghosts = addXray(wizard);
  const motion = new WizardMotion(wizard);
  walk(motion, 20);
  const hand = wizard.userData.rig.hands[0];
  const handGhosts = ghosts.filter((ghost) => {
    for (let node = ghost; node; node = node.parent) if (node === hand) return true;
    return false;
  });
  assert.equal(handGhosts.length, 1, "a hand's ghost lives inside the hand, so it follows it");
});
