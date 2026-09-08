/**
 * Turns Rapier contact events into attributed game events.
 *
 * Rapier reports contacts as pairs of *collider handles* — engine integers that
 * mean nothing to the rest of the game. This translates them into piece ids and
 * an impact strength, which is the vocabulary audio, effects, and the rule
 * layer actually work in.
 *
 * Kept separate from `PhysicsWorld` so the world stays concerned with
 * simulation and this stays concerned with interpretation.
 */

import type RAPIER from '@dimforge/rapier3d-compat';

import type { EventBus } from '../core/EventBus';

export interface CollisionSystemOptions {
  /** Collider handle → piece id. Undefined means a rail or other static body. */
  readonly resolveOwner: (colliderHandle: number) => string | undefined;
  /** Current planar speed of a piece, used to weight the impact. */
  readonly speedOf: (id: string) => number;
}

/** A contact worth reacting to. */
export interface ContactReport {
  /** `piece` when two pieces met; `rail` when a piece hit the frame. */
  readonly kind: 'piece' | 'rail';
  /** Planar speed at contact, for scaling hit volume. */
  readonly impact: number;
  readonly a?: string;
  readonly b?: string;
}

export class CollisionSystem {
  readonly #events: EventBus;
  readonly #resolveOwner: CollisionSystemOptions['resolveOwner'];
  readonly #speedOf: CollisionSystemOptions['speedOf'];

  /**
   * Impacts below this are silent.
   *
   * Resting pieces in the opening arrangement touch each other constantly, and
   * without a floor every one of those contacts is reported every step. Left
   * unfiltered the bus would carry hundreds of meaningless events per second
   * and the audio layer would buzz.
   */
  static readonly #MIN_IMPACT = 0.25;

  constructor(events: EventBus, options: CollisionSystemOptions) {
    this.#events = events;
    this.#resolveOwner = options.resolveOwner;
    this.#speedOf = options.speedOf;
  }

  /** Drain one step's worth of contacts. Called after `world.step`. */
  process(queue: RAPIER.EventQueue): void {
    queue.drainCollisionEvents((handleA, handleB, started) => {
      // Only contact *starts* matter; separations are not events anyone reacts to.
      if (!started) return;

      const a = this.#resolveOwner(handleA);
      const b = this.#resolveOwner(handleB);

      // Two statics cannot collide, but guard rather than assume.
      if (a === undefined && b === undefined) return;

      const impact = Math.max(
        a !== undefined ? this.#speedOf(a) : 0,
        b !== undefined ? this.#speedOf(b) : 0,
      );
      if (impact < CollisionSystem.#MIN_IMPACT) return;

      this.#events.emit('physics:contact', {
        kind: a !== undefined && b !== undefined ? 'piece' : 'rail',
        impact,
        ...(a !== undefined ? { a } : {}),
        ...(b !== undefined ? { b } : {}),
      });
    });
  }
}
