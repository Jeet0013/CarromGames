/**
 * Top-face markings for the pieces.
 *
 * A plain coloured disc is hard to read from a near-overhead camera: white
 * coins and the white striker were the same object at a glance, and the two
 * coin colours only differed by brightness, which fails the moment the board is
 * in shadow. Real Carrom pieces are turned on a lathe and carry concentric
 * grooves, and the striker is banded — so the markings that make them
 * identifiable in the hand are the same ones that make them identifiable here.
 *
 * Drawn to canvases at runtime, like the board, so the game still ships no
 * image assets.
 */

import * as THREE from 'three';

/** Face texture resolution. Small — these are ~30px on screen. */
const SIZE = 256;

interface RingSpec {
  /** Radius as a fraction of the disc. */
  readonly at: number;
  readonly width: number;
  readonly color: string;
}

interface FaceSpec {
  readonly base: string;
  readonly rim: string;
  readonly rings: readonly RingSpec[];
  /** Optional centre dot. */
  readonly centre?: { readonly radius: number; readonly color: string };
}

/**
 * Light coin: warm ivory with fine darker grooves.
 *
 * The grooves are what separate it from the striker at a glance — the striker
 * is banded and noticeably larger, the coin is quietly turned.
 */
const LIGHT_COIN: FaceSpec = {
  base: '#e9dabb',
  rim: 'rgba(120, 88, 48, 0.55)',
  rings: [
    { at: 0.82, width: 0.035, color: 'rgba(120, 88, 48, 0.38)' },
    { at: 0.6, width: 0.022, color: 'rgba(120, 88, 48, 0.26)' },
    { at: 0.36, width: 0.02, color: 'rgba(120, 88, 48, 0.22)' },
  ],
  centre: { radius: 0.1, color: 'rgba(120, 88, 48, 0.3)' },
};

/**
 * Dark coin: the same turning, picked out in warm highlights.
 *
 * Lighter rings rather than darker ones — on a near-black disc, darker grooves
 * are invisible, so the contrast has to run the other way.
 */
const DARK_COIN: FaceSpec = {
  base: '#2a1d13',
  rim: 'rgba(214, 178, 126, 0.5)',
  rings: [
    { at: 0.82, width: 0.035, color: 'rgba(214, 178, 126, 0.42)' },
    { at: 0.6, width: 0.022, color: 'rgba(214, 178, 126, 0.3)' },
    { at: 0.36, width: 0.02, color: 'rgba(214, 178, 126, 0.24)' },
  ],
  centre: { radius: 0.1, color: 'rgba(214, 178, 126, 0.34)' },
};

/** The Queen keeps her red, with gold turning so she reads as the prize. */
const QUEEN: FaceSpec = {
  base: '#9e1f18',
  rim: 'rgba(240, 200, 120, 0.75)',
  rings: [
    { at: 0.8, width: 0.05, color: 'rgba(240, 200, 120, 0.6)' },
    { at: 0.55, width: 0.028, color: 'rgba(240, 200, 120, 0.4)' },
  ],
  centre: { radius: 0.16, color: 'rgba(240, 200, 120, 0.55)' },
};

/**
 * The striker: ivory, boldly banded in red.
 *
 * This is the piece the player moves, and it has to be findable instantly. A
 * strong red band plus a red centre does that, and it matches how a real
 * striker is marked — the rings are what a player lines a shot up against.
 */
const STRIKER: FaceSpec = {
  base: '#f4efe3',
  rim: 'rgba(70, 70, 76, 0.55)',
  rings: [
    { at: 0.86, width: 0.07, color: 'rgba(198, 42, 34, 0.9)' },
    { at: 0.7, width: 0.028, color: 'rgba(70, 70, 76, 0.35)' },
    { at: 0.5, width: 0.05, color: 'rgba(198, 42, 34, 0.55)' },
    { at: 0.3, width: 0.024, color: 'rgba(70, 70, 76, 0.3)' },
  ],
  centre: { radius: 0.13, color: 'rgba(198, 42, 34, 0.85)' },
};

export const FACE_SPECS = {
  light: LIGHT_COIN,
  dark: DARK_COIN,
  queen: QUEEN,
  striker: STRIKER,
} as const;
export type FaceKind = keyof typeof FACE_SPECS;

/** Draw one face and wrap it as a texture. */
export function createFaceTexture(kind: FaceKind): THREE.CanvasTexture {
  const spec = FACE_SPECS[kind];
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const c = SIZE / 2;
    const r = SIZE / 2;

    // Everything outside the disc stays transparent, so the decal can sit on a
    // round piece without a square edge showing.
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Base, with a soft top-left lift so the disc reads as convex rather than
    // as a flat sticker.
    const shade = ctx.createRadialGradient(c * 0.78, c * 0.74, r * 0.1, c, c, r);
    shade.addColorStop(0, lighten(spec.base, 16));
    shade.addColorStop(0.65, spec.base);
    shade.addColorStop(1, darken(spec.base, 14));
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(c, c, r * 0.985, 0, Math.PI * 2);
    ctx.fill();

    // Turned grooves.
    for (const ring of spec.rings) {
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width * SIZE;
      ctx.beginPath();
      ctx.arc(c, c, r * ring.at, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (spec.centre) {
      ctx.fillStyle = spec.centre.color;
      ctx.beginPath();
      ctx.arc(c, c, r * spec.centre.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rim line last, so it sits over everything and defines the silhouette.
    ctx.strokeStyle = spec.rim;
    ctx.lineWidth = SIZE * 0.02;
    ctx.beginPath();
    ctx.arc(c, c, r * 0.965, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function mix(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const num = Number.parseInt(value, 16);
  const clamp = (n: number): number => Math.min(255, Math.max(0, n));
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const lighten = (hex: string, amount: number): string => mix(hex, amount);
const darken = (hex: string, amount: number): string => mix(hex, -amount);
