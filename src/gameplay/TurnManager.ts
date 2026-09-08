/**
 * Turn state machine and the bridge between physics and the rules.
 *
 * The single authority on what is legal right now. Input, UI, and the AI ask
 * this rather than tracking their own flags — the reliable way to guarantee a
 * second shot cannot be fired while the board is still moving.
 *
 * On settle it drives the full evaluation chain, then carries out the physical
 * consequences the (pure) rule engine asked for:
 *
 *   PHYSICS_SETTLING → SHOT_EVALUATION → QUEEN_EVALUATION → FOUL_EVALUATION
 *                    → TURN_COMPLETE → PLAYER_SWITCH | STRIKER_POSITIONING
 */


import type { EventBus } from '../core/EventBus';
import {
  assignTeams,
  createMatchState,
  nextSeat,
  sideOf,
  type MatchState,
} from '../core/GameState';
import {
  FOUR_PLAYER_SEATING,
  FOUR_PLAYER_TEAMS,
  type FourPlayerRuleSet,
} from './FourPlayerRuleSet';
import { TurnOrderManager } from './TurnOrderManager';
import { strikerHome, type PlayerSide } from '../core/PlayerSide';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PIECE_GEOMETRY } from '../physics/PhysicsConfig';
import type { PieceFactory } from '../pieces/PieceFactory';
import type { PocketManager } from './PocketManager';
import { findFreePlacement } from './Placement';
import { RuleEngine, Notification, type RuleDecision } from './RuleEngine';
import { CLASSIC_CASUAL, type RuleSet } from './RuleSet';
import { ShotEvaluator } from './ShotEvaluator';
import {
  GameMode,
  INTERACTIVE_TURN_STATES,
  PieceKind,
  PlayerSlot,
  QueenState,
  TurnState,
  type BoardPoint,
} from '../core/types';

/** Legal transitions, declared as data so an illegal one is caught centrally. */
const TRANSITIONS: Record<TurnState, readonly TurnState[]> = {
  [TurnState.GameStart]: [TurnState.BreakTurn, TurnState.StrikerPositioning],
  [TurnState.BreakTurn]: [TurnState.StrikerPositioning],
  [TurnState.StrikerPositioning]: [TurnState.Aiming, TurnState.GameComplete],
  [TurnState.Aiming]: [TurnState.StrikerPositioning, TurnState.Shooting],
  [TurnState.Shooting]: [TurnState.PhysicsSettling],
  [TurnState.PhysicsSettling]: [TurnState.ShotEvaluation],
  [TurnState.ShotEvaluation]: [TurnState.QueenEvaluation],
  [TurnState.QueenEvaluation]: [TurnState.FoulEvaluation],
  [TurnState.FoulEvaluation]: [TurnState.TurnComplete],
  [TurnState.TurnComplete]: [
    TurnState.PlayerSwitch,
    TurnState.StrikerPositioning,
    TurnState.GameComplete,
  ],
  [TurnState.PlayerSwitch]: [TurnState.StrikerPositioning],
  [TurnState.GameComplete]: [TurnState.GameStart],
};

export class TurnManager {
  readonly #events: EventBus;
  readonly #physics: PhysicsWorld;
  readonly #pieces: PieceFactory;
  readonly #pockets: PocketManager;
  readonly #engine: RuleEngine;

  #state: TurnState = TurnState.GameStart;
  #match: MatchState = createMatchState();
  #mode: GameMode = GameMode.LocalMultiplayer;
  #seats: Array<{ slot: PlayerSlot; side: PlayerSide }> = [];
  #turnOrder: TurnOrderManager | undefined;
  #fourPlayerRules: FourPlayerRuleSet = FOUR_PLAYER_TEAMS;
  /** Did the striker touch anything this shot? Drives the no-contact foul. */
  #contactThisShot = false;

