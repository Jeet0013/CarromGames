/**
 * Queen lifecycle and the cover rule.
 *
 * The Queen is the one piece whose fate depends on what happens *after* she is
 * pocketed, which is why she needs a state machine rather than a boolean:
 *
 *   ON_BOARD ──pocketed──▶ POCKETED_PENDING_COVER
 *                              │            │
 *                     own coin │            │ no own coin
 *                              ▼            ▼
 *                          COVERED    RETURN_TO_CENTER ──▶ ON_BOARD
 *
 * Pure, like the rest of the rule layer. Physical placement is returned as a
 * request; this decides *that* the Queen returns, not where she lands.
 */

import { effectiveCoinsPocketed, type MatchState } from '../core/GameState';
import type { RuleSet } from './RuleSet';
import type { ShotOutcome } from './ShotEvaluator';
import { QueenState } from '../core/types';

export interface QueenResult {
  readonly state: QueenState;
  /** Set when the state changed this shot. */
  readonly transition?: { readonly from: QueenState; readonly to: QueenState };
  /** The Queen must be physically returned to the centre. */
  readonly returnToCentre: boolean;
  /** The player still owes a cover on their next shot. */
  readonly awaitingCover: boolean;
  /** Pocketing the last coin with the Queen still up — a foul under some rules. */
  readonly lastCoinBeforeQueen: boolean;
}

export class QueenManager {
  /**
   * Resolve the Queen for a completed shot.
   *
   * Two distinct situations produce a cover, and conflating them is the usual
   * bug: the Queen may be covered *in the same shot* she was pocketed (if the
   * ruleset allows it), or on the shot that follows. The second case is the one
   * that matters — the player is mid-obligation, and failing it sends her back.
   */
  static evaluate(state: MatchState, outcome: ShotOutcome, rules: RuleSet): QueenResult {
    const current = state.queen;
    const player = state.players[outcome.by];

    // Coins that count toward a cover. Before colours are assigned, a coin
    // pocketed alongside the Queen claims a colour and covers her.
    const coveringCoins =
      player.color === null ? outcome.unassignedCoins.length : outcome.ownCoins;

    // ── The Queen went down this shot ───────────────────────────────────
    if (outcome.queenPocketed && current === QueenState.OnBoard) {
      if (!rules.queenMustBeCovered) {
        return finish(current, QueenState.Covered, false, false, false);
      }

      if (rules.queenCoverableSameShot && coveringCoins > 0) {
        return finish(current, QueenState.Covered, false, false, false);
      }

      // Pocketed but not yet earned — the obligation starts now.
      return finish(current, QueenState.PocketedPendingCover, false, true, false);
    }

    // ── A cover was owed from a previous shot ───────────────────────────
    if (current === QueenState.PocketedPendingCover) {
      // Only the player who took her can cover her.
      if (state.queenPocketedBy !== outcome.by) {
        return finish(current, current, false, true, false);
      }

      if (coveringCoins > 0) {
        return finish(current, QueenState.Covered, false, false, false);
      }

      if (rules.queenReturnsIfUncovered) {
        // Failed to cover: she goes back and is fair game again.
        return finish(current, QueenState.OnBoard, true, false, false);
      }

      return finish(current, current, false, true, false);
    }

    // ── Queen untouched: check the last-coin restriction ────────────────
    const lastCoinBeforeQueen =
      rules.queenRequiredBeforeLastCoin &&
      current === QueenState.OnBoard &&
      outcome.ownCoins > 0 &&
      // The side's total, so a partner's coins count toward the final one.
      effectiveCoinsPocketed(state, outcome.by) + outcome.ownCoins >= 9;

    return {
      state: current,
      returnToCentre: false,
      awaitingCover: false,
      lastCoinBeforeQueen,
    };
  }

  /**
   * Whether this player is allowed to win right now.
   *
   * An uncovered Queen blocks a win: she is still owed, so the match is not
   * actually finished.
   */
  static blocksVictory(state: MatchState, rules: RuleSet): boolean {
    if (!rules.queenMustBeCovered) return false;
    return state.queen === QueenState.PocketedPendingCover;
  }
}

function finish(
  from: QueenState,
  to: QueenState,
  returnToCentre: boolean,
  awaitingCover: boolean,
  lastCoinBeforeQueen: boolean,
): QueenResult {
  return {
    state: to,
    ...(from === to ? {} : { transition: { from, to } }),
    returnToCentre,
    awaitingCover,
    lastCoinBeforeQueen,
  };
}
