/**
 * Rule validation.
 *
 * These run headlessly with no renderer, no Rapier, and no DOM — the payoff for
 * keeping `gameplay/` free of engine dependencies. Every scenario in the spec is
 * covered: turns, break, colour assignment, continuation, misses, opponent
 * coins, striker fouls, the full Queen lifecycle, and victory.
 */

import { describe, expect, it } from 'vitest';

import {
  assignColors,
  assignTeams,
  createMatchState,
  effectiveCoinsPocketed,
  type MatchState,
} from '../core/GameState';
import { FOUR_PLAYER_SEATING } from './FourPlayerRuleSet';
import { RuleEngine, Notification } from './RuleEngine';
import { ShotEvaluator, type PocketedPiece } from './ShotEvaluator';
import { CLASSIC_CASUAL, CLASSIC_TOURNAMENT } from './RuleSet';
import { CoinColor, FoulKind, GameMode, PieceKind, PlayerSlot, QueenState } from '../core/types';

// ── helpers ───────────────────────────────────────────────────────────────

let nextId = 0;
const coin = (kind: PieceKind): PocketedPiece => ({
  pieceId: `p${nextId++}`,
  kind,
  pocketIndex: 0,
});
const white = () => coin(PieceKind.WhiteCoin);
const black = () => coin(PieceKind.BlackCoin);
const queen = () => coin(PieceKind.Queen);
const striker = () => coin(PieceKind.Striker);

/** Play one shot through the full pipeline and commit it. */
function play(
  state: MatchState,
  engine: RuleEngine,
  pocketed: PocketedPiece[],
  options: { by?: PlayerSlot; madeContact?: boolean } = {},
) {
  const by = options.by ?? state.currentPlayer;
  const outcome = ShotEvaluator.evaluate(state, {
    by,
    pocketed,
    madeContact: options.madeContact ?? pocketed.length > 0,
  });
  const decision = engine.evaluate(state, outcome);
  engine.apply(state, outcome, decision);
  return decision;
}

const engine = () => new RuleEngine(CLASSIC_CASUAL);

// ── turns and the break ───────────────────────────────────────────────────

describe('turns', () => {
  it('starts with Player One on the break', () => {
    const state = createMatchState();
    expect(state.currentPlayer).toBe(PlayerSlot.One);
    expect(state.isBreakShot).toBe(true);
  });

  it('clears the break flag after the first shot', () => {
    const state = createMatchState();
    play(state, engine(), [], { madeContact: true });
    expect(state.isBreakShot).toBe(false);
  });

  it('switches player on a miss and announces it', () => {
    const state = createMatchState();
    const decision = play(state, engine(), [], { madeContact: true });

    expect(decision.continueTurn).toBe(false);
    expect(decision.notifications).toContain(Notification.Miss);
    expect(decision.notifications).toContain(Notification.OpponentTurn);
    expect(state.currentPlayer).toBe(PlayerSlot.Two);
  });
});

// ── colour assignment ─────────────────────────────────────────────────────

describe('colour assignment', () => {
  it('is unassigned until the first coin drops', () => {
    const state = createMatchState();
    expect(state.players[PlayerSlot.One].color).toBeNull();
    expect(state.players[PlayerSlot.Two].color).toBeNull();
  });

  it('gives the first pocketed colour to the shooter and the other to the opponent', () => {
    const state = createMatchState();
    const decision = play(state, engine(), [white()]);

    expect(decision.ownershipAssigned).toEqual({
      player: PlayerSlot.One,
      color: CoinColor.White,
    });
    expect(state.players[PlayerSlot.One].color).toBe(CoinColor.White);
    expect(state.players[PlayerSlot.Two].color).toBe(CoinColor.Black);
  });

  it('does not reassign colours on later shots', () => {
    const state = createMatchState();
    play(state, engine(), [white()]);
    const decision = play(state, engine(), [black()]);

    expect(decision.ownershipAssigned).toBeUndefined();
    expect(state.players[PlayerSlot.One].color).toBe(CoinColor.White);
  });

  it('credits a mixed first shot correctly to both players', () => {
    const state = createMatchState();
    // Two white and one black in the claiming shot.
    play(state, engine(), [white(), white(), black()]);

    expect(state.players[PlayerSlot.One].coinsPocketed).toBe(2);
    expect(state.players[PlayerSlot.Two].coinsPocketed).toBe(1);
  });
});

