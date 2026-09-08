/**
 * The computer opponent.
 *
 * Watches the turn machine, and when the seat it controls becomes active, walks
 * a state machine across real time: think, analyse, plan, score, choose, place,
 * aim, shoot — then hands the board back to the existing rule engine and waits
 * exactly like a human would.
 *
 * ## What makes this not cheating
 *
 * - It reads only the live board, through the same `PieceFactory` the renderer
 *   uses. No hidden state, no lookahead into the simulation.
 * - It fires through `TurnManager.executeShot`, the identical call the pointer
 *   release makes. There is no other way for it to apply force.
 * - Its aim and power carry genuine error, applied *before* the shot. When it
 *   misses, the shot vector was wrong — nothing inspects or adjusts the result.
 * - `RuleEngine` judges its shots with no knowledge of who took them.
 *
 * Time is advanced from the fixed update, so thinking never blocks rendering or
 * physics and the delay is frame-rate independent.
 */

import type { EventBus } from '../core/EventBus';
import type { PieceFactory } from '../pieces/PieceFactory';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TurnManager } from '../gameplay/TurnManager';
import type { AimSystem } from '../input/AimSystem';
import { AI_CONFIGS, AI_DEBUG, type AIConfig } from './AIConfig';
import { AIDifficulty } from './AIDifficulty';
import { AIShotExecutor } from './AIShotExecutor';
import { AIShotPlanner } from './AIShotPlanner';
import { AIShotScorer } from './AIShotScorer';
import { AITargetAnalyzer } from './AITargetAnalyzer';
import { AIQueenStrategy } from './AIQueenStrategy';
import { AIThinkingState } from './AIThinkingState';
import type { AIShotCandidate } from './AIShotCandidate';
import { IS_DEV } from '../config/GameConfig';
import { TurnState, type BoardPoint, type PlayerSlot } from '../core/types';

/** How long the aim guides are shown before the shot, in seconds. */
const AIM_DISPLAY_SECONDS = 0.45;
/** Time to slide the striker into place before aiming. */
const PLACEMENT_SECONDS = 0.3;

export class AIPlayer {
  readonly #events: EventBus;
  readonly #pieces: PieceFactory;
  readonly #turns: TurnManager;
  readonly #executor: AIShotExecutor;

  #slot: PlayerSlot | null = null;
  #difficulty: AIDifficulty = AIDifficulty.Normal;
  #config: AIConfig = AI_CONFIGS[AIDifficulty.Normal];

  #state: AIThinkingState = AIThinkingState.Idle;
  #timer = 0;
  #candidate: AIShotCandidate | null = null;
  #origin: BoardPoint = { x: 0, z: 0 };
  #announcedThinking = false;

  constructor(
    events: EventBus,
    physics: PhysicsWorld,
    pieces: PieceFactory,
    turns: TurnManager,
    aim: AimSystem,
  ) {
    this.#events = events;
    this.#pieces = pieces;
    this.#turns = turns;
    this.#executor = new AIShotExecutor(physics, turns, aim);
  }

  get state(): AIThinkingState {
    return this.#state;
  }

  get difficulty(): AIDifficulty {
    return this.#difficulty;
  }

  /** Whether a given seat is computer-controlled. */
  controls(slot: PlayerSlot): boolean {
    return this.#slot !== null && this.#slot === slot;
  }

  /** True while the AI owns the turn — used to lock human input. */
  get isActing(): boolean {
    return this.#slot !== null && this.#turns.currentPlayer === this.#slot;
  }

  /** Assign the AI to a seat. Pass null to disable it (human-only modes). */
  configure(slot: PlayerSlot | null, difficulty: AIDifficulty): void {
    this.#slot = slot;
    this.#difficulty = difficulty;
    this.#config = AI_CONFIGS[difficulty];
    this.reset();
  }

  reset(): void {
    this.#state = AIThinkingState.Idle;
    this.#timer = 0;
    this.#candidate = null;
    this.#announcedThinking = false;
    this.#executor.hideAim();
  }

