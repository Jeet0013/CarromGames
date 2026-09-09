/**
 * Global game configuration.
 *
 * Tunables live in config modules, never as literals scattered through
 * systems. Physics values belong in `physics/PhysicsConfig.ts` and board
 * geometry in `board/BoardConfig.ts`; this file holds everything else.
 */

import { AimMode, Difficulty, QualityTier } from '../core/types';

/**
 * True in `vite dev`, false in a production build.
 *
 * `import.meta.env.DEV` is statically replaced at build time, so every branch
 * guarded by this constant is dropped from the production bundle. Debug
 * tooling must sit behind it.
 */
export const IS_DEV: boolean = import.meta.env.DEV;

/** World-unit conversion. See `BoardConfig` for why the board is not in metres. */
export const UNITS = {
  /** World units per real-world metre. A 74 cm board becomes 7.4 units wide. */
  PER_METRE: 10,
} as const;

/** Convert a real-world measurement in centimetres to world units. */
export const cm = (centimetres: number): number => (centimetres / 100) * UNITS.PER_METRE;

/** Substituted by Vite at build time; see `vite.config.ts`. */
declare const __BUILD_ID__: string | undefined;

export const GAME_CONFIG = {
  name: 'Carrom Arena 3D',
  version: '0.1.0',
  /**
   * Identifies the build itself, not the release.
   *
   * Shown on the splash because the thing being tested is usually on a phone
   * at the far end of a share link, and "which build is that?" should not need
   * asking.
   */
  build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev',

  /**
   * Fixed simulation step. Physics and the rule machine advance in whole steps
   * so behaviour is frame-rate independent — the same shot resolves the same
   * way at 30 and 144 FPS, which also keeps a future networked build sane.
   */
  simulation: {
    /** 60 Hz. */
    fixedTimeStepMs: 1000 / 60,
    /**
     * Ceiling on catch-up steps after a stall (tab backgrounded, GC pause).
     * Without it the loop spirals trying to replay lost seconds.
     */
    maxStepsPerFrame: 5,
  },

  /** Frame-rate targets from the scope, used by the perf overlay in dev. */
  performance: {
    desktopTargetFps: 60,
    mobileMinimumFps: 30,
  },

  /** Defaults for a fresh profile; `SaveManager` overrides from localStorage. */
  defaultSettings: {
    musicEnabled: true,
    sfxEnabled: true,
    aimMode: AimMode.Assisted,
    quality: QualityTier.High,
    cameraEffects: true,
  },

  /** Default AI strength for Quick Match before the player chooses. */
  defaultDifficulty: Difficulty.Normal,
} as const;

/**
 * Per-tier renderer cost. `Renderer` reads these; nothing else should branch on
 * the quality tier directly.
 */
export const QUALITY_PRESETS = {
  [QualityTier.Low]: {
    shadowsEnabled: false,
    shadowMapSize: 0,
    /** Hard ceiling on devicePixelRatio — the main mobile GPU cost. */
    maxPixelRatio: 1,
    antialias: false,
    maxParticles: 24,
  },
  [QualityTier.Medium]: {
    shadowsEnabled: true,
    shadowMapSize: 1024,
    maxPixelRatio: 1.5,
    antialias: true,
    maxParticles: 64,
  },
  [QualityTier.High]: {
    shadowsEnabled: true,
    shadowMapSize: 2048,
    maxPixelRatio: 2,
    antialias: true,
    maxParticles: 128,
  },
} as const satisfies Record<QualityTier, QualityPreset>;

export interface QualityPreset {
  readonly shadowsEnabled: boolean;
  readonly shadowMapSize: number;
  readonly maxPixelRatio: number;
  readonly antialias: boolean;
  readonly maxParticles: number;
}

/**
 * Debug overlays. Every flag is forced off in production by `IS_DEV`, so a
 * stray `true` committed here cannot leak into a shipped build.
 */
export const DEBUG_CONFIG = {
  enabled: IS_DEV,
  showPhysicsColliders: false,
  showPocketSensors: false,
  showVelocities: false,
  showAimVectors: false,
  showAITargets: false,
  showStats: IS_DEV,
} as const;
