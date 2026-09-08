/**
 * Striker positioning and shooting.
 *
 * One PointerEvent pipeline serves mouse, touch, and pen; per-device tolerance
 * comes from a `ControlProfile`. Two unambiguous gestures:
 *
 * - **Press on the striker** → slide it along the baseline. Positioning only;
 *   releasing never fires.
 * - **Press anywhere else** → aim. The drag is a *pull back*: the shot travels
 *   from the striker away from the pointer, matching the physical act of
 *   drawing a finger back and flicking. Power comes from the pull length.
 *
 * Splitting the gestures by *where the press lands* rather than by how it moves
 * is what makes them impossible to confuse — a drag cannot be reinterpreted
 * halfway through.
 */

import * as THREE from 'three';

import { BOARD_CONFIG } from '../board/BoardConfig';
import { clampToBaseline, isForwardShot, strikerHome } from '../core/PlayerSide';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { PieceFactory } from '../pieces/PieceFactory';
import type { TurnManager } from '../gameplay/TurnManager';
import { AimSystem } from './AimSystem';
import { detectProfile, type ControlProfile } from './ControlProfile';
import { DesktopControls } from './DesktopControls';
import { MobileControls } from './MobileControls';
import { PHYSICS_CONFIG, PIECE_GEOMETRY, dragToPower } from '../physics/PhysicsConfig';
import type { BoardPoint, ShotCommand } from '../core/types';

type Gesture = 'none' | 'positioning' | 'aiming';

export class InputManager {
  readonly #canvas: HTMLCanvasElement;
  readonly #camera: THREE.Camera;
  readonly #physics: PhysicsWorld;
  readonly #pieces: PieceFactory;
  readonly #turns: TurnManager;
  readonly #aim: AimSystem;
  readonly #profile: ControlProfile;

  /** Set by Game; true while an AI controller owns the turn. */
  #isLocked: (() => boolean) | undefined;

  #gesture: Gesture = 'none';
  #pointerId: number | null = null;
  /** Where the press landed, to measure how far the pointer actually travelled. */
  #pressedAt: BoardPoint = { x: 0, z: 0 };

  // Reused per event — pointer moves fire dozens of times a second and should
  // not allocate.
  readonly #raycaster = new THREE.Raycaster();
  readonly #ndc = new THREE.Vector2();
  readonly #hit = new THREE.Vector3();
  /** The plane the striker slides on. */
  readonly #plane: THREE.Plane;

  constructor(options: {
    canvas: HTMLCanvasElement;
    camera: THREE.Camera;
    physics: PhysicsWorld;
    pieces: PieceFactory;
    turns: TurnManager;
    uiContainer: HTMLElement;
  }) {
    this.#canvas = options.canvas;
    this.#camera = options.camera;
    this.#physics = options.physics;
    this.#pieces = options.pieces;
    this.#turns = options.turns;

    this.#profile = detectProfile(DesktopControls, MobileControls);
    this.#aim = new AimSystem(options.uiContainer);

    this.#plane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      -PIECE_GEOMETRY.striker.thickness / 2,
    );

