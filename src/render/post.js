/**
 * Post-processing chain (pmndrs postprocessing). Effects are merged into as
 * few passes as possible: one render pass plus one effect pass. Phase 1 only
 * has bloom; more effects join the same EffectPass later.
 */
import { HalfFloatType } from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 * @param {{ multisampling?: number }} [options] MSAA samples, 0 for none
 */
export function createComposer(renderer, scene, camera, { multisampling = 4 } = {}) {
  // Half float keeps colors brighter than 1 for the bloom; multisampling
  // smooths the line edges.
  const composer = new EffectComposer(renderer, {
    frameBufferType: HalfFloatType,
    multisampling,
  });
  composer.addPass(new RenderPass(scene, camera));

  // Mipmap blur is relative to the render size, so the glow radius scales
  // with resolution by itself.
  const bloom = new BloomEffect({
    mipmapBlur: true,
    intensity: 1.4,
    luminanceThreshold: 0.12,
    luminanceSmoothing: 0.25,
    radius: 0.7,
  });
  composer.addPass(new EffectPass(camera, bloom));
  return composer;
}
