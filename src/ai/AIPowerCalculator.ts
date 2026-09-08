/**
 * Force estimation.
 *
 * Works backwards from the outcome the AI wants, through the same friction and
 * mass model the simulation actually uses. It is an approximation — it ignores
 * spin, secondary collisions, and restitution against the rails — but every
 * term corresponds to real behaviour, so the AI's shots land in roughly the
 * right place and its misses are honest misses rather than random noise.
 */

import { PHYSICS_CONFIG, PIECE_GEOMETRY } from '../physics/PhysicsConfig';

/** Deceleration a sliding piece experiences, in world units per second². */
const DECELERATION = PHYSICS_CONFIG.BOARD_FRICTION * Math.abs(PHYSICS_CONFIG.GRAVITY_Y);

/**
 * Fraction of the striker's speed transferred along the line of centres.
 *
 * The general result is `(1+e)·m₁/(m₁+m₂)`, where `e` is the coefficient of
 * restitution. The first version used `2·m₁/(m₁+m₂)` — which is the *perfectly
 * elastic* case, e = 1. Coins are not perfectly elastic: at the configured
 * restitution of 0.55 the true factor is ≈1.13, not ≈1.46.
 *
 * Overstating transfer by ~29% meant every shot was planned with too little
 * force. Isolated testing showed it plainly: the ghost-ball aim was landing
 * correctly and coins were still stopping short of the pocket, or in the worst
 * cases not being reached at all.
 */
const TRANSFER =
  ((1 + PHYSICS_CONFIG.COIN_RESTITUTION) * PHYSICS_CONFIG.STRIKER_MASS) /
  (PHYSICS_CONFIG.STRIKER_MASS + PHYSICS_CONFIG.COIN_MASS);

export class AIPowerCalculator {
  /** Speed needed to slide `distance` and arrive with `arrivalSpeed` left. */
  static speedForDistance(distance: number, arrivalSpeed = 0): number {
    return Math.sqrt(Math.max(0, arrivalSpeed * arrivalSpeed + 2 * DECELERATION * distance));
  }

  /** How far a piece travels from a given speed before stopping. */
  static distanceForSpeed(speed: number): number {
    return (speed * speed) / (2 * DECELERATION);
  }

  /**
   * Normalised power (0–1) for a shot.
   *
   * Chain: the coin must reach the pocket, so it needs a departure speed; only
   * the component along the line of centres transfers, so a thin cut needs
   * proportionally more; and the striker must still be moving that fast *after*
   * crossing the gap to the coin.
   *
   * A margin is added because arriving with exactly zero speed means stopping
   * on the lip — the coin has to actually fall in.
   */
  static powerFor(
    strikerToImpact: number,
    coinToPocket: number,
    cutAngle: number,
  ): number {
    /*
     * Overshoot the pocket generously so the coin drops rather than resting on
     * the lip. Six radii rather than three: energy is also lost to the coin's
     * own spin and to grazing contacts the plan cannot foresee, and being a
     * little heavy costs position while being light costs the shot outright.
     */
    const coinSpeed = this.speedForDistance(coinToPocket + PIECE_GEOMETRY.coin.radius * 6);

    // A thin cut transfers less; cos falls away, so the required speed rises.
    // Clamped because at 90° the required speed is infinite and the shot is
    // simply impossible — the scorer will have rejected it long before here.
    const cosine = Math.max(0.25, Math.cos(cutAngle));
    const neededAtImpact = coinSpeed / (TRANSFER * cosine);

    // And the striker has to still be going that fast when it arrives.
    const launchSpeed = this.speedForDistance(strikerToImpact, neededAtImpact);

    const impulse = launchSpeed * PHYSICS_CONFIG.STRIKER_MASS;
    const span = PHYSICS_CONFIG.MAX_STRIKE_FORCE - PHYSICS_CONFIG.MIN_STRIKE_FORCE;
    return Math.min(1, Math.max(0, (impulse - PHYSICS_CONFIG.MIN_STRIKE_FORCE) / span));
  }
}