  constructor(
    events: EventBus,
    physics: PhysicsWorld,
    pieces: PieceFactory,
    pockets: PocketManager,
    rules: RuleSet = CLASSIC_CASUAL,
  ) {
    this.#events = events;
    this.#physics = physics;
    this.#pieces = pieces;
    this.#pockets = pockets;
    this.#engine = new RuleEngine(rules);

    this.#events.on('physics:contact', () => {
      this.#contactThisShot = true;
    });
  }

  get state(): TurnState {
    return this.#state;
  }

  get match(): MatchState {
    return this.#match;
  }

  get currentPlayer(): PlayerSlot {
    return this.#match.currentPlayer;
  }

  /** Which edge the active seat shoots from. */
  get currentSide(): PlayerSide {
    return sideOf(this.#match, this.#match.currentPlayer);
  }

  get engine(): RuleEngine {
    return this.#engine;
  }

  /**
   * Whether the player may touch the striker.
   *
   * The gate every pointer event passes. A finished match accepts nothing.
   */
  get acceptsInput(): boolean {
    return this.#match.winner === null && INTERACTIVE_TURN_STATES.includes(this.#state);
  }

  start(): void {
    // `setMode` configures seats, which resets straight into positioning, so
    // starting is often a no-op by the time it is called. Transitioning
    // regardless would log an illegal STRIKER_POSITIONING → STRIKER_POSITIONING.
    if (this.#state !== TurnState.StrikerPositioning) {
      this.#state = TurnState.GameStart;
      this.#transition(TurnState.StrikerPositioning);
    }
    this.#events.emit('ui:notify', { message: Notification.YourTurn, tone: 'neutral' });
  }

  /**
   * Set which seats play, and in what order.
   *
   * Stored on match state so turn passing and striker placement stay data
   * driven — adding the four-player seats is a layout entry, not new logic.
   */
  configureSeats(
    mode: GameMode,
    seats: ReadonlyArray<{ slot: PlayerSlot; side: PlayerSide }>,
  ): void {
    this.#seats = seats.map((seat) => ({ ...seat }));
    this.#mode = mode;
    this.#turnOrder = new TurnOrderManager(this.#seats.map((seat) => seat.slot));
    this.reset();
  }

  get turnOrder(): TurnOrderManager | undefined {
    return this.#turnOrder;
  }

  get fourPlayerRules(): FourPlayerRuleSet {
    return this.#fourPlayerRules;
  }

  /** Reset for a new match. */
  reset(): void {
    this.#match = createMatchState(this.#mode);
    if (this.#seats.length > 0) {
      this.#match.seatOrder = this.#seats.map((seat) => seat.slot);
      for (const seat of this.#seats) this.#match.players[seat.slot].side = seat.side;
      const first = this.#seats[0];
      if (first) this.#match.currentPlayer = first.slot;

      // Partners share a colour and a win condition, so team state is built
      // here and the rule engine reaches it through `effectiveColor`.
      if (this.#mode === GameMode.FourPlayer) {
        assignTeams(this.#match, FOUR_PLAYER_SEATING);
      }
      this.#turnOrder?.reset();
      this.#turnOrder?.setCurrent(this.#match.currentPlayer);
    }
    this.#contactThisShot = false;
    if (this.#state === TurnState.GameComplete) this.#transition(TurnState.GameStart);
    this.#state = TurnState.StrikerPositioning;
  }

  beginAiming(): boolean {
    if (this.#state !== TurnState.StrikerPositioning) return false;
    this.#transition(TurnState.Aiming);
    return true;
  }

  cancelAiming(): void {
    if (this.#state !== TurnState.Aiming) return;
    this.#transition(TurnState.StrikerPositioning);
  }

  beginShot(): boolean {
    if (this.#state !== TurnState.Aiming) return false;
    this.#contactThisShot = false;
    this.#transition(TurnState.Shooting);
    this.#transition(TurnState.PhysicsSettling);
    this.#physics.beginSettleWatch();
    return true;
  }

  /** Called every fixed step. Detects settle and runs evaluation once. */
  update(): void {
    if (this.#state !== TurnState.PhysicsSettling) return;
    if (!this.#physics.isAtRest) return;

    this.#events.emit('shot:settled', { by: this.currentPlayer });
    this.#resolveShot();
  }

  /**
   * Run the rule chain and apply its consequences.
   *
   * The engine is pure — it decides, this acts. Keeping the board mutations
   * here means every rule remains testable without a physics world.
   */
  #resolveShot(): void {
    const shooter = this.currentPlayer;

    const pocketed = this.#pockets.pocketedThisShot.map((entry) => ({
      pieceId: entry.pieceId ?? '',
      kind: entry.kind ?? PieceKind.WhiteCoin,
      pocketIndex: entry.pocketIndex ?? 0,
    }));

    const outcome = ShotEvaluator.evaluate(this.#match, {
      by: shooter,
      pocketed,
      madeContact: this.#contactThisShot,
    });

    this.#transition(TurnState.ShotEvaluation);
    const decision = this.#engine.evaluate(this.#match, outcome);

    this.#transition(TurnState.QueenEvaluation);
    if (decision.returnQueenToCentre) this.#returnQueen();

    this.#transition(TurnState.FoulEvaluation);
    this.#applyCoinReturns(shooter, decision);

    // Commit to state only after the board changes it implies are done.
    this.#engine.apply(this.#match, outcome, decision);

    this.#announce(decision);

    this.#transition(TurnState.TurnComplete);

    if (decision.winner !== null) {
      this.#transition(TurnState.GameComplete);
      this.#events.emit('rules:gameComplete', { winner: decision.winner });
      return;
    }

    if (!decision.continueTurn) {
      this.#transition(TurnState.PlayerSwitch);
      this.#events.emit('turn:playerSwitched', { to: this.#match.currentPlayer });
    }

    this.#resetStrikerForTurn();
    this.#transition(TurnState.StrikerPositioning);
  }

  /** Emit notifications and keep the standing-obligation banner honest. */
  #announce(decision: RuleDecision): void {
    for (const message of decision.notifications) {
      // COVER THE QUEEN is a standing obligation, not an event; it is pinned
      // separately rather than fading after a couple of seconds.
      if (message === Notification.CoverTheQueen) continue;
      const tone =
        message === Notification.Foul || message === Notification.Miss
          ? 'bad'
          : message === Notification.KeepPlaying || message === Notification.QueenCovered
            ? 'good'
            : 'neutral';
      this.#events.emit('ui:notify', { message, tone });
    }

    this.#events.emit('queen:banner', {
      message:
        this.#match.queen === QueenState.PocketedPendingCover ||
        decision.queenState === QueenState.PocketedPendingCover
          ? Notification.CoverTheQueen
          : null,
    });

    if (decision.ownershipAssigned) {
      this.#events.emit('rules:ownershipAssigned', decision.ownershipAssigned);
    }
    for (const foul of decision.fouls) {
      this.#events.emit('rules:foul', { player: decision.winner ?? this.currentPlayer, kind: foul });
    }
    if (decision.queenTransition) {
      this.#events.emit('queen:stateChanged', decision.queenTransition);
    }
  }

  /** Put the Queen back as near the centre as there is room for. */
  #returnQueen(): void {
    const queen = this.#pieces.queen;
    const at = findFreePlacement({
      occupied: this.#occupiedPositions(queen.id),
      radius: PIECE_GEOMETRY.coin.radius,
      preferred: { x: 0, z: 0 },
    });
    queen.reset(this.#physics, at);
  }

  /**
   * Hand back coins the foul penalty demands.
   *
   * A player with nothing banked cannot pay; the engine has already marked
   * that penalty deferred and turned it into debt, so nothing happens here.
   */
  #applyCoinReturns(shooter: PlayerSlot, decision: RuleDecision): void {
    if (decision.coinsToReturn <= 0) return;

    const color = this.#match.players[shooter].color;
    if (color === null) return;

    const candidates = this.#pieces.pieces.filter(
      (piece) => piece.pocketed && piece.color === color,
    );

    for (let i = 0; i < decision.coinsToReturn && i < candidates.length; i += 1) {
      const piece = candidates[i];
      if (!piece) continue;
      const at = findFreePlacement({
        occupied: this.#occupiedPositions(piece.id),
        radius: PIECE_GEOMETRY.coin.radius,
        preferred: { x: 0, z: 0 },
      });
      piece.reset(this.#physics, at);
    }
  }

  #occupiedPositions(excludeId: string): BoardPoint[] {
    return this.#pieces.pieces
      .filter((piece) => piece.active && piece.id !== excludeId)
      .map((piece) => piece.position);
  }

  /** Park the striker on the incoming seat's baseline, wherever that edge is. */
  #resetStrikerForTurn(): void {
    const striker = this.#pieces.striker;
    if (striker.pocketed) striker.reset(this.#physics, striker.home);
    const home = strikerHome(this.currentSide);
    this.#physics.setPosition('striker', home.x, home.z);
    void PIECE_GEOMETRY;
  }

  /** Hand the turn over explicitly. Follows `seatOrder`, so 2P and 4P both work. */
  switchPlayer(): void {
    this.#match.currentPlayer = nextSeat(this.#match, this.#match.currentPlayer);
    this.#events.emit('turn:playerSwitched', { to: this.#match.currentPlayer });
    this.#resetStrikerForTurn();
  }

  #transition(to: TurnState): void {
    const allowed = TRANSITIONS[this.#state];
    if (!allowed.includes(to)) {
      console.error(`[TurnManager] illegal transition ${this.#state} → ${to}`);
      return;
    }
    const from = this.#state;
    this.#state = to;
    this.#events.emit('turn:changed', { from, to });
  }
}
