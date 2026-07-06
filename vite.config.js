import { defineConfig } from 'vite';

// Vanilla JS + Three.js. public/ is served untouched so the .glb/.jpg assets
// are fetched by URL at runtime (see CLAUDE.md — loaders fetch by URL, Vite
// does not bundle these through JS import).
export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'esnext',
    // Keep the large 8K textures / GLBs out of the inline-asset path.
    assetsInlineLimit: 0,
  },
});