    this.#canvas.addEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.addEventListener('pointermove', this.#onPointerMove);
    this.#canvas.addEventListener('pointerup', this.#onPointerUp);
    this.#canvas.addEventListener('pointercancel', this.#onPointerCancel);
  }

  get aimSystem(): AimSystem {
    return this.#aim;
  }

  get profile(): ControlProfile {
    return this.#profile;
  }

  /** Supply a predicate that blocks input, e.g. during the computer's turn. */
  setLock(predicate: () => boolean): void {
    this.#isLocked = predicate;
  }

  /** Put the striker at the centre of the active seat's baseline. */
  resetStriker(): void {
    const home = strikerHome(this.#turns.currentSide);
    this.#physics.setPosition('striker', home.x, home.z);
  }

  /** Screen point → board point, or null if the ray misses the play plane. */
  #toBoard(event: PointerEvent): BoardPoint | null {
    const rect = this.#canvas.getBoundingClientRect();
    this.#ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#ndc, this.#camera);
    const hit = this.#raycaster.ray.intersectPlane(this.#plane, this.#hit);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    // The gate: nothing reaches the striker unless the turn machine says so,
    // and never while the computer owns the turn.
    if (!this.#turns.acceptsInput) return;
    if (this.#isLocked?.()) return;
    if (this.#pointerId !== null) return; // ignore a second finger

    const point = this.#toBoard(event);
    if (!point) return;

    this.#pointerId = event.pointerId;
    this.#pressedAt = point;
    this.#canvas.setPointerCapture(event.pointerId);

    const striker = this.#pieces.striker.position;
    const distance = Math.hypot(point.x - striker.x, point.z - striker.z);

    if (distance <= this.#profile.grabRadius) {
      this.#gesture = 'positioning';
      this.#moveStriker(point);
    } else {
      this.#gesture = 'aiming';
      this.#turns.beginAiming();
      this.#updateAim(point);
    }
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return;
    const point = this.#toBoard(event);
    if (!point) return;

    if (this.#gesture === 'positioning') this.#moveStriker(point);
    else if (this.#gesture === 'aiming') this.#updateAim(point);
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return;
    const point = this.#toBoard(event);

    if (this.#gesture === 'aiming' && point) this.#release(point);
    else if (this.#gesture === 'aiming') this.#turns.cancelAiming();

    this.#endGesture(event);
  };

  readonly #onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return;
    // A cancelled pointer — a system gesture, a call arriving — must never fire
    // a shot the player did not intend.
    if (this.#gesture === 'aiming') this.#turns.cancelAiming();
    this.#endGesture(event);
  };

  #endGesture(event: PointerEvent): void {
    this.#gesture = 'none';
    this.#pointerId = null;
    this.#aim.hide();
    if (this.#canvas.hasPointerCapture(event.pointerId)) {
      this.#canvas.releasePointerCapture(event.pointerId);
    }
  }

  /**
   * Slide the striker along the active seat's baseline.
   */
  #moveStriker(point: BoardPoint): void {
    // Whichever edge the active seat sits at, the free axis is clamped to the
    // baseline span and the fixed axis is pinned — so illegal placement is
    // unrepresentable rather than corrected afterwards.
    const at = clampToBaseline(
      this.#turns.currentSide,
      point,
      PIECE_GEOMETRY.striker.radius,
    );
    this.#physics.setPosition('striker', at.x, at.z);
  }

  /** Direction and power from the current pull. */
  #computeShot(pointer: BoardPoint): { direction: BoardPoint; power: number } {
    const striker = this.#pieces.striker.position;
    // Pull *back*: the shot travels opposite the drag.
    const dx = striker.x - pointer.x;
    const dz = striker.z - pointer.z;
    const length = Math.hypot(dx, dz);

    if (length < 1e-5) return { direction: { x: 0, z: -1 }, power: 0 };
    return {
      direction: { x: dx / length, z: dz / length },
      power: dragToPower(length),
    };
  }

  #updateAim(pointer: BoardPoint): void {
    const { direction, power } = this.#computeShot(pointer);
    this.#aim.show(this.#pieces.striker.position, direction, power, pointer);
  }

  /**
   * Fire, if the gesture was deliberate.
   *
   * Two independent guards, measuring different things:
   *
   * 1. **Travel** — how far the pointer actually moved between press and
   *    release. This is the accident guard, and it must be travel rather than
   *    distance-from-striker: an early version checked the latter, so a bare
   *    tap anywhere on the board fired a full-power shot, since the tap point
   *    was already far from the striker. A press with no drag is not a shot,
   *    wherever it lands.
   * 2. **Power** — `dragToPower` returns 0 below `MIN_DRAG_DISTANCE`, so a pull
   *    too short to mean anything cannot produce a nudge.
   *
   * Power is clamped to 0–1 before conversion, so `MAX_STRIKE_FORCE` is a real
   * ceiling that no drag length can exceed.
   */
  #release(pointer: BoardPoint): void {
    const striker = this.#pieces.striker.position;
    const travel = Math.hypot(pointer.x - this.#pressedAt.x, pointer.z - this.#pressedAt.z);

    if (travel < this.#profile.minDragToAim) {
      this.#turns.cancelAiming();
      return;
    }

    const { direction, power } = this.#computeShot(pointer);
    if (power <= 0) {
      this.#turns.cancelAiming();
      return;
    }

    // Reject a shot aimed backwards off the player's own edge. The drag reads
    // identically from every seat — pull toward yourself, fire toward the
    // centre — so this is the one thing that has to know where the seat sits.
    if (!isForwardShot(this.#turns.currentSide, direction)) {
      this.#turns.cancelAiming();
      return;
    }

    // Shared with the AI — see TurnManager.executeShot.
    const shot: ShotCommand = { origin: striker, direction, power };
    this.#turns.executeShot(shot);
  }

  /** Board bounds, exposed for tests and the debug overlay. */
  static get playArea(): number {
    return BOARD_CONFIG.halfSurface;
  }

  /** Maximum impulse the input layer can ever produce. */
  static get maxImpulse(): number {
    return PHYSICS_CONFIG.MAX_STRIKE_FORCE;
  }

  dispose(): void {
    this.#canvas.removeEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.removeEventListener('pointermove', this.#onPointerMove);
    this.#canvas.removeEventListener('pointerup', this.#onPointerUp);
    this.#canvas.removeEventListener('pointercancel', this.#onPointerCancel);
    this.#aim.dispose();
  }
}
