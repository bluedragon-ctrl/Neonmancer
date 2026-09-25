import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages (/Neonmancer/) and any other static host.
  base: './',
  build: {
    target: 'es2022',
  },
});
