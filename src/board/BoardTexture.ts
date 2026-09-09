/**
 * Procedural board textures.
 *
 * The playing surface and its markings are generated into a canvas at runtime
 * rather than shipped as image assets. Three reasons this is the right call
 * here:
 *
 * 1. **No download.** A 2K board texture would be a ~1.5 MB PNG; this costs a
 *    few milliseconds of canvas work and nothing over the network.
 * 2. **Markings stay in sync with `BoardConfig`.** Every line is drawn from the
 *    same regulation measurements the physics will use, so a tuning change to
 *    the baseline position cannot leave the paint and the rules disagreeing —
 *    which is exactly the bug a baked texture invites.
 * 3. **Resolution follows the quality tier**, so a low-end phone is not asked
 *    to hold a 2048² texture.
 *
 * Everything is drawn in board space (world units, origin at the centre) via
 * `toCanvas`, so the drawing code reads in the same coordinates as the rest of
 * the game.
 */

import * as THREE from 'three';

import { BOARD_CONFIG, POCKET_POSITIONS } from './BoardConfig';
import { QualityTier } from '../core/types';

/** Texture resolution per quality tier. */
const TEXTURE_SIZE: Record<QualityTier, number> = {
  [QualityTier.Low]: 1024,
  [QualityTier.Medium]: 2048,
  [QualityTier.High]: 2048,
};

const PALETTE = {
  /** Pale polished plywood, as a real playing surface is. */
  surfaceLight: '#e8cfa6',
  surfaceMid: '#dcbe91',
  surfaceDark: '#c9a877',
  /** Grain streaks. */
  grain: 'rgba(120, 84, 46, 0.10)',
  /** Painted lines — dark brown rather than pure black, which reads as ink. */
  line: 'rgba(58, 38, 20, 0.85)',
  lineSoft: 'rgba(58, 38, 20, 0.42)',
  /** Regulation red for base circles and the centre accent. */
  red: 'rgba(168, 42, 34, 0.9)',
  redSoft: 'rgba(168, 42, 34, 0.35)',
  /** Darkening around each pocket, as wear on a real board. */
  pocketShade: 'rgba(48, 30, 14, 0.5)',
} as const;

export interface BoardTextures {
  readonly map: THREE.CanvasTexture;
  readonly roughnessMap: THREE.CanvasTexture;
  dispose(): void;
}

/**
 * Frame textures — darker, coarser stock than the playing surface.
 *
 * The rails were initially a flat colour and read as moulded plastic against
 * the textured surface. Giving them their own grain, at a coarser frequency
 * and higher contrast, is what makes them read as solid timber.
 */
export function createFrameTextures(quality: QualityTier): BoardTextures {
  const size = Math.max(512, TEXTURE_SIZE[quality] / 2);

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d');

  if (!ctx || !rctx) throw new Error('2D canvas context unavailable');

  /*
   * Deep red lacquer, not brown timber.
   *
   * Matched to the supplied welcome artwork, where the frame is a dark crimson
   * lacquer against a warm wooden table — the two reading as different
   * materials is most of what gives that board its weight. A brown frame on a
   * brown table has nothing to separate it but value.
   *
   * The grain tint stays a near-black brown rather than a dark red: lacquer is
   * a finish over timber, so what shows through the colour is still wood.
   */
  paintWood(
    ctx,
    rctx,
    size,
    {
      light: '#8b2624',
      mid: '#6b191b',
      dark: '#3e0e11',
      grainRgb: [34, 12, 9],
    },
    // Deeper and less saturated than the first pass, which came out closer to
    // a bright plastic red than to lacquered timber. Lacquer is dark; what
    // makes it read as lacquer is the sheen on top, not the hue underneath.
    { frequency: 0.012, contrast: 0.36, baseRoughness: 92, vignette: 0.36 },
    17,
  );

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false;
  map.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.flipY = false;

  return {
    map,
    roughnessMap,
    dispose(): void {
      map.dispose();
      roughnessMap.dispose();
    },
  };
}

/**
 * Deterministic value noise.
 *
 * Seeded rather than `Math.random` so the grain is identical every load —
 * a board that reshuffles its wood pattern on refresh looks like a bug.
 */
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  // Smoothstep interpolation — bilinear alone leaves visible grid seams.
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);

  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Fractal noise — a few octaves give wood its coarse-plus-fine structure. */
function fbm(x: number, y: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise(x * frequency, y * frequency) * amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return value;
}

/**
 * Build the surface colour map and a matching roughness map.
 *
 * The roughness map is derived from the same grain, so the varnish catches
 * light along the grain rather than uniformly — the detail that stops the wood
 * reading as a flat brown plane under the key light.
 */
