/**
 * Turns a raw shot log into a rules-shaped summary.
 *
 * `PocketManager` reports physical facts — this piece went into that pocket.
 * The rule engine needs those facts in its own terms: how many of *my* coins,
 * how many of the opponent's, did the Queen go down, did the striker.
 *
 * Kept separate so the translation has one home, and so both the human and the
 * AI produce an identical summary from an identical shot.
 */

import type { MatchState } from '../core/GameState';
import { colorOf } from '../core/GameState';
import { CoinColor, PieceKind, PlayerSlot } from '../core/types';

/** One pocketed piece, as the rules see it. */
export interface PocketedPiece {
  readonly pieceId: string;
  readonly kind: PieceKind;
  readonly pocketIndex: number;
}

/** Everything a shot did, in rule terms. */
export interface ShotOutcome {
  readonly by: PlayerSlot;
  readonly pocketed: readonly PocketedPiece[];
  /** Own coins pocketed. Before colours are assigned this is 0 by definition. */
  readonly ownCoins: number;
  readonly opponentCoins: number;
  /** Coins pocketed while colours were still unassigned. */
  readonly unassignedCoins: readonly CoinColor[];
  readonly queenPocketed: boolean;
  readonly strikerPocketed: boolean;
  /** The striker made contact with at least one piece. */
  readonly madeContact: boolean;
}

export interface ShotInput {
  readonly by: PlayerSlot;
  readonly pocketed: readonly PocketedPiece[];
  readonly madeContact: boolean;
}

/** Colour of a coin from its `PieceKind`, or null for Queen/striker. */
export function coinColorOf(kind: PieceKind): CoinColor | null {
  if (kind === PieceKind.WhiteCoin) return CoinColor.White;
  if (kind === PieceKind.BlackCoin) return CoinColor.Black;
  return null;
}

export class ShotEvaluator {
  /**
   * Summarise a shot.
   *
   * Note the ordering subtlety: when colours are unassigned, coins cannot yet
   * be "own" or "opponent". They are collected in `unassignedCoins` and the
   * rule engine decides the claim, because *which* colour claims the player
   * depends on rules this class should not know about.
   */
  static evaluate(state: MatchState, input: ShotInput): ShotOutcome {
    const myColor = colorOf(state, input.by);

    let ownCoins = 0;
    let opponentCoins = 0;
    let queenPocketed = false;
    let strikerPocketed = false;
    const unassignedCoins: CoinColor[] = [];

    for (const piece of input.pocketed) {
      if (piece.kind === PieceKind.Striker) {
        strikerPocketed = true;
        continue;
      }
      if (piece.kind === PieceKind.Queen) {
        queenPocketed = true;
        continue;
      }

      const color = coinColorOf(piece.kind);
      if (color === null) continue;

      if (myColor === null) unassignedCoins.push(color);
      else if (color === myColor) ownCoins += 1;
      else opponentCoins += 1;
    }

    return {
      by: input.by,
      pocketed: input.pocketed,
      ownCoins,
      opponentCoins,
      unassignedCoins,
      queenPocketed,
      strikerPocketed,
      madeContact: input.madeContact,
    };
  }
}