// ── continuation ──────────────────────────────────────────────────────────

describe('turn continuation', () => {
  it('keeps the turn after pocketing an own coin', () => {
    const state = createMatchState();
    const decision = play(state, engine(), [white()]);

    expect(decision.continueTurn).toBe(true);
    expect(decision.notifications).toContain(Notification.KeepPlaying);
    expect(state.currentPlayer).toBe(PlayerSlot.One);
  });

  it('ends the turn when only an opponent coin is pocketed', () => {
    const state = createMatchState();
    play(state, engine(), [white()]); // P1 = white
    const decision = play(state, engine(), [black()]);

    expect(decision.fouls).toContain(FoulKind.OpponentCoinPocketed);
    expect(decision.continueTurn).toBe(false);
    expect(state.currentPlayer).toBe(PlayerSlot.Two);
  });

  it('credits an opponent coin to the opponent', () => {
    const state = createMatchState();
    play(state, engine(), [white()]);
    play(state, engine(), [black()], { by: PlayerSlot.One });

    expect(state.players[PlayerSlot.Two].coinsPocketed).toBe(1);
  });
});

// ── fouls ─────────────────────────────────────────────────────────────────

describe('fouls', () => {
  it('flags a pocketed striker and ends the turn', () => {
    const state = createMatchState();
    const decision = play(state, engine(), [striker()], { madeContact: true });

    expect(decision.fouls).toContain(FoulKind.StrikerPocketed);
    expect(decision.continueTurn).toBe(false);
    expect(decision.notifications).toContain(Notification.Foul);
    expect(state.currentPlayer).toBe(PlayerSlot.Two);
  });

  it('overrides continuation when a good pocket and a foul happen together', () => {
    const state = createMatchState();
    // Own coin AND the striker down — the foul wins.
    const decision = play(state, engine(), [white(), striker()]);

    expect(decision.continueTurn).toBe(false);
    expect(state.currentPlayer).toBe(PlayerSlot.Two);
  });

  it('returns a pocketed coin when the player has one to give', () => {
    const state = createMatchState();
    play(state, engine(), [white()]); // 1 banked
    play(state, engine(), [white()]); // 2 banked
    expect(state.players[PlayerSlot.One].coinsPocketed).toBe(2);

    play(state, engine(), [striker()], { madeContact: true });
    expect(state.players[PlayerSlot.One].coinsPocketed).toBe(1);
    expect(state.coinsOnBoard[CoinColor.White]).toBe(8);
  });

  it('carries the penalty as debt when the player has no coins banked', () => {
    const state = createMatchState();
    const decision = play(state, engine(), [striker()], { madeContact: true });

    expect(decision.penalties[0]?.deferred).toBe(true);
    expect(state.players[PlayerSlot.One].penaltyDebt).toBe(1);
  });

  it('treats a shot touching nothing as a foul', () => {
    const state = createMatchState();
    const decision = play(state, engine(), [], { madeContact: false });

    expect(decision.fouls).toContain(FoulKind.NoContact);
    expect(state.currentPlayer).toBe(PlayerSlot.Two);
  });
});

// ── the Queen ─────────────────────────────────────────────────────────────