export function createBoardTextures(quality: QualityTier): BoardTextures {
  const size = TEXTURE_SIZE[quality];
  const half = BOARD_CONFIG.halfSurface;

  /** Board space (world units) → canvas pixels. */
  const toCanvas = (value: number): number => ((value + half) / (2 * half)) * size;
  /** Length in world units → length in canvas pixels. */
  const scale = (length: number): number => (length / (2 * half)) * size;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d');

  if (!ctx || !rctx) throw new Error('2D canvas context unavailable');

  drawWoodGrain(ctx, rctx, size);
  drawPocketWear(ctx, toCanvas, scale);
  drawMarkings(ctx, toCanvas, scale);

  const map = new THREE.CanvasTexture(colorCanvas);
  // Colour maps must be tagged sRGB or the renderer treats them as linear and
  // the wood comes out washed out and pale.
  map.colorSpace = THREE.SRGBColorSpace;
  // UVs are generated in board space with +Z downward on the canvas, so the
  // texture must not be flipped again.
  map.flipY = false;
  map.anisotropy = 8;
  map.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.flipY = false;
  roughnessMap.needsUpdate = true;

  return {
    map,
    roughnessMap,
    dispose(): void {
      map.dispose();
      roughnessMap.dispose();
    },
  };
}

interface WoodPalette {
  readonly light: string;
  readonly mid: string;
  readonly dark: string;
  /** RGB triple for the grain streaks. */
  readonly grainRgb: readonly [number, number, number];
}

interface WoodOptions {
  /** Grain frequency across the board. Higher = tighter grain. */
  readonly frequency: number;
  /** Peak opacity of a grain streak. */
  readonly contrast: number;
  /** Base roughness value written to the roughness map (0–255). */
  readonly baseRoughness: number;
  /** Vignette strength toward the edges. */
  readonly vignette: number;
}

/**
 * Paint wood into a colour canvas and a matching roughness canvas.
 *
 * The grain is drawn as *irregularly spaced* streaks rather than a value
 * sampled per scanline. Per-scanline sampling was the first approach and it
 * produced visible corduroy banding: every row got some ink, so the eye read
 * the regular spacing rather than the wood. Real grain is sparse — a few
 * strong lines with clean timber between them — so streak positions now walk
 * forward by a noise-driven gap, and each streak gets its own width and
 * opacity.
 */
function paintWood(
  ctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  size: number,
  palette: WoodPalette,
  options: WoodOptions,
  seed = 0,
): void {
  const base = ctx.createLinearGradient(0, 0, size * 0.35, size);
  base.addColorStop(0, palette.light);
  base.addColorStop(0.5, palette.mid);
  base.addColorStop(1, palette.dark);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const r = palette.grainRgb[0];
  const g = palette.grainRgb[1];
  const b = palette.grainRgb[2];

  rctx.fillStyle = `rgb(${options.baseRoughness},${options.baseRoughness},${options.baseRoughness})`;
  rctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.lineCap = 'butt';

  // Walk down the canvas placing streaks at noise-driven intervals.
  let y = 0;
  let index = 0;
  while (y < size) {
    const n = fbm(y * options.frequency + seed, seed * 3.1 + 0.5, 4);
    const strength = Math.pow(n, 1.7); // bias toward faint lines
    const width = size * (0.0008 + strength * 0.0045);
    const alpha = strength * options.contrast;

    // Each streak wanders slightly rather than running dead straight — a
    // perfectly straight line reads as a printed rule, not as timber.
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    const segments = 8;
    for (let s = 0; s <= segments; s += 1) {
      const x = (s / segments) * size;
      const drift = (fbm(x * 0.0025 + index, y * 0.01 + seed, 3) - 0.5) * size * 0.012;
      if (s === 0) ctx.moveTo(x, y + drift);
      else ctx.lineTo(x, y + drift);
    }
    ctx.stroke();

    // Grain scatters light more than the varnish between it.
    const rough = Math.min(255, options.baseRoughness + strength * 70);
    rctx.strokeStyle = `rgb(${rough | 0},${rough | 0},${rough | 0})`;
    rctx.lineWidth = width * 1.5;
    rctx.beginPath();
    rctx.moveTo(0, y);
    rctx.lineTo(size, y);
    rctx.stroke();

    // Irregular gap: this is what breaks the banding.
    y += size * (0.004 + fbm(index * 0.7, seed, 2) * 0.014);
    index += 1;
  }
  ctx.restore();

  // Vignette — light falls off toward the rails.
  const vignette = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.28,
    size / 2,
    size / 2,
    size * 0.74,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(46, 28, 12, ${options.vignette})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);
}

/** Playing surface: pale polished ply with fine, sparse grain. */
function drawWoodGrain(
  ctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  size: number,
): void {
  paintWood(
    ctx,
    rctx,
    size,
    {
      light: PALETTE.surfaceLight,
      mid: PALETTE.surfaceMid,
      dark: PALETTE.surfaceDark,
      grainRgb: [126, 88, 48],
    },
    { frequency: 0.02, contrast: 0.2, baseRoughness: 150, vignette: 0.2 },
    0,
  );
}

