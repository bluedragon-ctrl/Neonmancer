import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages (/Neonmancer/) and any other static host.
  base: './',
  build: {
    target: 'es2022',
    // three.js alone is about 600 kB; one bundle is fine for a game.
    chunkSizeWarningLimit: 1000,
  },
});
