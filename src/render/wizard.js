/**
 * The wizard model in the hologram look (D22): a cone body, a ball head,
 * two small floating ball hands and a pointy hat (cone + brim) tilted back,
 * so the isometric camera sees the face under the brim. Glowing eyes. Gold
 * bands round the hat show his access level (D101), one per level, from the
 * brim up.
 *
 * The model stands on y = 0 around the y axis and looks along +z. It is
 * about 1.9 units tall; only the lower 1.5 is the hitbox (the hat is visual
 * only, D3). The hands float a little outside the hitbox.
 */
import { ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry } from 'three';
import { createFlash, eyeMaterial, holoPart } from './holo.js';
import { FRAGMENT_COLOR } from '../entities/pickup.js';
import { PALETTE, lineMaterial, neonLines } from './neon.js';

/** Proportions in world units. */
export const WIZARD = {
  body: { y0: 0, y1: 0.75, r0: 0.3, r1: 0.07 },
  head: { y: 0.95, r: 0.21 },
  hands: { x: 0.33, y: 0.48, z: 0.06, r: 0.075 },
  brim: { y: 1.12, r: 0.31, thickness: 0.04 },
  hat: { y0: 1.14, r: 0.22, tipY: 1.88 },
  /** Backward tilt of the whole hat around the brim center, in radians. */
  hatTilt: 0.3,
  eyes: { x: 0.07, dy: 0.03, size: [0.028, 0.045, 0.02] },
  /** Access bands (D101): the first's height above the brim, the gap between them, how far out from the hat. */
  bands: { y: 0.09, gap: 0.085, out: 0.012 },
};

/** Round parts use this many segments, so outlines stay smooth. */
const SEGMENTS = 32;

/**
 * The wizard's parts as plain data (pure, tested): each has a shape, sizes,
 * a center and a color role. Hat parts are relative to the brim center and
 * get tilted as a group.
 */
export function wizardParts() {
  const { body, head, hands, brim, hat } = WIZARD;
  return {
    main: [
      { shape: 'cone', r0: body.r0, r1: body.r1, height: body.y1 - body.y0, center: [0, (body.y0 + body.y1) / 2, 0], role: 'body' },
      { shape: 'ball', r: head.r, center: [0, head.y, 0], role: 'head' },
      { shape: 'ball', r: hands.r, center: [-hands.x, hands.y, hands.z], role: 'head' },
      { shape: 'ball', r: hands.r, center: [hands.x, hands.y, hands.z], role: 'head' },
    ],
    hat: [
      { shape: 'cone', r0: brim.r, r1: brim.r, height: brim.thickness, center: [0, 0, 0], role: 'hat' },
      { shape: 'cone', r0: hat.r, r1: 0, height: hat.tipY - hat.y0, center: [0, (hat.tipY + hat.y0) / 2 - brim.y, 0], role: 'hat' },
    ],
  };
}

/**
 * The access bands' rings (pure), relative to the brim center like the hat
 * parts: `count` circles round the hat cone, from the brim up.
 * @param {number} count
 * @returns {{ y: number, r: number }[]}
 */
export function hatBands(count) {
  const { brim, hat, bands } = WIZARD;
  const base = hat.y0 - brim.y;
  const height = hat.tipY - hat.y0;
  return Array.from({ length: count }, (_, i) => {
    const y = base + bands.y + i * bands.gap;
    return { y, r: hat.r * (1 - (y - base) / height) + bands.out };
  });
}

function geometryOf(part) {
  if (part.shape === 'ball') return new SphereGeometry(part.r, SEGMENTS, SEGMENTS / 2);
  if (part.r1 === 0) return new ConeGeometry(part.r0, part.height, SEGMENTS);
  return new CylinderGeometry(part.r1, part.r0, part.height, SEGMENTS);
}

/** Two small glowing eyes on the front of the head. */
function createEyes() {
  const { head, eyes } = WIZARD;
  const material = eyeMaterial();
  const geometry = new SphereGeometry(1, 12, 8);
  return [-1, 1].map((side) => {
    const eye = new Mesh(geometry, material);
    const x = side * eyes.x;
    eye.position.set(x, head.y + eyes.dy, Math.sqrt(head.r ** 2 - x ** 2 - eyes.dy ** 2));
    eye.scale.set(...eyes.size);
    return eye;
  });
}

/**
 * The wizard as a three.js group (origin at the feet, looking along +z).
 * `userData.rig` holds the parts wizard-motion.js animates (rig, head,
 * hands, hat, eyes); the group's own scale stays free for hit looks.
 * `userData.flash` holds his own flash uniforms (holo.js createFlash()):
 * set `amount` and `color` to flash the whole hologram, e.g. on a hit.
 * @param {object} [colors]
 * @param {number|string} [colors.body] body cone
 * @param {number|string} [colors.head] head and hands
 * @param {number|string} [colors.hat]
 * @param {number} [colors.bands] access bands the hat has room for (D101);
 *   `userData.setAccess(level)` shows that many
 */
export function createWizard({ body = PALETTE.magenta, head = PALETTE.cyan, hat = PALETTE.magenta, bands = 3 } = {}) {
  const colors = { body, head, hat };
  const flash = createFlash();
  const build = (part) => {
    const mesh = holoPart(geometryOf(part), colors[part.role], flash);
    mesh.position.set(...part.center);
    return mesh;
  };

  // The rig (wizard-motion.js poses it): the body squashes and leans at the
  // feet; the head carries the eyes and hat, so they bob together; each hand
  // floats on its own. Parts keep their rest positions inside their groups.
  const parts = wizardParts();
  const [bodyPart, headPart, ...handParts] = parts.main.map(build);
  const eyes = createEyes();
  const headGroup = new Group().add(headPart, ...eyes);
  const hands = handParts.map((hand) => new Group().add(hand));
  const rig = new Group().add(bodyPart, headGroup, ...hands);

  const group = new Group().add(rig);
  group.userData.flash = flash;

  const hatGroup = new Group();
  hatGroup.position.y = WIZARD.brim.y;
  hatGroup.rotation.x = -WIZARD.hatTilt; // tip back (−z), brim front up
  hatGroup.add(...parts.hat.map(build));
  headGroup.add(hatGroup);
  group.userData.rig = { rig, head: headGroup, hands, hat: hatGroup, eyes };

  const bandMaterial = lineMaterial({ color: FRAGMENT_COLOR, width: 2.2, brightness: 1.8 });
  const rings = hatBands(bands).map(({ y, r }) => {
    const n = 28;
    const point = (i) => [Math.cos((i / n) * 2 * Math.PI) * r, y, Math.sin((i / n) * 2 * Math.PI) * r];
    const ring = neonLines(Array.from({ length: n }, (_, i) => [point(i), point(i + 1)]), bandMaterial);
    ring.visible = false;
    hatGroup.add(ring);
    return ring;
  });
  group.userData.setAccess = (level) => rings.forEach((ring, i) => (ring.visible = i < level));
  return group;
}
