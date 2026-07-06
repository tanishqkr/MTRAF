import { MarsScene } from './scenes/MarsScene.js';
import { Choreographer } from './scroll/choreography.js';
import { initEditorial } from './sections/editorial.js';

async function boot() {
  // Editorial DOM is independent of the 3D scene — wire it up first so the page
  // is interactive even while the 8K textures / GLBs are still decoding.
  initEditorial();

  const canvas = document.getElementById('scene');
  const scene = new MarsScene(canvas);
  await scene.load();

  const choreographer = new Choreographer(scene);
  // Reduced motion → static frame (no continuous render loop); otherwise animate.
  if (choreographer.reducedMotion) scene.renderStatic();
  else scene.start();

  // Expose for debugging in the browser console.
  window.__mtra = { scene, choreographer };
}

boot().catch((err) => {
  console.error('[MTRA] boot failed:', err && err.stack ? err.stack : err);
  window.__bootErr = err && err.stack ? err.stack : String(err);
});
