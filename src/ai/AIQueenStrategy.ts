/**
 * Whether the AI should go for the Queen.
 *
 * Taking the Queen without being able to cover her is worse than leaving her:
 * she returns to the centre and the turn is spent. So the decision is not "can
 * I hit her" but "can I hit her *and* follow up" — which is exactly the
 * judgement that separates a strong Carrom player from a greedy one.
 */

import type { AIConfig } from './AIConfig';
import type { BoardSnapshot } from './AITargetAnalyzer';
import type { AIShotCandidate } from './AIShotCandidate';
import { QueenState } from '../core/types';

export class AIQueenStrategy {
  /**
   * Should the AI attempt the Queen at all this turn?
   *
   * Requires a covering coin to exist, and scales willingness by skill. A weak
   * AI mostly ignores her; an expert takes her when it has follow-up available.
   */
  static shouldAttempt(
    snapshot: BoardSnapshot,
    config: AIConfig,
    random: () => number = Math.random,
  ): boolean {
    if (snapshot.queenState !== QueenState.OnBoard) return false;
    if (!snapshot.queen) return false;

    // No coin left to cover with means the Queen cannot be kept.
    const coverAvailable = snapshot.ownCoins.length > 0;
    if (!coverAvailable) return false;

    // With only one own coin left, taking the Queen risks the last-coin foul.
    if (snapshot.ownCoins.length <= 1 && config.queenStrategySkill > 0.5) return false;

    return random() < config.queenStrategySkill;
  }

  /**
   * Must the AI cover *right now*?
   *
   * When a cover is owed, a Queen candidate is meaningless and own coins become
   * the only shots worth taking — so this overrides normal target scoring.
   */
  static mustCover(snapshot: BoardSnapshot): boolean {
    return snapshot.queenState === QueenState.PocketedPendingCover;
  }

  /** Drop or demote Queen candidates the strategy has decided against. */
  static filter(
    candidates: AIShotCandidate[],
    attemptQueen: boolean,
    mustCover: boolean,
  ): AIShotCandidate[] {
    if (mustCover) {
      // Only an own coin discharges the obligation.
      const covers = candidates.filter((c) => !c.isQueenShot);
      return covers.length > 0 ? covers : candidates;
    }
    if (attemptQueen) return candidates;
    return candidates.filter((c) => !c.isQueenShot);
  }
}