describe('queen', () => {
  it('starts on the board', () => {
    expect(createMatchState().queen).toBe(QueenState.OnBoard);
  });

  it('is covered when an own coin falls in the same shot', () => {
    const state = createMatchState();
    const decision = play(state, engine(), [queen(), white()]);

    expect(decision.queenState).toBe(QueenState.Covered);
    expect(decision.notifications).toContain(Notification.QueenPocketed);
    expect(decision.continueTurn).toBe(true);
  });

  it('awaits a cover when taken alone, and says so', () => {
    const state = createMatchState();
    const decision = play(state, engine(), [queen()], { madeContact: true });

    expect(decision.queenState).toBe(QueenState.PocketedPendingCover);
    expect(decision.notifications).toContain(Notification.CoverTheQueen);
    // The player keeps the turn to attempt the cover.
    expect(decision.continueTurn).toBe(true);
    expect(state.queenPocketedBy).toBe(PlayerSlot.One);
  });

  it('is covered by an own coin on the following shot', () => {
    const state = createMatchState();
    play(state, engine(), [white()]); // claim white
    play(state, engine(), [queen()], { madeContact: true });
    expect(state.queen).toBe(QueenState.PocketedPendingCover);

    const decision = play(state, engine(), [white()]);
    expect(decision.queenState).toBe(QueenState.Covered);
    expect(state.queenPocketedBy).toBeNull();
  });

  it('returns to the centre when the cover is missed', () => {
    const state = createMatchState();
    play(state, engine(), [white()]);
    play(state, engine(), [queen()], { madeContact: true });

    const decision = play(state, engine(), [], { madeContact: true });
    expect(decision.queenState).toBe(QueenState.OnBoard);
    expect(decision.returnQueenToCentre).toBe(true);
    expect(decision.notifications).toContain(Notification.QueenReturned);
    expect(state.queenPocketedBy).toBeNull();
  });

  it('does not let the same-shot cover count under tournament rules', () => {
    const state = createMatchState();
    const strict = new RuleEngine(CLASSIC_TOURNAMENT);
    const outcome = ShotEvaluator.evaluate(state, {
      by: PlayerSlot.One,
      pocketed: [queen(), white()],
      madeContact: true,
    });
    const decision = strict.evaluate(state, outcome);

    expect(decision.queenState).toBe(QueenState.PocketedPendingCover);
  });
});

// ── victory ───────────────────────────────────────────────────────────────

