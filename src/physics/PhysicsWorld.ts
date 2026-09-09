/**
 * Rapier world ownership.
 *
 * ## Pieces are constrained to the play plane
 *
 * Every piece has Y translation and X/Z rotation disabled, leaving three
 * degrees of freedom: slide in X, slide in Z, spin about Y. That is exactly
 * what a Carrom coin does on a board, and removing the other three eliminates
 * the entire class of failures a naive 3D setup produces — coins riding up over
 * one another, tipping onto their edge, or jittering against a floor collider.
 *
 * World gravity is therefore zero: with Y locked it would do nothing anyway.
 * `PHYSICS_CONFIG.GRAVITY_Y` is still used as the `g` in the friction model
 * below.
 *
 * ## Friction is applied by hand, not by the solver
 *
 * Because pieces never touch a floor collider, there is no contact for Rapier
 * to apply surface friction at. Each step this class applies a Coulomb
 * deceleration `μ·g` opposing motion instead.
 *
 * That is also the more faithful model. Coulomb friction decelerates a sliding
 * coin *linearly* and brings it to a genuine stop in finite time. The usual
 * shortcut — exponential linear damping — only approaches zero asymptotically,
 * so coins creep indefinitely and "all pieces at rest", which every turn
 * transition depends on, becomes an arbitrary cutoff rather than a fact.
 */

import RAPIER from '@dimforge/rapier3d-compat';

import { BOARD_CONFIG } from '../board/BoardConfig';
import type { EventBus } from '../core/EventBus';
import { CollisionSystem } from './CollisionSystem';
import { PHYSICS_CONFIG } from './PhysicsConfig';

/** A body owned by the world, tagged so collisions can be attributed. */
export interface PhysicsHandle {
  readonly id: string;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
}

export interface PieceBodyOptions {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly halfThickness: number;
  readonly mass: number;
  readonly friction: number;
  readonly restitution: number;
  /** Continuous collision detection. Worth it for the striker only. */
  readonly ccd?: boolean;
}

/**
 * How slick a powdered board is, and for how long.
 *
 * `STRENGTH` is the friction multiplier at full effect: 0.40 means the board
 * keeps 40% of its friction, so it is 60% slicker than bare. It was 0.55, and
 * at that value a rebound rarely had enough left to cross the board a second
 * time — the bank shot behind the striker line was luck rather than a play.
 *
 * The figure was also written twice: once as this default and once as a
 * literal inside the decay, which interpolates back toward a bare board. They
 * agreed, so nothing was wrong — but changing one would have powdered the
 * board at one strength and decayed it toward another, and the symptom would
 * have been a board that mysteriously got slicker as the powder wore off.
 */
const POWDER = {
  STRENGTH: 0.4,
  SECONDS: 40,
} as const;

export class PhysicsWorld {
  readonly #world: RAPIER.World;
  readonly #queue: RAPIER.EventQueue;
  readonly #collisions: CollisionSystem;

  /** Every dynamic piece body, by id. */
  readonly #bodies = new Map<string, PhysicsHandle>();
  /** Collider handle → piece id, for attributing collision events. */
  readonly #colliderOwners = new Map<number, string>();
  /** Static rail bodies, kept for teardown. */
  readonly #rails: RAPIER.RigidBody[] = [];

  /**
   * Board friction multiplier, 1 = bare board.
   *
   * Powdering a Carrom board is a real part of playing it: boric acid powder
   * is scattered to cut friction so coins glide. It wears off as coins sweep
   * it aside, so this decays back to 1 rather than toggling — which is what
   * makes it a resource to spend rather than a switch to leave on.
   */
  #frictionScale = 1;
  #powderRemaining = 0;
  #powderDuration = 0;

  // Rest detection.
  #restTimer = 0;
  #settleElapsed = 0;
  #watching = false;
  #atRest = true;

