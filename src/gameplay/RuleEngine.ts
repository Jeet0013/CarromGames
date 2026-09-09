/**
 * The rulebook.
 *
 * Takes match state plus what a shot did, and returns what should happen —
 * without doing any of it. The caller applies the decision to the board and the
 * UI. That split is what makes every rule in the game testable as a pure
 * function, and it is why `gameplay/` imports nothing from `rendering/`.
 *
 * Order of resolution matters and is deliberate:
 *
 *   1. Ownership — a coin cannot be "yours" until colours exist.
 *   2. Queen — her obligation is independent of fouls.
 *   3. Fouls — may add penalties on top.
 *   4. Turn continuation — a foul always overrides a would-be continue.
 *   5. Victory — checked last, and blocked by an uncovered Queen.
 */

import type { MatchState } from '../core/GameState';
import {
  assignColors,
  effectiveCoinsPocketed,
  nextSeat,
  opposingSeatOf,
} from '../core/GameState';
import { FoulManager, type Penalty } from './FoulManager';
import { QueenManager } from './QueenManager';
import { CLASSIC_CASUAL, type RuleSet } from './RuleSet';
import type { ShotOutcome } from './ShotEvaluator';
import { CoinColor, FoulKind, PlayerSlot, QueenState } from '../core/types';

/** The player-facing messages the scope requires. */
export const Notification = {
  YourTurn: 'YOUR TURN',
  OpponentTurn: 'OPPONENT TURN',
  KeepPlaying: 'KEEP PLAYING',
  Miss: 'MISS',
  Foul: 'FOUL',
  QueenPocketed: 'QUEEN POCKETED',
  CoverTheQueen: 'COVER THE QUEEN',
  QueenCovered: 'QUEEN COVERED',
  QueenReturned: 'QUEEN RETURNED',
} as const;
export type Notification = (typeof Notification)[keyof typeof Notification];

export interface RuleDecision {
  /** The shooter keeps the turn. */
  readonly continueTurn: boolean;
  readonly fouls: readonly FoulKind[];
  readonly penalties: readonly Penalty[];
  /** Colours claimed by this shot, if any. */
  readonly ownershipAssigned?: { readonly player: PlayerSlot; readonly color: CoinColor };
  readonly queenState: QueenState;
  readonly queenTransition?: { readonly from: QueenState; readonly to: QueenState };
  /** The Queen must be physically placed back at the centre. */
  readonly returnQueenToCentre: boolean;
  /** Coins to put back on the board, from fouls and last-coin violations. */
  readonly coinsToReturn: number;
  readonly winner: PlayerSlot | null;
  readonly notifications: readonly Notification[];
}

export class RuleEngine {
  readonly #rules: RuleSet;

  constructor(rules: RuleSet = CLASSIC_CASUAL) {
    this.#rules = rules;
  }

  get rules(): RuleSet {
    return this.#rules;
  }

