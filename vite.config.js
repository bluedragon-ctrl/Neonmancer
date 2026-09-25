import { defineConfig } from 'vite';
import { dataValidation } from './tools/vite-plugin-data.js';

export default defineConfig({
  // Relative base so the build works on GitHub Pages (/Neonmancer/) and any other static host.
  base: './',
  plugins: [dataValidation()],
  build: {
    target: 'es2022',
    // three.js alone is about 600 kB; one bundle is fine for a game.
    chunkSizeWarningLimit: 1000,
  },
});