  constructor(events: EventBus) {
    // Zero gravity: pieces are plane-locked, so gravity has nothing to act on.
    this.#world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.#world.timestep = PHYSICS_CONFIG.FIXED_TIME_STEP;
    this.#queue = new RAPIER.EventQueue(true);

    this.#collisions = new CollisionSystem(events, {
      resolveOwner: (handle) => this.#colliderOwners.get(handle),
      speedOf: (id) => this.speedOf(id),
    });

    this.#createRails();
  }

  get world(): RAPIER.World {
    return this.#world;
  }

  /** True once every body has been below the rest thresholds long enough. */
  get isAtRest(): boolean {
    return this.#atRest;
  }

  get bodyCount(): number {
    return this.#bodies.size;
  }

  /**
   * Begin watching for the board to settle.
   *
   * Called when a shot is fired. `isAtRest` goes false immediately and only
   * returns true once every body has held still for
   * `REST_CONFIRMATION_SECONDS` — the confirmation window stops a coin pausing
   * at the apex of a collision from being mistaken for a settled board.
   */
  beginSettleWatch(): void {
    this.#watching = true;
    this.#atRest = false;
    this.#restTimer = 0;
    this.#settleElapsed = 0;
  }

  /**
   * Static colliders for the four rails.
   *
   * Built as four cuboids rather than one hollow shape because Rapier has no
   * concave primitive; each is inset so its inner face lands exactly on the
   * playing surface edge that `BoardConfig` defines.
   */
  #createRails(): void {
    const half = BOARD_CONFIG.halfSurface;
    const width = BOARD_CONFIG.frame.width;
    const height = BOARD_CONFIG.frame.height;
    const centre = half + width / 2;
    // Overlap the corners so a coin cannot squeeze through the seam between
    // two rails.
    const span = half + width;

    const rails: Array<{ x: number; z: number; hx: number; hz: number }> = [
      { x: 0, z: centre, hx: span, hz: width / 2 },
      { x: 0, z: -centre, hx: span, hz: width / 2 },
      { x: centre, z: 0, hx: width / 2, hz: span },
      { x: -centre, z: 0, hx: width / 2, hz: span },
    ];

    for (const rail of rails) {
      const body = this.#world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(rail.x, 0, rail.z),
      );
      const collider = RAPIER.ColliderDesc.cuboid(rail.hx, height, rail.hz)
        .setFriction(PHYSICS_CONFIG.WALL_FRICTION)
        .setRestitution(PHYSICS_CONFIG.WALL_RESTITUTION)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      this.#world.createCollider(collider, body);
      this.#rails.push(body);
    }
  }

  /** Create a plane-locked disc body for a coin, Queen, or striker. */
  createPieceBody(options: PieceBodyOptions): PhysicsHandle {
    const body = this.#world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(options.x, options.halfThickness, options.z)
        .setLinearDamping(PHYSICS_CONFIG.LINEAR_DAMPING)
        .setAngularDamping(PHYSICS_CONFIG.ANGULAR_DAMPING)
        // Rapier's own sleeping is disabled: this class owns rest detection,
        // and a body the engine has put to sleep reports zero velocity, which
        // would make the two disagree.
        .setCanSleep(false)
        .setCcdEnabled(options.ccd ?? false),
    );

    // The plane lock — X/Z slide and Y spin only.
    body.setEnabledTranslations(true, false, true, false);
    body.setEnabledRotations(false, true, false, false);

    const collider = this.#world.createCollider(
      RAPIER.ColliderDesc.cylinder(options.halfThickness, options.radius)
        .setMass(options.mass)
        .setFriction(options.friction)
        .setRestitution(options.restitution)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );

    const handle: PhysicsHandle = { id: options.id, body, collider };
    this.#bodies.set(options.id, handle);
    this.#colliderOwners.set(collider.handle, options.id);
    return handle;
  }

  get(id: string): PhysicsHandle | undefined {
    return this.#bodies.get(id);
  }

  /** Remove a body from the simulation — used when a piece is pocketed. */
  removeBody(id: string): void {
    const handle = this.#bodies.get(id);
    if (!handle) return;
    this.#colliderOwners.delete(handle.collider.handle);
    this.#bodies.delete(id);
    this.#world.removeRigidBody(handle.body);
  }

  /** Remove every piece body, leaving the rails. Used by `resetBoard()`. */
  clearPieces(): void {
    for (const id of [...this.#bodies.keys()]) this.removeBody(id);
    this.#atRest = true;
    this.#watching = false;
  }

  /** 0–1: how much powder is still on the board. Drives the visual fade. */
  get powderLevel(): number {
    return this.#powderDuration > 0 ? this.#powderRemaining / this.#powderDuration : 0;
  }

  get frictionScale(): number {
    return this.#frictionScale;
  }

  /**
   * Planar speed of one body, or 0 if it is not in the world.
   *
   * Read by the powder trail, which needs to know how hard the striker is
   * travelling. The collision system already computed this inline for its own
   * purposes; this is the same thing with a name.
   */
  speedOf(id: string): number {
    const body = this.#bodies.get(id)?.body;
    if (!body) return 0;
    const v = body.linvel();
    return Math.hypot(v.x, v.z);
  }

  /**
   * Scatter powder on the board.
   *
   * @param strength  friction multiplier at full effect; see `POWDER`
   * @param seconds   how long it lasts before the board is bare again
   */
  applyPowder(strength = POWDER.STRENGTH, seconds = POWDER.SECONDS): void {
    this.#powderDuration = seconds;
    this.#powderRemaining = seconds;
    this.#frictionScale = strength;
  }

  /** Apply a planar impulse. The single place shot force enters the world. */
  applyImpulse(id: string, x: number, z: number): void {
    const handle = this.#bodies.get(id);
    if (!handle) return;
    handle.body.applyImpulse({ x, y: 0, z }, true);
    this.#clampVelocity(handle.body);
  }

  /** Teleport a body, clearing its motion. Used for striker placement. */
  setPosition(id: string, x: number, z: number): void {
    const handle = this.#bodies.get(id);
    if (!handle) return;
    const y = handle.body.translation().y;
    handle.body.setTranslation({ x, y, z }, true);
    handle.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    handle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /**
   * Advance the simulation one fixed step.
   *
   * Order matters: friction is applied *before* stepping so the solver sees
   * the reduced velocity, and clamping runs after so a collision impulse
   * cannot leave a body above the ceiling.
   */
  step(delta: number): void {
    this.#updatePowder(delta);
    this.#applySurfaceFriction(delta);
    this.#world.step(this.#queue);
    this.#collisions.process(this.#queue);

    for (const handle of this.#bodies.values()) this.#clampVelocity(handle.body);

    if (this.#watching) this.#updateRestDetection(delta);
  }

  /**
   * Coulomb friction: a constant deceleration opposing motion.
   *
   * The impulse is clamped to the body's current momentum so friction can slow
   * a coin to exactly zero but never push it backwards — the failure that
   * makes naive implementations jitter around rest.
   */
  /**
   * Wear the powder off.
   *
   * Eased rather than linear: powder feels slick for most of its life and then
   * fades, instead of the board getting steadily stickier from the first shot,
   * which would make the effect hard to notice at all.
   */
  #updatePowder(delta: number): void {
    if (this.#powderRemaining <= 0) {
      this.#frictionScale = 1;
      return;
    }
    this.#powderRemaining = Math.max(0, this.#powderRemaining - delta);
    const level = this.#powderRemaining / this.#powderDuration;
    const eased = level * level * (3 - 2 * level);
    // Interpolate from bare board (1) toward the powdered value.
    this.#frictionScale = 1 - (1 - POWDER.STRENGTH) * eased;
  }

  #applySurfaceFriction(delta: number): void {
    const g = Math.abs(PHYSICS_CONFIG.GRAVITY_Y);
    const decel = PHYSICS_CONFIG.BOARD_FRICTION * this.#frictionScale * g * delta;

    for (const handle of this.#bodies.values()) {
      const body = handle.body;
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.z);

      if (speed > 1e-6) {
        const drop = Math.min(decel, speed);
        const scale = (speed - drop) / speed;
        body.setLinvel({ x: v.x * scale, y: 0, z: v.z * scale }, true);
      } else if (speed > 0) {
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }

      // Same treatment for spin.
      const w = body.angvel();
      const spin = Math.abs(w.y);
      if (spin > 1e-6) {
        const drop = Math.min(PHYSICS_CONFIG.SPIN_FRICTION * delta, spin);
        const sign = w.y >= 0 ? 1 : -1;
        body.setAngvel({ x: 0, y: sign * (spin - drop), z: 0 }, true);
      }
    }
  }

  #clampVelocity(body: RAPIER.RigidBody): void {
    const v = body.linvel();
    const speed = Math.hypot(v.x, v.z);
    if (speed <= PHYSICS_CONFIG.MAX_VELOCITY) return;
    const scale = PHYSICS_CONFIG.MAX_VELOCITY / speed;
    body.setLinvel({ x: v.x * scale, y: 0, z: v.z * scale }, true);
  }

  /**
   * Declare rest only after every body has held still for a confirmation
   * window, and give up after `MAX_SETTLE_SECONDS` so a pathological state
   * cannot hang the turn machine forever.
   */
  #updateRestDetection(delta: number): void {
    this.#settleElapsed += delta;

    let moving = false;
    for (const handle of this.#bodies.values()) {
      const v = handle.body.linvel();
      const w = handle.body.angvel();
      if (
        Math.hypot(v.x, v.z) > PHYSICS_CONFIG.VELOCITY_SLEEP_THRESHOLD ||
        Math.abs(w.y) > PHYSICS_CONFIG.ANGULAR_SLEEP_THRESHOLD
      ) {
        moving = true;
        break;
      }
    }

    this.#restTimer = moving ? 0 : this.#restTimer + delta;

    const confirmed = this.#restTimer >= PHYSICS_CONFIG.REST_CONFIRMATION_SECONDS;
    const timedOut = this.#settleElapsed >= PHYSICS_CONFIG.MAX_SETTLE_SECONDS;

    if (!confirmed && !timedOut) return;

    if (timedOut && !confirmed) {
      console.warn('[PhysicsWorld] settle timed out; forcing rest');
      for (const handle of this.#bodies.values()) {
        handle.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        handle.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }

    this.#watching = false;
    this.#atRest = true;
  }

  /** Line geometry for the collider debug overlay. */
  debugRender(): { vertices: Float32Array; colors: Float32Array } {
    return this.#world.debugRender();
  }

  dispose(): void {
    this.clearPieces();
    for (const rail of this.#rails) this.#world.removeRigidBody(rail);
    this.#rails.length = 0;
    this.#queue.free();
    this.#world.free();
  }
}