  /**
   * Decide the consequences of a shot. Does not mutate `state`.
   */
  evaluate(state: MatchState, outcome: ShotOutcome): RuleDecision {
    const rules = this.#rules;
    const notifications: Notification[] = [];
    const player = state.players[outcome.by];

    // ── 1. Ownership ────────────────────────────────────────────────────
    let ownershipAssigned: RuleDecision['ownershipAssigned'];
    let effectiveOwnCoins = outcome.ownCoins;

    if (rules.assignColorsOnFirstPocket && player.color === null) {
      const claimed = outcome.unassignedCoins[0];
      if (claimed !== undefined) {
        ownershipAssigned = { player: outcome.by, color: claimed };
        // Coins of the claimed colour count as own; the rest are the opponent's.
        effectiveOwnCoins = outcome.unassignedCoins.filter((c) => c === claimed).length;
      }
    }

    const opponentCoins =
      ownershipAssigned !== undefined
        ? outcome.unassignedCoins.length - effectiveOwnCoins
        : outcome.opponentCoins;

    // ── 2. Queen ────────────────────────────────────────────────────────
    const queen = QueenManager.evaluate(state, outcome, rules);

    if (outcome.queenPocketed) notifications.push(Notification.QueenPocketed);
    if (queen.transition?.to === QueenState.Covered) {
      notifications.push(Notification.QueenCovered);
    }
    if (queen.awaitingCover) notifications.push(Notification.CoverTheQueen);
    if (queen.returnToCentre) notifications.push(Notification.QueenReturned);

    // ── 3. Fouls ────────────────────────────────────────────────────────
    // The evaluator counted with stale colours when ownership was just
    // assigned, so foul detection is given the corrected figures.
    const foulOutcome: ShotOutcome = { ...outcome, ownCoins: effectiveOwnCoins, opponentCoins };
    const foul = FoulManager.evaluate(state, foulOutcome, rules);

    const penalties: Penalty[] = [...foul.penalties];
    const fouls: FoulKind[] = [...foul.fouls];

    // Taking your last coin while the Queen is still up is its own violation:
    // the coin comes back, and the turn ends.
    if (queen.lastCoinBeforeQueen) {
      fouls.push(FoulKind.LastCoinBeforeQueen);
      penalties.push({ type: 'RETURN_OWN_COIN', deferred: false });
    }

    if (fouls.length > 0) notifications.push(Notification.Foul);

    // ── 4. Turn continuation ────────────────────────────────────────────
    const pocketedSomethingOwn = effectiveOwnCoins > 0;
    const queenKept = queen.state === QueenState.Covered && outcome.queenPocketed;

    // A foul always ends the turn, even alongside a good pocket.
    const continueTurn =
      fouls.length === 0 &&
      rules.continueOnOwnCoin &&
      (pocketedSomethingOwn || queenKept || queen.awaitingCover);

    if (fouls.length === 0) {
      if (continueTurn) notifications.push(Notification.KeepPlaying);
      else if (outcome.pocketed.length === 0) notifications.push(Notification.Miss);
    }

    // ── 5. Victory ──────────────────────────────────────────────────────
    /*
     * Checked for both sides, not only the shooter.
     *
     * Pocketing an opponent's coin is a foul, but the coin stays down and
     * counts for its owner — so a player's board can be cleared *by their
     * opponent*, without them taking a single shot. Judging only `outcome.by`
     * meant that game never ended: the side whose coins were all gone had
     * nothing left to aim at, so the computer sat thinking at a board it could
     * not play, and no win was ever announced.
     */
    const returnedCoins = penalties.filter((p) => !p.deferred).length;
    // Side totals, not personal ones: partners share nine coins between them.
    const shooterTotal = Math.max(
      0,
      effectiveCoinsPocketed(state, outcome.by) + effectiveOwnCoins - returnedCoins,
    );

    const creditedSlot = opposingSeatOf(state, outcome.by);
    const creditedTotal = effectiveCoinsPocketed(state, creditedSlot) + opponentCoins;

    // An owed cover blocks a win: the Queen is unsettled, so the match is not
    // actually over.
    const queenSettled = !QueenManager.blocksVictory({ ...state, queen: queen.state }, rules);

    /*
     * With one exception, for the side whose board was cleared *for* them.
     *
     * If they are the one who owes the cover they can never pay it — they have
     * no coins left on the board to cover with, and no shot that could put one
     * there. Blocking the win on that obligation does not prolong the match,
     * it deadlocks it: neither player has a legal, progressing move left. A
     * debt that cannot be discharged is not a reason to keep playing.
     *
     * A Queen still *on the board* never blocks this win either, for the same
     * reason — the winner was not the one shooting.
     */
    const creditedQueenSettled = queenSettled || state.queenPocketedBy === creditedSlot;

    let winner: PlayerSlot | null = null;
    if (rules.winOnAllCoinsPocketed) {
      // The shooter takes precedence if both boards complete on one shot:
      // clearing your own coins is the primary win condition.
      if (shooterTotal >= 9 && queenSettled) winner = outcome.by;
      else if (creditedTotal >= 9 && creditedQueenSettled) winner = creditedSlot;
    }

    if (winner === null) {
      notifications.push(
        continueTurn ? Notification.YourTurn : Notification.OpponentTurn,
      );
    }

    return {
      continueTurn,
      fouls,
      penalties,
      ...(ownershipAssigned !== undefined ? { ownershipAssigned } : {}),
      queenState: queen.state,
      ...(queen.transition !== undefined ? { queenTransition: queen.transition } : {}),
      returnQueenToCentre: queen.returnToCentre,
      coinsToReturn: penalties.filter((p) => !p.deferred).length,
      winner,
      notifications,
    };
  }

  /**
   * Fold a decision into the state.
   *
   * Separate from `evaluate` so a caller can inspect a decision before
   * committing to it — which is exactly what the AI does when it looks ahead.
   */
  apply(state: MatchState, outcome: ShotOutcome, decision: RuleDecision): void {
    const player = state.players[outcome.by];

    if (decision.ownershipAssigned) {
      assignColors(state, decision.ownershipAssigned.player, decision.ownershipAssigned.color);
    }

    const myColor = player.color;
    let own = 0;
    let opponent = 0;
    for (const color of outcome.unassignedCoins) {
      if (color === myColor) own += 1;
      else opponent += 1;
    }
    own += outcome.ownCoins;
    opponent += outcome.opponentCoins;

    player.coinsPocketed += own;
    state.players[opposingSeatOf(state, outcome.by)].coinsPocketed += opponent;

    // Board inventory.
    for (const color of [CoinColor.White, CoinColor.Black]) {
      const potted = outcome.pocketed.filter(
        (p) =>
          (color === CoinColor.White && p.kind === 'WHITE_COIN') ||
          (color === CoinColor.Black && p.kind === 'BLACK_COIN'),
      ).length;
      state.coinsOnBoard[color] = Math.max(0, state.coinsOnBoard[color] - potted);
    }

    // Penalties: immediate ones give a coin back, deferred ones become debt.
    for (const penalty of decision.penalties) {
      if (penalty.type !== 'RETURN_OWN_COIN') continue;
      if (penalty.deferred) player.penaltyDebt += 1;
      else if (player.coinsPocketed > 0) {
        player.coinsPocketed -= 1;
        const color = player.color;
        if (color) state.coinsOnBoard[color] += 1;
      }
    }

    state.queen = decision.queenState;
    if (outcome.queenPocketed && decision.queenState === QueenState.PocketedPendingCover) {
      state.queenPocketedBy = outcome.by;
    }
    if (
      decision.queenState === QueenState.Covered ||
      decision.queenState === QueenState.OnBoard
    ) {
      state.queenPocketedBy = null;
    }

    player.foulCount += decision.fouls.length > 0 ? 1 : 0;
    player.shotsTaken += 1;
    state.isBreakShot = false;
    state.turnCount += 1;
    state.winner = decision.winner;

    if (!decision.continueTurn && decision.winner === null) {
      // Turn order comes from `seatOrder`, so this is already correct for four
      // players; two-player reduces to alternating.
      state.currentPlayer = nextSeat(state, outcome.by);
    }
  }
}
