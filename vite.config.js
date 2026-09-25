import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { dataValidation } from './tools/vite-plugin-data.js';

export default defineConfig({
  // Relative base so the build works on GitHub Pages (/Neonmancer/) and any other static host.
  base: './',
  plugins: [dataValidation()],
  // PORT lets several worktrees run dev servers side by side (preview tools set it).
  server: { port: Number(process.env.PORT) || 5173 },
  build: {
    target: 'es2022',
    // three.js alone is about 600 kB; one bundle is fine for a game.
    chunkSizeWarningLimit: 1000,
    // The asset showcase is deployed too, so looks can be reviewed online.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        showcase: fileURLToPath(new URL('tools/showcase.html', import.meta.url)),
      },
    },
  },
});
