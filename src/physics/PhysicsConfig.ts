/**
 * Physics tunables.
 *
 * Carrom is a game of feel, so these values will be tuned by hand once pieces
 * are on the board (Phase 4–5). Everything the simulation needs lives here so
 * tuning never means hunting through systems.
 *
 * Units are world units (see `BoardConfig` — 10 world units per metre) and
 * seconds. Masses are in grams converted to kilograms, taken from regulation
 * pieces so relative momentum transfer is correct: a striker outweighs a coin
 * roughly 3:1, which is why it drives them rather than bouncing off.
 */

import { cm, UNITS } from '../config/GameConfig';

/** Real-world piece specifications, in centimetres and grams. */
export const PIECE_SPECS_CM = {
  coin: { diameter: 3.02, thickness: 0.75, grams: 5.5 },
  queen: { diameter: 3.02, thickness: 0.75, grams: 5.5 },
  striker: { diameter: 4.13, thickness: 0.9, grams: 15 },
} as const;

/** Derived collider dimensions, in world units. */
export const PIECE_GEOMETRY = {
  coin: {
    radius: cm(PIECE_SPECS_CM.coin.diameter) / 2,
    thickness: cm(PIECE_SPECS_CM.coin.thickness),
  },
  striker: {
    radius: cm(PIECE_SPECS_CM.striker.diameter) / 2,
    thickness: cm(PIECE_SPECS_CM.striker.thickness),
  },
} as const;

export const PHYSICS_CONFIG = {
  /**
   * Gravity, scaled by the same factor as distance so falls look right at
   * board scale. Only matters for pocket drops — play is planar.
   */
  GRAVITY_Y: -9.81 * UNITS.PER_METRE,

  /** Simulation runs at the same fixed rate as the game loop. */
  FIXED_TIME_STEP: 1 / 60,

  // ── Friction ────────────────────────────────────────────────────────────
  /** Board surface. The dominant term: it sets how far a coin travels. */
  BOARD_FRICTION: 0.14,
  COIN_FRICTION: 0.12,
  STRIKER_FRICTION: 0.1,
  /** Frame rails. Low, so rebounds keep their pace. */
  WALL_FRICTION: 0.08,

  // ── Restitution (bounciness) ────────────────────────────────────────────
  /** Coin-on-coin: a crisp click with real energy transfer. */
  COIN_RESTITUTION: 0.55,
  STRIKER_RESTITUTION: 0.5,
  /** Wooden rails absorb noticeably more than a coin does. */
  WALL_RESTITUTION: 0.45,

  // ── Damping ─────────────────────────────────────────────────────────────
  /**
   * Linear damping stands in for the surface drag that friction alone
   * under-models on a powdered board, and is what makes coins glide to a stop
   * rather than skate forever.
   */
  LINEAR_DAMPING: 0.55,
  /** Kept high — a spinning coin should settle quickly, as it does in reality. */
  ANGULAR_DAMPING: 1.4,

  // ── Mass ────────────────────────────────────────────────────────────────
  COIN_MASS: PIECE_SPECS_CM.coin.grams / 1000,
  QUEEN_MASS: PIECE_SPECS_CM.queen.grams / 1000,
  STRIKER_MASS: PIECE_SPECS_CM.striker.grams / 1000,

  // ── Rest detection ──────────────────────────────────────────────────────
  /**
   * Below this speed a body counts as stopped. A turn cannot be evaluated
   * until every body is under both thresholds.
   */
  VELOCITY_SLEEP_THRESHOLD: 0.05,
  ANGULAR_SLEEP_THRESHOLD: 0.12,
  /**
   * Bodies must stay under the thresholds for this long before rest is
   * declared, so a coin pausing at the apex of a collision is not mistaken for
   * a settled board.
   */
  REST_CONFIRMATION_SECONDS: 0.25,
  /**
   * Hard ceiling on a single shot's simulation. If the board somehow never
   * settles, the turn still ends instead of hanging the state machine.
   */
  MAX_SETTLE_SECONDS: 12,

  // ── Strike force ────────────────────────────────────────────────────────
  /** Impulse applied at power = 0. Enough to move a coin, never to score. */
  MIN_STRIKE_FORCE: 0.06,
  /** Impulse at power = 1. Clamped — a shot can never exceed this. */
  MAX_STRIKE_FORCE: 0.85,
  /**
   * Drag distance in world units that maps to full power. Beyond it the power
   * meter is pinned, so a long drag off-screen is not an accidental max shot.
   */
  MAX_DRAG_DISTANCE: 3.0,
  /**
   * Below this drag length the shot is discarded as a mis-tap rather than
   * fired at near-zero power.
   */
  MIN_DRAG_DISTANCE: 0.25,

  // ── Solver ──────────────────────────────────────────────────────────────
  /**
   * Contact stiffness. Coins are hard, near-rigid discs; the default is too
   * soft and lets fast strikers visibly overlap before separating.
   */
  CONTACT_STIFFNESS_RATIO: 0.35,
} as const;

export type PhysicsConfig = typeof PHYSICS_CONFIG;

/**
 * Map a normalised power (0–1) to a strike impulse.
 * Input is clamped, which is the single place the force ceiling is enforced.
 */
export const powerToImpulse = (power: number): number => {
  const clamped = Math.min(1, Math.max(0, power));
  const { MIN_STRIKE_FORCE, MAX_STRIKE_FORCE } = PHYSICS_CONFIG;
  return MIN_STRIKE_FORCE + (MAX_STRIKE_FORCE - MIN_STRIKE_FORCE) * clamped;
};

/**
 * Map a drag length in world units to normalised power (0–1).
 * Returns 0 for drags under `MIN_DRAG_DISTANCE` so mis-taps do not fire.
 */
export const dragToPower = (dragDistance: number): number => {
  const { MIN_DRAG_DISTANCE, MAX_DRAG_DISTANCE } = PHYSICS_CONFIG;
  if (dragDistance < MIN_DRAG_DISTANCE) return 0;
  const span = MAX_DRAG_DISTANCE - MIN_DRAG_DISTANCE;
  return Math.min(1, (dragDistance - MIN_DRAG_DISTANCE) / span);
};