/** Darkened haloes where coins are dragged into the pockets over years of play. */
function drawPocketWear(
  ctx: CanvasRenderingContext2D,
  toCanvas: (v: number) => number,
  scale: (v: number) => number,
): void {
  const wearRadius = scale(BOARD_CONFIG.pocket.radius * 2.6);
  for (const pocket of POCKET_POSITIONS) {
    const cx = toCanvas(pocket.x);
    const cy = toCanvas(pocket.z);
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, wearRadius);
    halo.addColorStop(0, PALETTE.pocketShade);
    halo.addColorStop(1, 'rgba(48, 30, 14, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, wearRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Regulation markings.
 *
 * Drawn straight from `BOARD_CONFIG`, so the painted baseline and the line the
 * striker is actually clamped to are guaranteed to be the same line.
 */
function drawMarkings(
  ctx: CanvasRenderingContext2D,
  toCanvas: (v: number) => number,
  scale: (v: number) => number,
): void {
  const { markings, baseline } = BOARD_CONFIG;
  const lineWidth = Math.max(1.5, scale(markings.lineWidth));

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ── Centre circles ──────────────────────────────────────────────────────
  const centre = toCanvas(0);

  // Outer ring.
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(centre, centre, scale(markings.centerCircleOuterRadius), 0, Math.PI * 2);
  ctx.stroke();

  // Decorative inner ring, offset slightly inside the outer one.
  ctx.strokeStyle = PALETTE.lineSoft;
  ctx.lineWidth = lineWidth * 0.7;
  ctx.beginPath();
  ctx.arc(centre, centre, scale(markings.centerCircleOuterRadius * 0.86), 0, Math.PI * 2);
  ctx.stroke();

  // The small centre circle — where the Queen is placed.
  ctx.fillStyle = PALETTE.redSoft;
  ctx.beginPath();
  ctx.arc(centre, centre, scale(markings.centerCircleInnerRadius), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.red;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Eight short spokes between the rings — the "sun" motif on a real board.
  ctx.strokeStyle = PALETTE.lineSoft;
  ctx.lineWidth = lineWidth * 0.8;
  const spokeInner = scale(markings.centerCircleOuterRadius * 0.86);
  const spokeOuter = scale(markings.centerCircleOuterRadius);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.beginPath();
    ctx.moveTo(centre + Math.cos(angle) * spokeInner, centre + Math.sin(angle) * spokeInner);
    ctx.lineTo(centre + Math.cos(angle) * spokeOuter, centre + Math.sin(angle) * spokeOuter);
    ctx.stroke();
  }

  // ── Baselines, one per side ─────────────────────────────────────────────
  // Each side gets two parallel rules with a red base circle at each end.
  const halfLength = baseline.halfLength;
  const distance = baseline.distanceFromCenter;
  const separation = baseline.separation;

  for (let side = 0; side < 4; side += 1) {
    // side 0 = +Z (Player One), 1 = -Z, 2 = +X, 3 = -X
    const vertical = side < 2;
    const sign = side % 2 === 0 ? 1 : -1;

    for (const offset of [-separation / 2, separation / 2]) {
      const axis = sign * distance + offset * sign;
      ctx.strokeStyle = PALETTE.line;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(toCanvas(-halfLength), toCanvas(axis));
        ctx.lineTo(toCanvas(halfLength), toCanvas(axis));
      } else {
        ctx.moveTo(toCanvas(axis), toCanvas(-halfLength));
        ctx.lineTo(toCanvas(axis), toCanvas(halfLength));
      }
      ctx.stroke();
    }

    // Red base circles capping the ends of the baseline.
    for (const end of [-halfLength, halfLength]) {
      const cx = vertical ? toCanvas(end) : toCanvas(sign * distance);
      const cy = vertical ? toCanvas(sign * distance) : toCanvas(end);

      const circleRadius = scale(markings.baseCircleRadius);

      // Solid red, as painted on a real board. An earlier version drew a pale
      // core, which turned each circle into a donut and read as decoration
      // rather than a placement mark.
      ctx.fillStyle = PALETTE.red;
      ctx.beginPath();
      ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
      ctx.fill();

      // Darker rim so the circle sits in the wood instead of floating on it.
      ctx.strokeStyle = 'rgba(112, 26, 20, 0.55)';
      ctx.lineWidth = lineWidth * 0.9;
      ctx.stroke();
    }
  }

  // ── Corner arrows ───────────────────────────────────────────────────────
  // The diagonal arrows that point from each corner in toward the centre.
  ctx.strokeStyle = PALETTE.lineSoft;
  ctx.lineWidth = lineWidth * 1.1;

  const arrowStart = BOARD_CONFIG.halfSurface * 0.52;
  const arrowEnd = BOARD_CONFIG.halfSurface * 0.3;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = toCanvas(sx * arrowStart);
      const y0 = toCanvas(sz * arrowStart);
      const x1 = toCanvas(sx * arrowEnd);
      const y1 = toCanvas(sz * arrowEnd);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // Arrowhead, drawn perpendicular to the diagonal.
      const head = scale(BOARD_CONFIG.markings.baseCircleRadius * 0.9);
      const angle = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(
        x1 - Math.cos(angle - Math.PI / 7) * head,
        y1 - Math.sin(angle - Math.PI / 7) * head,
      );
      ctx.moveTo(x1, y1);
      ctx.lineTo(
        x1 - Math.cos(angle + Math.PI / 7) * head,
        y1 - Math.sin(angle + Math.PI / 7) * head,
      );
      ctx.stroke();
    }
  }
}