describe('victory', () => {
  /** Bank `count` own coins for a player without tripping other rules. */
  function bank(state: MatchState, count: number): void {
    state.players[PlayerSlot.One].color = CoinColor.White;
    state.players[PlayerSlot.Two].color = CoinColor.Black;
    state.players[PlayerSlot.One].coinsPocketed = count;
    state.coinsOnBoard[CoinColor.White] = 9 - count;
  }

  it('declares a win when the last coin drops and the Queen is settled', () => {
    const state = createMatchState();
    bank(state, 8);
    state.queen = QueenState.Covered;

    const decision = play(state, engine(), [white()]);
    expect(decision.winner).toBe(PlayerSlot.One);
    expect(state.winner).toBe(PlayerSlot.One);
  });

  it('does not declare a win before the last coin', () => {
    const state = createMatchState();
    bank(state, 5);
    state.queen = QueenState.Covered;

    expect(play(state, engine(), [white()]).winner).toBeNull();
  });

  it('refuses the last coin while the Queen is still on the board', () => {
    const state = createMatchState();
    bank(state, 8);
    state.queen = QueenState.OnBoard;

    const decision = play(state, engine(), [white()]);
    expect(decision.winner).toBeNull();
    expect(decision.coinsToReturn).toBeGreaterThan(0);
    expect(decision.continueTurn).toBe(false);
  });

  it('allows the win when the ninth coin also discharges the Queen cover', () => {
    const state = createMatchState();
    bank(state, 8);
    state.queen = QueenState.PocketedPendingCover;
    state.queenPocketedBy = PlayerSlot.One;

    // The covering coin is also the ninth — the win must not be blocked by an
    // obligation this very shot discharged.
    const decision = play(state, engine(), [white()]);
    expect(decision.queenState).toBe(QueenState.Covered);
    expect(decision.winner).toBe(PlayerSlot.One);
  });

  it('blocks the win while the opponent still owes a Queen cover', () => {
    const state = createMatchState();
    bank(state, 8);
    // Player Two took the Queen and has not covered her, so the match is not
    // actually resolved even though Player One has cleared their coins.
    state.queen = QueenState.PocketedPendingCover;
    state.queenPocketedBy = PlayerSlot.Two;

    const decision = play(state, engine(), [white()]);
    expect(decision.queenState).toBe(QueenState.PocketedPendingCover);
    expect(decision.winner).toBeNull();
    expect(state.winner).toBeNull();
  });

  /*
   * A player's board can be cleared *by their opponent*: pocketing an
   * opponent's coin is a foul, but the coin stays down and counts for its
   * owner. Judging victory only for the shooter meant the match never ended —
   * the side with nothing left on the board had nothing to aim at, so the
   * computer sat thinking at a board it could not play.
   */
  it('declares the opponent the winner when their last coin is pocketed for them', () => {
    const state = createMatchState();
    state.players[PlayerSlot.One].color = CoinColor.White;
    state.players[PlayerSlot.Two].color = CoinColor.Black;
    state.players[PlayerSlot.Two].coinsPocketed = 8;
    state.coinsOnBoard[CoinColor.Black] = 1;
    state.queen = QueenState.Covered;

    // Player One pots the last black. A foul for them, and the board is done.
    const decision = play(state, engine(), [black()]);

    expect(decision.fouls).toContain(FoulKind.OpponentCoinPocketed);
    expect(decision.winner).toBe(PlayerSlot.Two);
    expect(state.winner).toBe(PlayerSlot.Two);
  });

  it('credits the opponent short of nine without declaring a win', () => {
    const state = createMatchState();
    state.players[PlayerSlot.One].color = CoinColor.White;
    state.players[PlayerSlot.Two].color = CoinColor.Black;
    state.players[PlayerSlot.Two].coinsPocketed = 6;
    state.coinsOnBoard[CoinColor.Black] = 3;
    state.queen = QueenState.Covered;

    const decision = play(state, engine(), [black()]);

    expect(decision.winner).toBeNull();
    expect(state.players[PlayerSlot.Two].coinsPocketed).toBe(7);
  });

  it('prefers the shooter when one shot completes both boards', () => {
    const state = createMatchState();
    state.players[PlayerSlot.One].color = CoinColor.White;
    state.players[PlayerSlot.Two].color = CoinColor.Black;
    state.players[PlayerSlot.One].coinsPocketed = 8;
    state.players[PlayerSlot.Two].coinsPocketed = 8;
    state.coinsOnBoard[CoinColor.White] = 1;
    state.coinsOnBoard[CoinColor.Black] = 1;
    state.queen = QueenState.Covered;

    // The foul returns one of the shooter's coins, so their nine does not
    // stand and the completed board is the opponent's.
    const decision = play(state, engine(), [white(), black()]);
    expect(decision.winner).toBe(PlayerSlot.Two);
  });

  it('does not let a cover the winner can never pay block their win', () => {
    const state = createMatchState();
    state.players[PlayerSlot.One].color = CoinColor.White;
    state.players[PlayerSlot.Two].color = CoinColor.Black;
    state.players[PlayerSlot.Two].coinsPocketed = 8;
    state.coinsOnBoard[CoinColor.Black] = 1;
    // Player Two took the Queen and still owes a cover — but Player One is
    // about to pocket their last coin *for* them. With no black left on the
    // board Two can never cover, so blocking here would deadlock the match:
    // neither side would have a move that could ever end it.
    state.queen = QueenState.PocketedPendingCover;
    state.queenPocketedBy = PlayerSlot.Two;

    expect(play(state, engine(), [black()]).winner).toBe(PlayerSlot.Two);
  });

  it('lets the Queen come back when the shooter fails their own cover', () => {
    const state = createMatchState();
    state.players[PlayerSlot.One].color = CoinColor.White;
    state.players[PlayerSlot.Two].color = CoinColor.Black;
    state.players[PlayerSlot.Two].coinsPocketed = 8;
    state.coinsOnBoard[CoinColor.Black] = 1;
    state.queen = QueenState.PocketedPendingCover;
    state.queenPocketedBy = PlayerSlot.One;

    // A black coin does not cover for Player One, so the Queen returns to the
    // centre — the obligation is discharged, and Two's completed board stands.
    const decision = play(state, engine(), [black()]);
    expect(decision.returnQueenToCentre).toBe(true);
    expect(decision.winner).toBe(PlayerSlot.Two);
  });

  /*
   * Partners share nine coins, so a team's progress is the sum of both seats.
   * Reading one player's count meant a four-player team could pocket all nine
   * between them and never be declared the winner.
   */
  it('wins a team match on the partners\' combined ninth coin', () => {
    const state = createMatchState(GameMode.FourPlayer);
    state.seatOrder = [
      PlayerSlot.One,
      PlayerSlot.Two,
      PlayerSlot.Three,
      PlayerSlot.Four,
    ];
    assignTeams(state, FOUR_PLAYER_SEATING);
    assignColors(state, PlayerSlot.One, CoinColor.White);
    state.queen = QueenState.Covered;

    // Five from one partner, three from the other: eight between them.
    state.players[PlayerSlot.One].coinsPocketed = 5;
    state.players[PlayerSlot.Three].coinsPocketed = 3;
    state.coinsOnBoard[CoinColor.White] = 1;

    const decision = play(state, engine(), [white()], { by: PlayerSlot.Three });
    expect(decision.winner).toBe(PlayerSlot.Three);
  });

  it('credits a coin pocketed for the other team to that team', () => {
    const state = createMatchState(GameMode.FourPlayer);
    assignTeams(state, FOUR_PLAYER_SEATING);
    assignColors(state, PlayerSlot.One, CoinColor.White);
    state.queen = QueenState.Covered;

    // Player Two is on the opposing team; a black coin they own goes down on
    // Player Three's shot, and must land on *their* side of the scoreboard.
    play(state, engine(), [black()], { by: PlayerSlot.Three });

    expect(effectiveCoinsPocketed(state, PlayerSlot.Two)).toBe(1);
    expect(effectiveCoinsPocketed(state, PlayerSlot.Three)).toBe(0);
  });

  it('stops switching players once the match is won', () => {
    const state = createMatchState();
    bank(state, 8);
    state.queen = QueenState.Covered;
    play(state, engine(), [white()]);

    expect(state.currentPlayer).toBe(PlayerSlot.One);
  });
});

// ── notifications ─────────────────────────────────────────────────────────

describe('notifications', () => {
  it('emits every message the spec requires across the right scenarios', () => {
    const seen = new Set<string>();

    let state = createMatchState();
    play(state, engine(), [white()]).notifications.forEach((n) => seen.add(n));
    play(state, engine(), [], { madeContact: true }).notifications.forEach((n) => seen.add(n));

    state = createMatchState();
    play(state, engine(), [striker()], { madeContact: true }).notifications.forEach((n) =>
      seen.add(n),
    );

    state = createMatchState();
    play(state, engine(), [queen()], { madeContact: true }).notifications.forEach((n) =>
      seen.add(n),
    );

    for (const required of [
      Notification.YourTurn,
      Notification.OpponentTurn,
      Notification.KeepPlaying,
      Notification.Miss,
      Notification.Foul,
      Notification.QueenPocketed,
      Notification.CoverTheQueen,
    ]) {
      expect(seen.has(required)).toBe(true);
    }
  });
});
