import { defineConfig } from 'vite';

import { buildId } from './scripts/build-id.mjs';

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  server: {
    host: true, // expose on LAN so the game can be tested on a real phone
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    /*
     * Inline every asset, however large.
     *
     * The welcome artwork and the logo are the first asset files this game has
     * ever shipped — everything else, board wood to sound, is generated at
     * runtime. Vite's 4 KB default would emit them into `assets/` as separate
     * files, and `build:single` inlines only the JS, so the single-file build
     * would reference two images that are not in it. On GitHub Pages, which
     * serves exactly one index.html, that is a splash screen with no splash.
     *
     * Both builds set this, and they have to agree: a limit that differs
     * between them is a bug that only appears in the artifact nobody runs
     * locally.
     */
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
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
