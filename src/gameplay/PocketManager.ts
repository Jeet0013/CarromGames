/**
 * Pocket detection, the shot event log, and pocket visual feedback.
 *
 * ## Why detection is swept, not a sensor overlap test
 *
 * The obvious implementation asks each step whether a piece is *inside* a
 * pocket. At this scale that misses pockets. A piece may travel up to
 * `MAX_VELOCITY / 60` ≈ 0.37 units in one fixed step, while a pocket sensor is
 * only ~0.20 units across — so a fast coin can be on one side of a pocket at
 * step N and past it at step N+1, never once sampled inside. Rapier's own
 * sensors have the same blind spot for the same reason.
 *
 * This instead tests the *segment* each piece travelled during the step against
 * each pocket's centre, so a piece that passed over a pocket is caught however
 * fast it was moving. The cost is 4 point-to-segment distances per piece per
 * step — around 80 in total, which is nothing.
 *
 * Rules are deliberately not applied here. This reports *what happened*; Phase
 * 7 decides what it means.
 */

import * as THREE from 'three';

import { BOARD_CONFIG, POCKET_POSITIONS } from '../board/BoardConfig';
import type { EventBus } from '../core/EventBus';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { PieceFactory } from '../pieces/PieceFactory';
import type { Piece } from '../pieces/Piece';
import { PieceKind, type BoardPoint } from '../core/types';

/** One thing that happened during a shot. */
export interface ShotLogEntry {
  readonly type:
    | 'SHOT_STARTED'
    | 'COIN_POCKETED'
    | 'QUEEN_POCKETED'
    | 'STRIKER_POCKETED'
    | 'PHYSICS_SETTLED';
  /** Milliseconds since the shot began. */
  readonly at: number;
  readonly pieceId?: string;
  readonly kind?: PieceKind;
  readonly pocketIndex?: number;
}

/** How long a pocketed piece takes to drop out of sight. */
const DROP_SECONDS = 0.42;

interface DropAnimation {
  /**
   * The piece, not just its mesh.
   *
   * A pocketed piece can be put back on the board *while its drop is still
   * playing* — an uncovered Queen returns to the centre, a foul hands a coin
   * back — and the rules act the instant the board settles, which is well
   * inside the 0.42 s animation. Holding only the mesh meant the animation
   * carried on and finished by hiding a piece that was legitimately back in
   * play, leaving an invisible coin the player could still hit.
   */
  readonly piece: Piece;
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
  elapsed: number;
}

export class PocketManager {
  readonly #events: EventBus;
  readonly #physics: PhysicsWorld;
  readonly #pieces: PieceFactory;

  /** Last step's position per piece, for the swept test. */
  readonly #previous = new Map<string, BoardPoint>();
  readonly #drops: DropAnimation[] = [];

  #log: ShotLogEntry[] = [];
  #shotStart = 0;
  #shotActive = false;

  constructor(events: EventBus, physics: PhysicsWorld, pieces: PieceFactory) {
    this.#events = events;
    this.#physics = physics;
    this.#pieces = pieces;

    this.#events.on('shot:fired', () => this.beginShot());
    this.#events.on('shot:settled', () => this.#endShot());
  }

  /** Entries for the shot in progress, or the most recent one. */
  get log(): readonly ShotLogEntry[] {
    return this.#log;
  }

