/**
 * Turns a chosen candidate into a real shot.
 *
 * Every step goes through the systems a human uses: the striker is placed with
 * the same baseline clamp, the aim guides are the same `AimSystem`, and the
 * shot is fired with `TurnManager.executeShot` — the identical call the pointer
 * release makes. There is no AI-only path into physics.
 */

import { clampToBaseline, type PlayerSide } from '../core/PlayerSide';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TurnManager } from '../gameplay/TurnManager';
import type { AimSystem } from '../input/AimSystem';
import { PIECE_GEOMETRY } from '../physics/PhysicsConfig';
import { AIErrorSystem, type ShotError } from './AIErrorSystem';
import type { AIShotCandidate } from './AIShotCandidate';
import type { AIConfig } from './AIConfig';
import type { BoardPoint, ShotCommand } from '../core/types';

export class AIShotExecutor {
  readonly #physics: PhysicsWorld;
  readonly #turns: TurnManager;
  readonly #aim: AimSystem;

  constructor(physics: PhysicsWorld, turns: TurnManager, aim: AimSystem) {
    this.#physics = physics;
    this.#turns = turns;
    this.#aim = aim;
  }

  /**
   * Slide the striker to the candidate's placement.
   *
   * Runs through the same clamp the pointer path uses, so an AI cannot end up
   * anywhere a player could not also reach.
   */
  place(candidate: AIShotCandidate, side: PlayerSide): BoardPoint {
    const at = clampToBaseline(side, candidate.strikerPosition, PIECE_GEOMETRY.striker.radius);
    this.#physics.setPosition('striker', at.x, at.z);
    return at;
  }

  /**
   * Show the aim, so the player can read the computer's intent.
   *
   * Uses the real `AimSystem`, meaning the line, arrow, and power meter the AI
   * displays are literally the ones a human sees while dragging.
   */
  showAim(origin: BoardPoint, direction: BoardPoint, power: number): void {
    // The pull line is drawn behind the striker, mirroring a human drag.
    const pullBack: BoardPoint = {
      x: origin.x - direction.x * (0.6 + power * 1.8),
      z: origin.z - direction.z * (0.6 + power * 1.8),
    };
    this.#aim.show(origin, direction, power, pullBack);
  }

  hideAim(): void {
    this.#aim.hide();
  }

  /** Apply difficulty error and fire. Returns the shot actually taken. */
  fire(
    candidate: AIShotCandidate,
    origin: BoardPoint,
    config: AIConfig,
    random: () => number = Math.random,
  ): { shot: ShotCommand; error: ShotError } | null {
    const error = AIErrorSystem.compute(config, random);

    const direction = AIErrorSystem.applyAim(
      candidate.requiredAimDirection,
      error.aimErrorRadians,
    );
    const power = Math.min(1, Math.max(0.04, candidate.estimatedShotForce * error.powerScale));

    const shot: ShotCommand = { origin, direction, power };
    if (!this.#turns.executeShot(shot)) return null;
    return { shot, error };
  }
}
