/**
 * Per-difficulty AI parameters.
 *
 * Every value here degrades *skill*, never the rules. The two that do most of
 * the work are `accuracy` (how tightly the aim vector lands on the computed
 * one) and `targetSelectionSkill` (how likely the AI is to take its own best
 * candidate rather than a worse one) — together they produce the difference
 * between an opponent that flails and one that punishes mistakes.
 */

import { AIDifficulty } from './AIDifficulty';

export interface AIConfig {
  /** 0–1. Aim error is `(1 − accuracy)` scaled; 1 would be perfect. */
  readonly accuracy: number;
  /** 0–1. How closely the applied force matches the computed one. */
  readonly powerAccuracy: number;
  readonly thinkingDelayMin: number;
  readonly thinkingDelayMax: number;
  /** Chance of a deliberate blunder — a badly chosen target, not a rigged miss. */
  readonly mistakeProbability: number;
  /** Weighting toward straightforward cuts over difficult angles. */
  readonly directShotSkill: number;
  readonly bankShotProbability: number;
  readonly queenStrategySkill: number;
  /** Willingness to take a shot that could leave the opponent well placed. */
  readonly riskTolerance: number;
  /** How well obstruction and rebound consequences are foreseen. */
  readonly trajectoryPredictionSkill: number;
  /** 0–1. Probability of picking the top-ranked candidate. */
  readonly targetSelectionSkill: number;
  /** Search width. A weak AI genuinely considers fewer options. */
  readonly maxShotCandidates: number;
  /**
   * How many top candidates to actually play out before choosing.
   *
   * Zero means the tier never looks ahead and commits to whatever its geometry
   * liked — which is what makes a weak AI weak in a way that feels human: it
   * misses because it did not foresee the consequence, not because its hands
   * shook.
   */
  readonly simulatedCandidates: number;
}

export const AI_CONFIGS: Record<AIDifficulty, AIConfig> = {
  [AIDifficulty.Easy]: {
    accuracy: 0.62,
    powerAccuracy: 0.6,
    thinkingDelayMin: 800,
    thinkingDelayMax: 1500,
    mistakeProbability: 0.32,
    directShotSkill: 0.45,
    bankShotProbability: 0.02,
    queenStrategySkill: 0.15,
    riskTolerance: 0.7,
    trajectoryPredictionSkill: 0.35,
    targetSelectionSkill: 0.4,
    maxShotCandidates: 10,
    simulatedCandidates: 0,
  },
  [AIDifficulty.Normal]: {
    accuracy: 0.8,
    powerAccuracy: 0.78,
    thinkingDelayMin: 700,
    thinkingDelayMax: 1200,
    mistakeProbability: 0.16,
    directShotSkill: 0.68,
    bankShotProbability: 0.06,
    queenStrategySkill: 0.45,
    riskTolerance: 0.5,
    trajectoryPredictionSkill: 0.6,
    targetSelectionSkill: 0.68,
    maxShotCandidates: 24,
    simulatedCandidates: 0,
  },
  [AIDifficulty.Hard]: {
    accuracy: 0.9,
    powerAccuracy: 0.88,
    thinkingDelayMin: 500,
    thinkingDelayMax: 1000,
    mistakeProbability: 0.07,
    directShotSkill: 0.84,
    bankShotProbability: 0.14,
    queenStrategySkill: 0.72,
    riskTolerance: 0.36,
    trajectoryPredictionSkill: 0.8,
    targetSelectionSkill: 0.85,
    maxShotCandidates: 48,
    simulatedCandidates: 6,
  },
  [AIDifficulty.Expert]: {
    // Deliberately short of perfect. A flawless opponent is not a hard
    // opponent, it is an unpleasant one — and the spec asks for occasional
    // natural mistakes.
    accuracy: 0.965,
    powerAccuracy: 0.95,
    thinkingDelayMin: 400,
    thinkingDelayMax: 800,
    mistakeProbability: 0.025,
    directShotSkill: 0.94,
    bankShotProbability: 0.28,
    queenStrategySkill: 0.92,
    riskTolerance: 0.22,
    trajectoryPredictionSkill: 0.93,
    targetSelectionSkill: 0.94,
    maxShotCandidates: 80,
    simulatedCandidates: 14,
  },
};

/** Debug overlay for AI decisions. Stripped from production by `IS_DEV`. */
export const AI_DEBUG = false;
