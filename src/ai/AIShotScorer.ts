/**
 * Candidate ranking.
 *
 * Scores what the AI can actually foresee — geometry, clearance, distance,
 * and the value of the target — not the outcome. It never simulates the shot,
 * so a high score is a *prediction*, and the AI is regularly wrong. That is the
 * point: a scorer that knew the result would be cheating.
 */

import type { AIShotCandidate } from './AIShotCandidate';
import type { AIConfig } from './AIConfig';
import { AITargetAnalyzer } from './AITargetAnalyzer';
import { PIECE_GEOMETRY } from '../physics/PhysicsConfig';
import { QueenState } from '../core/types';
import type { BoardSnapshot } from './AITargetAnalyzer';

export class AIShotScorer {
  static score(
    candidate: AIShotCandidate,
    snapshot: BoardSnapshot,
    config: AIConfig,
  ): AIShotCandidate {
    // ── Difficulty ────────────────────────────────────────────────────────
    // The cut angle dominates. cos falls off slowly near zero and fast near
    // 90°, which matches how quickly a cut becomes unmakeable.
    const angleEase = Math.cos(candidate.shotAngle);

    // Long shots compound every other error, so distance penalties are mild
    // individually but multiply with a poor angle.
    const distanceEase = 1 / (1 + candidate.targetDistance * 0.18);
    const reachEase = 1 / (1 + candidate.strikerDistance * 0.06);

    // A pocket-adjacent coin is nearly free; that is the shot to notice.
    const nearPocketBonus = candidate.targetDistance < PIECE_GEOMETRY.coin.radius * 8 ? 0.28 : 0;

    const clearance = 1 - candidate.pathObstruction;
    const difficulty = angleEase * distanceEase * reachEase * clearance;

    // ── Risk ──────────────────────────────────────────────────────────────
    // The striker keeps going after contact. If it is heading at a pocket, a
    // scratch is likely — the most expensive mistake available.
    const strikerEnd = {
      x: candidate.strikerPosition.x + candidate.requiredAimDirection.x * candidate.strikerDistance * 1.7,
      z: candidate.strikerPosition.z + candidate.requiredAimDirection.z * candidate.strikerDistance * 1.7,
    };
    const scratchRisk = AITargetAnalyzer.nearPocket(strikerEnd, PIECE_GEOMETRY.striker.radius * 2)
      ? 0.55
      : 0;

    // Heavy shots scatter the board and are harder to control.
    const powerRisk = Math.max(0, candidate.estimatedShotForce - 0.75) * 0.6;
    const risk = Math.min(1, scratchRisk + powerRisk + candidate.pathObstruction * 0.4);

    // ── Reward ────────────────────────────────────────────────────────────
    let reward = 1;
    if (candidate.isQueenShot) {
      // The Queen is worth more, but only to an AI that can follow up. A weak
      // AI taking her and failing to cover simply hands her back.
      reward =
        snapshot.queenState === QueenState.OnBoard
          ? 1 + config.queenStrategySkill * 1.4
          : 0;
    }

    const finalScore =
      difficulty * (1 + nearPocketBonus) * reward -
      risk * (1.2 - config.riskTolerance) -
      // A less skilled AI is worse at reading obstruction specifically.
      candidate.pathObstruction * (1 - config.trajectoryPredictionSkill) * 0.8;

    candidate.difficultyScore = difficulty;
    candidate.riskScore = risk;
    candidate.expectedReward = reward;
    candidate.finalScore = finalScore;
    return candidate;
  }

  /**
   * Rank and choose.
   *
   * `targetSelectionSkill` decides how often the top candidate is taken. A weak
   * AI picks further down its own ranking — the mistake is in the *choice*, so
   * the shot it then plays is executed honestly and simply happens to be worse.
   */
  static choose(
    candidates: AIShotCandidate[],
    config: AIConfig,
    random: () => number = Math.random,
  ): AIShotCandidate | null {
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.finalScore - a.finalScore);

    const pool = candidates.slice(0, Math.max(1, config.maxShotCandidates));
    if (random() < config.targetSelectionSkill) return pool[0] ?? null;

    // Otherwise take a worse one, biased toward the better end of the pool so
    // even a mistake is a plausible shot rather than a random flail.
    const spread = Math.min(pool.length - 1, Math.ceil(pool.length * 0.6));
    const index = 1 + Math.floor(random() * random() * spread);
    return pool[Math.min(index, pool.length - 1)] ?? pool[0] ?? null;
  }
}
