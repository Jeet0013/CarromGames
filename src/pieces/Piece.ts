/**
 * Base game piece: a mesh, a physics body, and the state the rules care about.
 *
 * A piece never decides anything. It knows where it is and whether it is still
 * in play; the rule layer decides what that means. Keeping it that passive is
 * what lets `gameplay/` be driven headlessly.
 */

import type * as THREE from 'three';

import type { PhysicsHandle, PhysicsWorld } from '../physics/PhysicsWorld';
import type { BoardPoint, CoinColor, PieceKind, PlayerSlot } from '../core/types';

export interface PieceOptions {
  readonly id: string;
  readonly kind: PieceKind;
  readonly mesh: THREE.Object3D;
  readonly handle: PhysicsHandle;
  /** White or black for a coin; null for the Queen and striker. */
  readonly color: CoinColor | null;
  /** Home position, used by `reset()`. */
  readonly home: BoardPoint;
}

export class Piece {
  readonly id: string;
  readonly kind: PieceKind;
  readonly mesh: THREE.Object3D;
  readonly color: CoinColor | null;
  readonly home: BoardPoint;

  #handle: PhysicsHandle;

  /**
   * Which seat owns this piece.
   *
   * Null until the first valid pocket assigns colours — Carrom does not decide
   * ownership at setup, so neither does this.
   */
  owner: PlayerSlot | null = null;

  /** In play: simulated, rendered, and collidable. */
  #active = true;
  /** Has been pocketed. A pocketed piece is always inactive. */
  #pocketed = false;

  constructor(options: PieceOptions) {
    this.id = options.id;
    this.kind = options.kind;
    this.mesh = options.mesh;
    this.color = options.color;
    this.home = options.home;
    this.#handle = options.handle;
  }

  get active(): boolean {
    return this.#active;
  }

  get pocketed(): boolean {
    return this.#pocketed;
  }

  get handle(): PhysicsHandle {
    return this.#handle;
  }

  /** Current board position, read from the simulation. */
  get position(): BoardPoint {
    const t = this.#handle.body.translation();
    return { x: t.x, z: t.z };
  }

  /** Current planar speed. */
  get speed(): number {
    const v = this.#handle.body.linvel();
    return Math.hypot(v.x, v.z);
  }

  /** Copy the simulated transform onto the mesh. Called once per frame. */
  sync(): void {
    if (!this.#active) return;
    const t = this.#handle.body.translation();
    const r = this.#handle.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  /**
   * Take the piece out of play.
   *
   * The body is removed from the world rather than merely disabled: a pocketed
   * coin must stop participating in collisions *and* in rest detection, and a
   * body left in the world would keep being polled by both.
   */
  pocket(physics: PhysicsWorld): void {
    if (this.#pocketed) return;
    this.#pocketed = true;
    this.#active = false;
    physics.removeBody(this.id);
    this.mesh.visible = false;
  }

  /** Return the piece to a position and put it back in play. */
  reset(physics: PhysicsWorld, at: BoardPoint = this.home): void {
    if (this.#pocketed) {
      // Rebuild the body that `pocket()` removed.
      this.#handle = physics.createPieceBody({
        ...this.bodyTemplate,
        id: this.id,
        x: at.x,
        z: at.z,
      });
      this.#pocketed = false;
    } else {
      physics.setPosition(this.id, at.x, at.z);
    }

    this.#active = true;
    this.mesh.visible = true;
    this.sync();
  }

  /**
   * Body parameters, kept so a pocketed piece can be recreated identically.
   * Assigned by `PieceFactory` at construction.
   */
  bodyTemplate!: {
    readonly radius: number;
    readonly halfThickness: number;
    readonly mass: number;
    readonly friction: number;
    readonly restitution: number;
    readonly ccd?: boolean;
  };
}
