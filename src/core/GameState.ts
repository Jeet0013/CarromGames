/**
 * Authoritative match state.
 *
 * Plain serializable data — no meshes, no bodies, no DOM. That is what lets the
 * whole rule layer be tested headlessly, and what would let a future networked
 * build ship this struct over the wire.
 */

import { CoinColor, PlayerSlot, QueenState } from './types';

export interface PlayerState {
  readonly slot: PlayerSlot;
  /** Null until the first valid pocket assigns colours. */
  color: CoinColor | null;
  /** Own coins pocketed and kept. */
  coinsPocketed: number;
  /**
   * Coins owed back to the board from fouls committed before the player had
   * anything to give. Paid on their next pocket.
   */
  penaltyDebt: number;
  foulCount: number;
  shotsTaken: number;
}

export interface MatchState {
  currentPlayer: PlayerSlot;
  readonly players: Record<PlayerSlot, PlayerState>;

  /** Coins still on the board, by colour. */
  coinsOnBoard: Record<CoinColor, number>;

  queen: QueenState;
  /** Who pocketed the Queen and still owes a cover. */
  queenPocketedBy: PlayerSlot | null;

  /** True until the first shot of the match has been played. */
  isBreakShot: boolean;
  turnCount: number;
  winner: PlayerSlot | null;
}

export const COINS_PER_COLOR = 9;

export function createMatchState(starting: PlayerSlot = PlayerSlot.One): MatchState {
  return {
    currentPlayer: starting,
    players: {
      [PlayerSlot.One]: newPlayer(PlayerSlot.One),
      [PlayerSlot.Two]: newPlayer(PlayerSlot.Two),
    },
    coinsOnBoard: {
      [CoinColor.White]: COINS_PER_COLOR,
      [CoinColor.Black]: COINS_PER_COLOR,
    },
    queen: QueenState.OnBoard,
    queenPocketedBy: null,
    isBreakShot: true,
    turnCount: 0,
    winner: null,
  };
}

function newPlayer(slot: PlayerSlot): PlayerState {
  return {
    slot,
    color: null,
    coinsPocketed: 0,
    penaltyDebt: 0,
    foulCount: 0,
    shotsTaken: 0,
  };
}

export const opponentOf = (slot: PlayerSlot): PlayerSlot =>
  slot === PlayerSlot.One ? PlayerSlot.Two : PlayerSlot.One;

/** The colour a seat owns, or null while colours are unassigned. */
export const colorOf = (state: MatchState, slot: PlayerSlot): CoinColor | null =>
  state.players[slot].color;

/**
 * Assign colours from one player's claim; the opponent takes the other.
 * Idempotent — a second call with colours already set is a no-op.
 */
export function assignColors(
  state: MatchState,
  slot: PlayerSlot,
  color: CoinColor,
): void {
  if (state.players[slot].color !== null) return;
  const other = color === CoinColor.White ? CoinColor.Black : CoinColor.White;
  state.players[slot].color = color;
  state.players[opponentOf(slot)].color = other;
}
