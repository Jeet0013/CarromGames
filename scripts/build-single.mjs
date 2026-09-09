/**
 * Build the whole game into one self-contained HTML file.
 *
 * The normal build splits Three.js and Rapier into separate chunks, which is
 * right for a served site but useless for a file that has to work standing
 * alone. This forces everything into a single IIFE and inlines it, so the
 * result can be hosted anywhere — or opened straight off disk — with no server,
 * no module resolution, and no network requests.
 *
 * The board wood, the markings and every sound are still generated at runtime.
 * The two exceptions are the welcome artwork and the logo, which are supplied
 * art — `assetsInlineLimit` below turns those into data URIs so this file
 * stays genuinely self-contained.
 *
 *   node scripts/build-single.mjs
 *   → dist-single/carrom-arena.html
 */

import { build } from 'vite';
import { buildId } from './build-id.mjs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = 'dist-single';

await build({
  configFile: false,
  root: process.cwd(),
  base: './',
  // `configFile: false` skips vite.config.ts, so the stamp has to be supplied
  // here too or this artifact would be the one that cannot identify itself.
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  build: {
    outDir: OUT_DIR,
    target: 'es2022',
    sourcemap: false,
    // Every asset becomes a data URI. Must match vite.config.ts — see the note
    // there. Without it the two images below are emitted as separate files and
    // this "self-contained" artifact quietly is not.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    // Keep the module graph in one file. Code splitting would emit imports
    // that an inlined <script> cannot resolve.
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'bundle.js',
        format: 'iife',
      },
    },
  },
});

// Locate the emitted bundle.
const assetDir = join(OUT_DIR, 'assets');
let bundlePath = join(OUT_DIR, 'bundle.js');
try {
  const files = await readdir(assetDir);
  const js = files.find((f) => f.endsWith('.js'));
  if (js) bundlePath = join(assetDir, js);
} catch {
  // No assets directory — the bundle sits at the root.
}

const script = await readFile(bundlePath, 'utf8');
const source = await readFile('index.html', 'utf8');

// The artifact host supplies <!doctype>, <html>, <head> and <body>, so only
// the inner content is emitted here: title, styles, the mount point, and the
// inlined bundle.
//
// The head metadata is carried over too, and that is not optional. When this
// file is served raw — which is exactly what GitHub Pages does — the browser
// builds its own <head>, and without a viewport meta iOS Safari falls back to a
// 980px layout viewport and scales the whole page down to fit. Everything looks
// correct but shrunken, and no amount of CSS fixes it. Emulators do not catch
// this because they set the viewport directly and never consult the tag.
const title = /<title>([\s\S]*?)<\/title>/.exec(source)?.[1] ?? 'Carrom Arena 3D';

// Carried verbatim from index.html so the two builds cannot drift apart.
const metas = [...source.matchAll(/<meta\s[^>]*>/g)]
  .map((match) => match[0])
  .filter((tag) => !tag.includes('charset'))
  .join('\n');
const style = /<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '';
const body = /<div id="app">([\s\S]*?)<\/div>\s*<script/.exec(source)?.[1] ?? '';

// `</script>` inside the bundle would close the tag early and break the page.
const safeScript = script.replace(/<\/script>/gi, '<\\/script>');

// Inline the favicon as a data URI. The host supplies the <head>, so a
// `<link href="/favicon.svg">` would not resolve — and without any icon the
// browser falls back to requesting /favicon.ico and logging a 404.
let favicon = '';
try {
  const svg = await readFile('public/favicon.svg', 'utf8');
  favicon = `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg)}">\n`;
} catch {
  // No favicon on disk; the page is still valid without one.
}

const html = `<meta charset="UTF-8">
${metas}
${favicon}<title>${title}</title>
<style>
/* The host resets body margin but not overflow; the board owns the viewport. */
html, body { height: 100%; overflow: hidden; }
${style}
</style>

<div id="app">${body}</div>

<script>
${safeScript}
</script>
`;

await mkdir(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, 'carrom-arena.html');
await writeFile(outPath, html, 'utf8');

const mb = (html.length / 1024 / 1024).toFixed(2);
console.log(`\n✓ ${outPath} — ${mb} MB, self-contained`);
