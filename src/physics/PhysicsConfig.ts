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
  /**
   * Coefficient of kinetic friction between a piece and the board.
   *
   * This is applied by hand each step as a constant deceleration `μ·g`
   * opposing motion, not as a Rapier contact friction. Pieces are constrained
   * to the play plane and therefore never touch a floor collider, so there is
   * no contact for the engine to apply surface friction at.
   *
   * It is also the more correct model. Coulomb friction decelerates a sliding
   * coin linearly and brings it to rest in finite time; exponential damping —
   * the usual shortcut — only ever approaches zero asymptotically, so coins
   * creep forever and rest detection degenerates into an arbitrary cutoff.
   */
  /*
   * Tuned down from 0.14 after play-testing: a 40-turn match produced a single
   * pocketed coin. At 0.14 the deceleration is ~13.7 u/s², so a coin struck at
   * 8 u/s stops after 2.3 units — while the board's half-diagonal is 5.2. Coins
   * were dying before they could reach a corner, which made pocketing almost
   * impossible rather than merely hard.
   *
   * 0.085 gives ~8.3 u/s², so the same strike carries 3.9 units and a firm one
   * crosses the board. That also matches how a real board behaves once it has
   * been powdered — which is the feel being aimed for.
   */
  BOARD_FRICTION: 0.085,
  /** Contact friction between two pieces, used by the solver. */
  COIN_FRICTION: 0.12,
  STRIKER_FRICTION: 0.1,
  /** Frame rails. Low, so rebounds keep their pace. */
  WALL_FRICTION: 0.08,
  /** Angular equivalent of `BOARD_FRICTION`; bleeds spin off a sliding coin. */
  SPIN_FRICTION: 1.7,

  // ── Restitution (bounciness) ────────────────────────────────────────────
  /** Coin-on-coin: a crisp click with real energy transfer. */
  COIN_RESTITUTION: 0.55,
  STRIKER_RESTITUTION: 0.5,
  /** Wooden rails absorb noticeably more than a coin does. */
  WALL_RESTITUTION: 0.45,

  // ── Damping ─────────────────────────────────────────────────────────────
  /**
   * Small velocity-proportional drag on top of Coulomb friction, standing in
   * for air resistance and the powder on a real board. Deliberately low —
   * `BOARD_FRICTION` does the real work of stopping a coin.
   */
  LINEAR_DAMPING: 0.07,
  ANGULAR_DAMPING: 0.4,

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
   *
   * 16s, up from 12. Powder now leaves the board 78% slicker, and at that
   * friction a striker at MAX_VELOCITY that never touches a rail takes a full
   * 12s to stop on its own — exactly the old ceiling. A shot that takes
   * precisely as long as the machine is willing to wait is a shot that gets
   * cut off, so the ceiling moved with it.
   *
   * This is not free: it is also how long a genuinely stuck board hangs before
   * the game recovers. Both numbers move together or neither should.
   */
  MAX_SETTLE_SECONDS: 16,

  // ── Velocity limits ─────────────────────────────────────────────────────
  /**
   * Hard speed ceiling, enforced after impulses and after every step.
   *
   * Primarily an anti-tunnelling measure: at 60 Hz a body moving faster than
   * `railThickness / dt` can pass through a rail between steps. The rails are
   * 0.65 units thick, so tunnelling needs ~39 u/s; 22 leaves a wide margin
   * while still allowing a shot to cross the 7.4-unit board and rebound.
   */
  MAX_VELOCITY: 22,

  // ── Strike force ────────────────────────────────────────────────────────
  /**
   * Impulse bounds, in kg·units/s. Divided by the striker's 0.015 kg mass
   * these give roughly 3 u/s at minimum power and 18 u/s at full.
   *
   * Sanity check against the friction model: at μ = 0.14 a piece decelerates
   * at μ·g ≈ 13.7 u/s², so a full-power shot travels v²/2a ≈ 11.8 units before
   * stopping — about 1.6 crossings of the 7.4-unit board, which is what a hard
   * Carrom shot does. The earlier untested value of 0.85 would have produced
   * 57 u/s: straight through a rail on the first frame.
   */
  MIN_STRIKE_FORCE: 0.045,
  /** Impulse at power = 1. Clamped — a shot can never exceed this. */
  MAX_STRIKE_FORCE: 0.27,
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
