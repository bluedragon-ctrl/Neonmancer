/**
 * The wizard model in the hologram look (D22): a cone body, a ball head,
 * two small floating ball hands and a pointy hat (cone + brim) tilted back,
 * so the isometric camera sees the face under the brim. Glowing eyes.
 *
 * The model stands on y = 0 around the y axis and looks along +z. It is
 * about 1.9 units tall; only the lower 1.5 is the hitbox (the hat is visual
 * only, D3). The hands float a little outside the hitbox.
 */
import { ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry } from 'three';
import { eyeMaterial, holoPart } from './holo.js';
import { PALETTE } from './neon.js';

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
 * @param {object} [colors]
 * @param {number|string} [colors.body] body cone
 * @param {number|string} [colors.head] head and hands
 * @param {number|string} [colors.hat]
 */
export function createWizard({ body = PALETTE.magenta, head = PALETTE.cyan, hat = PALETTE.magenta } = {}) {
  const colors = { body, head, hat };
  const build = (part) => {
    const mesh = holoPart(geometryOf(part), colors[part.role]);
    mesh.position.set(...part.center);
    return mesh;
  };

  const group = new Group();
  const parts = wizardParts();
  group.add(...parts.main.map(build), ...createEyes());

  const hatGroup = new Group();
  hatGroup.position.y = WIZARD.brim.y;
  hatGroup.rotation.x = -WIZARD.hatTilt; // tip back (−z), brim front up
  hatGroup.add(...parts.hat.map(build));
  group.add(hatGroup);
  return group;
}
