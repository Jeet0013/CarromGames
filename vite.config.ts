import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // expose on LAN so the game can be tested on a real phone
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Three.js and Rapier are large and change rarely — split them out so
        // game-code edits do not invalidate the vendor chunk for returning players.
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('@dimforge/rapier3d-compat')) return 'rapier';
          return undefined;
        },
      },
    },
  },
});