  /** Pieces pocketed during the current or most recent shot, in order. */
  get pocketedThisShot(): ShotLogEntry[] {
    return this.#log.filter(
      (entry) =>
        entry.type === 'COIN_POCKETED' ||
        entry.type === 'QUEEN_POCKETED' ||
        entry.type === 'STRIKER_POCKETED',
    );
  }

  beginShot(): void {
    this.#log = [];
    this.#shotStart = performance.now();
    this.#shotActive = true;
    this.#record({ type: 'SHOT_STARTED', at: 0 });
    // Seed positions so the first swept test has a valid previous point.
    this.#syncPrevious();
  }

  #endShot(): void {
    if (!this.#shotActive) return;
    this.#shotActive = false;
    this.#record({ type: 'PHYSICS_SETTLED', at: this.#now() });
  }

  /**
   * Run detection for one fixed step.
   *
   * Every active piece is tested, and every pocket — a single shot can drop
   * several coins, and each must be logged separately.
   */
  update(delta: number): void {
    for (const piece of this.#pieces.pieces) {
      if (!piece.active) continue;

      const current = piece.position;
      const previous = this.#previous.get(piece.id) ?? current;

      const pocketIndex = this.#sweptPocketHit(previous, current);
      if (pocketIndex >= 0) {
        this.#pocket(piece, pocketIndex);
        // Must not fall through to the re-seed below. `#pocket` clears this
        // piece's previous position precisely so a later restore starts fresh;
        // storing `current` here would put the *pocket's* coordinates back.
        //
        // That was a real bug: a striker restored to its baseline after a foul
        // then had a previous position inside the pocket, so the swept test
        // drew a segment from the pocket to the baseline, found it passed
        // through the pocket, and instantly pocketed it again — leaving an
        // invisible striker and a board that could not be played. Returned
        // coins and the Queen were hit by the same thing.
        continue;
      }

      this.#previous.set(piece.id, current);
    }

    this.#advanceDrops(delta);
  }

  /**
   * Index of the pocket the piece's path passed over, or −1.
   *
   * Point-to-segment distance rather than point-to-point, which is what makes
   * this immune to the piece stepping clean over a pocket.
   */
  #sweptPocketHit(from: BoardPoint, to: BoardPoint): number {
    const radius = BOARD_CONFIG.pocket.sensorRadius;

    for (let i = 0; i < POCKET_POSITIONS.length; i += 1) {
      const pocket = POCKET_POSITIONS[i];
      if (!pocket) continue;

      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const lengthSq = dx * dx + dz * dz;

      let closestX: number;
      let closestZ: number;

      if (lengthSq < 1e-12) {
        // Piece did not move this step — a plain distance test.
        closestX = from.x;
        closestZ = from.z;
      } else {
        // Project the pocket centre onto the travelled segment, clamped to it.
        const t = Math.max(
          0,
          Math.min(1, ((pocket.x - from.x) * dx + (pocket.z - from.z) * dz) / lengthSq),
        );
        closestX = from.x + dx * t;
        closestZ = from.z + dz * t;
      }

      if (Math.hypot(pocket.x - closestX, pocket.z - closestZ) <= radius) return i;
    }

    return -1;
  }

  /** Take the piece out of play, log it, and start the drop animation. */
  #pocket(piece: Piece, pocketIndex: number): void {
    const pocket = POCKET_POSITIONS[pocketIndex];
    if (!pocket) return;

    const meshPosition = piece.mesh.position.clone();
    piece.pocket(this.#physics);
    this.#previous.delete(piece.id);

    // `pocket()` hides the mesh; the drop animation needs it visible.
    piece.mesh.visible = true;
    this.#drops.push({
      piece,
      from: meshPosition,
      to: new THREE.Vector3(pocket.x, -BOARD_CONFIG.pocket.dropDepth, pocket.z),
      elapsed: 0,
    });

    const type =
      piece.kind === PieceKind.Striker
        ? 'STRIKER_POCKETED'
        : piece.kind === PieceKind.Queen
          ? 'QUEEN_POCKETED'
          : 'COIN_POCKETED';

    this.#record({ type, at: this.#now(), pieceId: piece.id, kind: piece.kind, pocketIndex });

    this.#events.emit('pocket:scored', {
      pieceId: piece.id,
      kind: piece.kind,
      pocketIndex,
    });
  }

  /** Ease the mesh into the pocket, shrinking as it falls, then hide it. */
  #advanceDrops(delta: number): void {
    for (let i = this.#drops.length - 1; i >= 0; i -= 1) {
      const drop = this.#drops[i];
      if (!drop) continue;

      // The piece was returned to the board mid-drop: abandon the animation
      // and hand the mesh back to the simulation.
      if (drop.piece.active) {
        drop.piece.mesh.scale.setScalar(1);
        drop.piece.mesh.visible = true;
        this.#drops.splice(i, 1);
        continue;
      }

      drop.elapsed += delta;
      const t = Math.min(1, drop.elapsed / DROP_SECONDS);
      // Ease-in: a coin dropping accelerates, it does not glide.
      const eased = t * t;

      drop.piece.mesh.position.lerpVectors(drop.from, drop.to, eased);
      drop.piece.mesh.scale.setScalar(1 - eased * 0.45);

      if (t >= 1) {
        drop.piece.mesh.visible = false;
        drop.piece.mesh.scale.setScalar(1);
        this.#drops.splice(i, 1);
      }
    }
  }

  /** Forget per-shot state. Called by `resetBoard()`. */
  reset(): void {
    this.#log = [];
    this.#shotActive = false;
    this.#previous.clear();
    for (const drop of this.#drops) {
      drop.piece.mesh.scale.setScalar(1);
      drop.piece.mesh.visible = true;
    }
    this.#drops.length = 0;
  }

  #syncPrevious(): void {
    this.#previous.clear();
    for (const piece of this.#pieces.pieces) {
      if (piece.active) this.#previous.set(piece.id, piece.position);
    }
  }

  #record(entry: ShotLogEntry): void {
    this.#log.push(entry);
  }

  #now(): number {
    return Math.round(performance.now() - this.#shotStart);
  }
}