  /**
   * Advance the AI. Called from the fixed update, so it is frame-rate
   * independent and cannot stall the render loop.
   */
  update(delta: number): void {
    if (this.#slot === null) return;

    const myTurn = this.#turns.currentPlayer === this.#slot;
    if (!myTurn) {
      if (this.#state !== AIThinkingState.Idle) this.reset();
      return;
    }

    // The AI may only act when the board is genuinely idle and the turn machine
    // is accepting input — the same gate a human passes.
    const ready = this.#turns.state === TurnState.StrikerPositioning;

    switch (this.#state) {
      case AIThinkingState.Idle:
        if (ready) this.#beginTurn();
        break;

      case AIThinkingState.Thinking:
        this.#timer -= delta;
        if (this.#timer <= 0) this.#decide();
        break;

      case AIThinkingState.PositioningStriker:
        this.#timer -= delta;
        if (this.#timer <= 0) this.#beginAiming();
        break;

      case AIThinkingState.Aiming:
        this.#timer -= delta;
        if (this.#timer <= 0) this.#shoot();
        break;

      case AIThinkingState.WaitingForPhysics:
        // The turn machine owns settling; when it hands the board back in a
        // positioning state, the AI's next turn (if any) starts fresh.
        if (ready) this.reset();
        break;

      default:
        break;
    }
  }

  /** Start the turn: announce, then think for a difficulty-scaled delay. */
  #beginTurn(): void {
    this.#state = AIThinkingState.TurnStart;
    this.#events.emit('ui:notify', { message: "COMPUTER'S TURN", tone: 'neutral' });

    const { thinkingDelayMin, thinkingDelayMax } = this.#config;
    this.#timer = (thinkingDelayMin + Math.random() * (thinkingDelayMax - thinkingDelayMin)) / 1000;
    this.#state = AIThinkingState.Thinking;

    if (!this.#announcedThinking) {
      this.#events.emit('ui:notify', { message: 'COMPUTER IS THINKING…', tone: 'neutral' });
      this.#announcedThinking = true;
    }
  }

  /**
   * Analyse, plan, score, choose.
   *
   * Runs once per turn rather than per frame — the board cannot change while
   * the AI is deciding, so repeating the work would be pure waste.
   */
  #decide(): void {
    if (this.#slot === null) return;

    this.#state = AIThinkingState.AnalyzingBoard;
    const snapshot = AITargetAnalyzer.analyze(this.#pieces, this.#turns.match, this.#slot);

    this.#state = AIThinkingState.GeneratingShots;
    let candidates = AIShotPlanner.plan(snapshot, this.#turns.currentSide, this.#config);

    // Queen judgement gates which candidates are even considered.
    const mustCover = AIQueenStrategy.mustCover(snapshot);
    const attemptQueen = AIQueenStrategy.shouldAttempt(snapshot, this.#config);
    candidates = AIQueenStrategy.filter(candidates, attemptQueen, mustCover);

    this.#state = AIThinkingState.ScoringShots;
    for (const candidate of candidates) {
      AIShotScorer.score(candidate, snapshot, this.#config);
    }

    this.#state = AIThinkingState.SelectingShot;
    this.#candidate = AIShotScorer.choose(candidates, this.#config);

    if (!this.#candidate) {
      // Nothing playable was found — take a safe nudge toward the pack rather
      // than stalling the match. Rare, but the turn must always end.
      this.#playFallback();
      return;
    }

    if (IS_DEV && AI_DEBUG) {
      console.info('[AI] chose', {
        target: this.#candidate.targetCoinId,
        pocket: this.#candidate.targetPocketIndex,
        cutAngleDeg: +((this.#candidate.shotAngle * 180) / Math.PI).toFixed(1),
        power: +this.#candidate.estimatedShotForce.toFixed(3),
        obstruction: +this.#candidate.pathObstruction.toFixed(2),
        score: +this.#candidate.finalScore.toFixed(3),
        considered: candidates.length,
      });
    }

    this.#state = AIThinkingState.PositioningStriker;
    this.#origin = this.#executor.place(this.#candidate, this.#turns.currentSide);
    this.#timer = PLACEMENT_SECONDS;
  }

  /**
   * Show the aim guides briefly, so the shot is legible.
   *
   * Also moves the turn machine into `AIMING`, exactly as a human pointerdown
   * does. Without this the state machine is still in positioning when the shot
   * is released and `beginShot` correctly refuses it — the AI must satisfy the
   * same preconditions as a player, not bypass them.
   */
  #beginAiming(): void {
    if (!this.#candidate) return;
    if (!this.#turns.beginAiming()) {
      this.#state = AIThinkingState.Error;
      return;
    }
    this.#state = AIThinkingState.Aiming;
    this.#executor.showAim(
      this.#origin,
      this.#candidate.requiredAimDirection,
      this.#candidate.estimatedShotForce,
    );
    this.#timer = AIM_DISPLAY_SECONDS;
  }

  #shoot(): void {
    if (!this.#candidate) return;
    this.#state = AIThinkingState.Shooting;
    this.#executor.hideAim();

    const fired = this.#executor.fire(this.#candidate, this.#origin, this.#config);
    this.#state = fired ? AIThinkingState.WaitingForPhysics : AIThinkingState.Error;
    this.#announcedThinking = false;
  }

  /** No candidate at all: a gentle shot at the middle of the board. */
  #playFallback(): void {
    const side = this.#turns.currentSide;
    const striker = this.#pieces.striker.position;
    const length = Math.hypot(striker.x, striker.z) || 1;
    const direction = { x: -striker.x / length, z: -striker.z / length };

    this.#state = AIThinkingState.Shooting;
    this.#turns.executeShot({ origin: striker, direction, power: 0.45 });
    void side;
    this.#state = AIThinkingState.WaitingForPhysics;
    this.#announcedThinking = false;
  }
}
