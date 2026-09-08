/**
 * Turn state machine.
 *
 * The single authority on what the player is allowed to do right now. Input,
 * UI, and later the AI all ask this rather than tracking their own flags — the
 * reliable way to guarantee a second shot cannot be fired while the board is
 * still moving.
 *
 * This phase implements the shooting cycle only:
 *
 *   STRIKER_POSITIONING → AIMING → SHOOTING → PHYSICS_SETTLING → (back)
 *
 * Evaluation, fouls, Queen handling, and player switching are later states in
 * the same machine; they are declared in `TurnState` and wired in Phase 7.
 */

import type { EventBus } from '../core/EventBus';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { INTERACTIVE_TURN_STATES, PlayerSlot, TurnState } from '../core/types';

/**
 * Legal transitions.
 *
 * Declared as data rather than scattered through `if` statements so an illegal
 * transition is caught centrally and loudly, instead of leaving the machine in
 * a state no one intended.
 */
const TRANSITIONS: Record<TurnState, readonly TurnState[]> = {
  [TurnState.GameStart]: [TurnState.StrikerPositioning],
  [TurnState.BreakTurn]: [TurnState.StrikerPositioning],
  [TurnState.StrikerPositioning]: [TurnState.Aiming, TurnState.GameComplete],
  [TurnState.Aiming]: [TurnState.StrikerPositioning, TurnState.Shooting],
  [TurnState.Shooting]: [TurnState.PhysicsSettling],
  [TurnState.PhysicsSettling]: [TurnState.ShotEvaluation, TurnState.TurnComplete],
  [TurnState.ShotEvaluation]: [TurnState.QueenEvaluation, TurnState.FoulEvaluation],
  [TurnState.QueenEvaluation]: [TurnState.FoulEvaluation, TurnState.TurnComplete],
  [TurnState.FoulEvaluation]: [TurnState.TurnComplete],
  [TurnState.TurnComplete]: [
    TurnState.PlayerSwitch,
    TurnState.StrikerPositioning,
    TurnState.GameComplete,
  ],
  [TurnState.PlayerSwitch]: [TurnState.StrikerPositioning],
  [TurnState.GameComplete]: [],
};

export class TurnManager {
  readonly #events: EventBus;
  readonly #physics: PhysicsWorld;

  #state: TurnState = TurnState.GameStart;
  #current: PlayerSlot = PlayerSlot.One;

  constructor(events: EventBus, physics: PhysicsWorld) {
    this.#events = events;
    this.#physics = physics;
  }

  get state(): TurnState {
    return this.#state;
  }

  get currentPlayer(): PlayerSlot {
    return this.#current;
  }

  /**
   * Whether the player may touch the striker right now.
   *
   * Input asks this on every pointer event; it is the gate that makes shooting
   * mid-simulation impossible rather than merely discouraged.
   */
  get acceptsInput(): boolean {
    return INTERACTIVE_TURN_STATES.includes(this.#state);
  }

  /** Begin play. */
  start(): void {
    this.#transition(TurnState.StrikerPositioning);
  }

  /** Player has grabbed the striker and started aiming. */
  beginAiming(): boolean {
    if (this.#state !== TurnState.StrikerPositioning) return false;
    this.#transition(TurnState.Aiming);
    return true;
  }

  /** Player released without a valid shot — back to placement. */
  cancelAiming(): void {
    if (this.#state !== TurnState.Aiming) return;
    this.#transition(TurnState.StrikerPositioning);
  }

  /**
   * A shot has been released.
   *
   * Moves straight through `SHOOTING` into `PHYSICS_SETTLING` and starts the
   * settle watch. From here nothing the player does reaches the striker until
   * the board is genuinely at rest.
   */
  beginShot(): boolean {
    if (this.#state !== TurnState.Aiming) return false;
    this.#transition(TurnState.Shooting);
    this.#transition(TurnState.PhysicsSettling);
    this.#physics.beginSettleWatch();
    return true;
  }

  /**
   * Called every fixed step. While settling, watches for the board to stop.
   *
   * Rest is owned by `PhysicsWorld`, not re-derived here — one definition of
   * "stopped", used by everything.
   */
  update(): void {
    if (this.#state !== TurnState.PhysicsSettling) return;
    if (!this.#physics.isAtRest) return;

    this.#events.emit('shot:settled', { by: this.#current });

    // Phase 7 routes through evaluation, fouls, and the Queen. Until those
    // exist, the turn returns to the same player so the board stays playable.
    this.#transition(TurnState.TurnComplete);
    this.#transition(TurnState.StrikerPositioning);
  }

  /** Hand the turn to the other seat. */
  switchPlayer(): void {
    this.#current = this.#current === PlayerSlot.One ? PlayerSlot.Two : PlayerSlot.One;
    this.#events.emit('turn:playerSwitched', { to: this.#current });
  }

  #transition(to: TurnState): void {
    const allowed = TRANSITIONS[this.#state];
    if (!allowed.includes(to)) {
      // Loud rather than silent: an illegal transition means a system asked for
      // something impossible, and swallowing it hides the real bug.
      console.error(`[TurnManager] illegal transition ${this.#state} → ${to}`);
      return;
    }
    const from = this.#state;
    this.#state = to;
    this.#events.emit('turn:changed', { from, to });
  }
}
