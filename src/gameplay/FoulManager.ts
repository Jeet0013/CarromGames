/**
 * Foul detection and penalties.
 *
 * Pure: given the state, the outcome, and a ruleset, it says which fouls were
 * committed and what they cost. It never touches the board — penalties come
 * back as requests the caller carries out.
 */

import type { MatchState } from '../core/GameState';
import type { RuleSet } from './RuleSet';
import type { ShotOutcome } from './ShotEvaluator';
import { FoulKind } from '../core/types';

/** A physical consequence the caller must apply to the board. */
export interface Penalty {
  readonly type: 'RETURN_OWN_COIN' | 'RETURN_QUEEN';
  /** Charged immediately, or carried as debt because the player had nothing to give. */
  readonly deferred: boolean;
}

export interface FoulResult {
  readonly fouls: readonly FoulKind[];
  readonly penalties: readonly Penalty[];
  /** Any foul ends the turn. */
  readonly endsTurn: boolean;
}

export class FoulManager {
  /**
   * Detect fouls for a completed shot.
   *
   * Several fouls can occur at once — a striker that pots itself *and* an
   * opponent coin is two — but they are charged as one returned coin, matching
   * how the penalty works at a real board.
   */
  static evaluate(state: MatchState, outcome: ShotOutcome, rules: RuleSet): FoulResult {
    const fouls: FoulKind[] = [];

    if (rules.strikerPocketIsFoul && outcome.strikerPocketed) {
      fouls.push(FoulKind.StrikerPocketed);
    }

    if (rules.opponentCoinEndsTurn && outcome.opponentCoins > 0) {
      // The coin stays down and counts for its owner; the cost to the offender
      // is the lost turn, not the coin.
      fouls.push(FoulKind.OpponentCoinPocketed);
    }

    if (rules.noContactIsFoul && !outcome.madeContact) {
      fouls.push(FoulKind.NoContact);
    }

    if (fouls.length === 0) {
      return { fouls: [], penalties: [], endsTurn: false };
    }

    const penalties: Penalty[] = [];
    if (rules.foulReturnsOwnCoin) {
      const player = state.players[outcome.by];
      // Coins banked this shot are already counted, so a player who potted one
      // of their own and also fouled pays out of that.
      const canPay = player.coinsPocketed > 0;
      penalties.push({ type: 'RETURN_OWN_COIN', deferred: !canPay });
    }

    return { fouls, penalties, endsTurn: true };
  }
}
