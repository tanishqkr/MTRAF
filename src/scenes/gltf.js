import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// Shared GLTF loader with Draco support. The NASA Perseverance GLB is
// Draco-compressed, so it needs a DRACOLoader with a decoder — the decoder is
// vendored under public/vendor/draco/ (copied from three's examples) so nothing
// is fetched from an external CDN at runtime.
let dracoLoader;

export function createGLTFLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/vendor/draco/');
  }
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  return loader;
}
