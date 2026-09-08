/**
 * One shot the AI is considering.
 *
 * Deliberately plain data: the planner produces these, the scorer ranks them,
 * and the executor turns the chosen one into the same `ShotCommand` a human
 * drag produces. Nothing here can reach into physics.
 */

import type { BoardPoint } from '../core/types';

export interface AIShotCandidate {
  readonly targetCoinId: string;
  readonly targetCoinPosition: BoardPoint;
  readonly targetPocketIndex: number;
  readonly targetPocketPosition: BoardPoint;

  /** Where the striker must sit on the baseline. */
  readonly strikerPosition: BoardPoint;
  /** Unit vector the striker must travel. */
  readonly requiredAimDirection: BoardPoint;
  /** Normalised 0–1, before difficulty error. */
  readonly estimatedShotForce: number;

  /**
   * Cut angle in radians — between the striker's approach and the direction the
   * coin must leave. Zero is a straight-on shot; near 90° is a thin cut that
   * barely moves the coin. The single strongest predictor of difficulty.
   */
  readonly shotAngle: number;
  /** Coin → pocket distance. */
  readonly targetDistance: number;
  /** Striker → impact point distance. */
  readonly strikerDistance: number;
  /** 0 = clear, 1 = fully blocked. */
  readonly pathObstruction: number;

  difficultyScore: number;
  riskScore: number;
  expectedReward: number;
  finalScore: number;

  /** True when the target is the Queen. */
  readonly isQueenShot: boolean;
}
