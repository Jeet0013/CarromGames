/**
 * Cinematic shot camera.
 *
 * Normal play uses a stable, fully-framed board. The moment a shot is released
 * the camera pushes in toward the striker, follows it, reacts to the impact,
 * and eases back — giving the shot a sense of depth without ever taking control
 * away from the player.
 *
 * ## Three rules this is built around
 *
 * 1. **It never writes `camera.position`.** `CameraManager` remains the sole
 *    owner of position, because it is the only thing that knows the framing
 *    solution for the current aspect ratio. This supplies an *offset* on top.
 *    Two writers would fight on every resize and snap the camera mid-shot — and
 *    an offset can never break the whole-board-visible guarantee, because the
 *    solved framing underneath is still correct.
 *
 * 2. **Easing is frame-rate independent.** `1 − exp(−rate·dt)` against the real
 *    frame delta. A constant per-frame lerp converges more than twice as fast at
 *    144 FPS as at 60, so the same shot would feel different on every device.
 *
 * 3. **Intent is captured on events, consumed at render.** Collisions arrive
 *    inside a fixed step; the camera updates per frame with several steps
 *    possibly between. Reading physics directly from the camera would sample a
 *    different sub-step each frame and jitter, so events only *record* what to
 *    look at and the camera reads that.
 */

import type { EventBus } from '../core/EventBus';
import type { CameraManager } from '../rendering/CameraManager';
import type { PieceFactory } from '../pieces/PieceFactory';
import { CameraShake } from './CameraEffects';
import { BOARD_CONFIG, POCKET_POSITIONS } from '../board/BoardConfig';
import { PHYSICS_CONFIG } from '../physics/PhysicsConfig';
import type { BoardPoint, PlayerSlot } from '../core/types';

export const CinematicState = {
  Gameplay: 'GAMEPLAY',
  ShotStart: 'SHOT_START',
  ShotFollow: 'SHOT_FOLLOW',
  Impact: 'IMPACT',
  PocketFollow: 'POCKET_FOLLOW',
  ReturnToGameplay: 'RETURN_TO_GAMEPLAY',
} as const;
export type CinematicState = (typeof CinematicState)[keyof typeof CinematicState];

export const CINEMATIC_SETTINGS = {
  /** Push-in duration when the shot is released. */
  shotStartSeconds: 0.42,
  /** Ceiling on the follow, so the camera is never away from framing for long. */
  shotFollowSeconds: 1.15,
  /** How long a pocket holds the camera. */
  pocketFollowSeconds: 0.75,
  returnSeconds: 1.1,

  /**
   * How far the camera moves toward the board, in world units.
   *
   * Deliberately modest. The board must stay readable — this is a sense of
   * depth, not a zoom that hides the coins the player is about to be judged on.
   */
  pushDistance: 2.3,
  /**
   * Ceiling on how far the look-at point may leave the board centre. Beyond
   * this the far rail starts leaving frame.
   */
  maxTargetBias: BOARD_CONFIG.halfSurface * 0.42,
  /** Fraction of the striker's offset from centre that the camera tracks. */
  followStrength: 0.55,
  /** Seconds of velocity to lead by, so a fast striker is not chased. */
  leadSeconds: 0.09,

  /**
   * Easing rates, in e-foldings per second.
   *
   * These are the whole feel of the shot camera. A rate of `r` covers ~63% of
   * the remaining distance each second, so 6.5 lands almost instantly and reads
   * as a snap rather than a move — which is what the first pass did. Halving
   * them stretches each transition over roughly half a second of visible
   * travel, which is what makes it feel like a camera rather than a cut.
   *
   * The return is slowest deliberately: pushing in is a reaction to something
   * happening, but pulling back is the game settling down, and hurrying it
   * makes the board appear to snap away from the player.
   */
  pushRate: 3.0,
  followRate: 2.6,
  returnRate: 1.7,
} as const;

export class CinematicCameraManager {
  readonly #camera: CameraManager;
  readonly #pieces: PieceFactory;
  readonly #shake = new CameraShake();

  #state: CinematicState = CinematicState.Gameplay;
  #timer = 0;
  #enabled = true;

  /** Current eased values. */
  #push = 0;
  #biasX = 0;
  #biasZ = 0;

  /** Recorded by events, read at render — never the other way round. */
  #pocketFocus: BoardPoint | null = null;
  #settled = true;

  /**
   * Whether the shot in progress belongs to a human.
   *
   * The camera only performs for the player's own shots. During the computer's
   * turn the board stays fully framed and still: the player is *watching* then,
   * not acting, and a camera that dives at someone else's striker takes away
   * the wide view they need to follow what happened to them.
   */
  #activeShotIsHuman = true;
  /** Supplied by Game; defaults to treating every seat as human. */
  #isHumanSeat: (slot: PlayerSlot) => boolean = () => true;

  constructor(events: EventBus, camera: CameraManager, pieces: PieceFactory) {
    this.#camera = camera;
    this.#pieces = pieces;

    // Players who ask the OS for less motion get a stable camera.
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.#enabled = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    events.on('shot:fired', ({ by }) => this.#onShotFired(by));
    events.on('shot:settled', () => this.#onSettled());
    events.on('physics:contact', ({ impact }) => this.#onContact(impact));
    events.on('pocket:scored', ({ pocketIndex }) => this.#onPocket(pocketIndex));
  }

  get state(): CinematicState {
    return this.#state;
  }

  /** Tell the camera which seats are human-controlled. */
  setHumanSeatTest(predicate: (slot: PlayerSlot) => boolean): void {
    this.#isHumanSeat = predicate;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    this.#shake.setEnabled(enabled);
    if (!enabled) this.#reset();
  }

  #onShotFired(by: PlayerSlot): void {
    if (!this.#enabled) return;

    this.#activeShotIsHuman = this.#isHumanSeat(by);
    if (!this.#activeShotIsHuman) {
      // Hold the wide, stable framing for the computer's shot.
      this.#settled = false;
      this.#state = CinematicState.Gameplay;
      return;
    }

    this.#settled = false;
    this.#state = CinematicState.ShotStart;
    this.#timer = CINEMATIC_SETTINGS.shotStartSeconds;
    this.#pocketFocus = null;
  }

  /**
   * Shake and a brief hold on impact.
   *
   * Strength is normalised against the speed ceiling, so a glancing touch is
   * almost imperceptible and a hard strike is unmistakable — the squared trauma
   * curve in `CameraShake` does the rest.
   */
  #onContact(impact: number): void {
    if (!this.#enabled || !this.#activeShotIsHuman) return;
    const strength = Math.min(1, impact / (PHYSICS_CONFIG.MAX_VELOCITY * 0.55));
    if (strength < 0.12) return;
    this.#shake.add(strength * 0.45);

    if (this.#state === CinematicState.ShotFollow) {
      this.#state = CinematicState.Impact;
      this.#timer = 0.3;
    }
  }

  /** A pocket is the most interesting thing on the board — look at it. */
  #onPocket(pocketIndex: number): void {
    if (!this.#enabled || !this.#activeShotIsHuman) return;
    const pocket = POCKET_POSITIONS[pocketIndex];
    if (!pocket) return;
    this.#pocketFocus = pocket;
    this.#state = CinematicState.PocketFollow;
    this.#timer = CINEMATIC_SETTINGS.pocketFollowSeconds;
  }

  #onSettled(): void {
    this.#settled = true;
    if (this.#state === CinematicState.Gameplay) return;
    this.#state = CinematicState.ReturnToGameplay;
    this.#timer = CINEMATIC_SETTINGS.returnSeconds;
  }

  /** Called once per rendered frame with the real frame delta. */
  update(delta: number): void {
    this.#shake.update(delta);

    let targetPush = 0;
    let targetBias: BoardPoint = { x: 0, z: 0 };
    let rate: number = CINEMATIC_SETTINGS.returnRate;

    switch (this.#state) {
      case CinematicState.ShotStart:
        this.#timer -= delta;
        targetPush = CINEMATIC_SETTINGS.pushDistance;
        targetBias = this.#strikerBias(false);
        rate = CINEMATIC_SETTINGS.pushRate;
        if (this.#timer <= 0) {
          this.#state = CinematicState.ShotFollow;
          this.#timer = CINEMATIC_SETTINGS.shotFollowSeconds;
        }
        break;

      case CinematicState.ShotFollow:
      case CinematicState.Impact:
        this.#timer -= delta;
        targetPush = CINEMATIC_SETTINGS.pushDistance;
        targetBias = this.#strikerBias(true);
        rate = CINEMATIC_SETTINGS.followRate;
        // The follow is time-boxed so the camera returns to full framing well
        // before the board finishes settling — the player needs to see the
        // whole table to plan, not a close-up of a rolling coin.
        if (this.#timer <= 0) {
          this.#state = CinematicState.ReturnToGameplay;
          this.#timer = CINEMATIC_SETTINGS.returnSeconds;
        }
        break;

      case CinematicState.PocketFollow: {
        this.#timer -= delta;
        const pocket = this.#pocketFocus;
        targetPush = CINEMATIC_SETTINGS.pushDistance * 0.75;
        targetBias = pocket ? this.#clampBias(pocket.x, pocket.z) : { x: 0, z: 0 };
        rate = CINEMATIC_SETTINGS.followRate;
        if (this.#timer <= 0) {
          this.#state = CinematicState.ReturnToGameplay;
          this.#timer = CINEMATIC_SETTINGS.returnSeconds;
        }
        break;
      }

      case CinematicState.ReturnToGameplay:
        this.#timer -= delta;
        rate = CINEMATIC_SETTINGS.returnRate;
        if (this.#timer <= 0 && this.#settled) this.#state = CinematicState.Gameplay;
        break;

      default:
        break;
    }

    // Exponential damping against the real delta — same wall-clock feel at any
    // refresh rate.
    const alpha = 1 - Math.exp(-rate * delta);
    this.#push += (targetPush - this.#push) * alpha;
    this.#biasX += (targetBias.x - this.#biasX) * alpha;
    this.#biasZ += (targetBias.z - this.#biasZ) * alpha;

    this.#apply();
  }

  /**
   * Where to look while following the striker.
   *
   * With lead, the look-at point is projected ahead along the striker's
   * velocity. A camera that chases the current position always trails a fast
   * striker and then snaps when it slows; leading keeps it centred.
   */
  #strikerBias(withLead: boolean): BoardPoint {
    const striker = this.#pieces.striker;
    if (!striker.active) return { x: this.#biasX, z: this.#biasZ };

    const position = striker.position;
    let x = position.x;
    let z = position.z;

    if (withLead) {
      const handle = striker.handle;
      const v = handle.body.linvel();
      x += v.x * CINEMATIC_SETTINGS.leadSeconds;
      z += v.z * CINEMATIC_SETTINGS.leadSeconds;
    }

    return this.#clampBias(x, z);
  }

  /** Scale toward the point and clamp, so the board never leaves frame. */
  #clampBias(x: number, z: number): BoardPoint {
    const strength = CINEMATIC_SETTINGS.followStrength;
    let bx = x * strength;
    let bz = z * strength;

    const length = Math.hypot(bx, bz);
    const max = CINEMATIC_SETTINGS.maxTargetBias;
    if (length > max) {
      bx = (bx / length) * max;
      bz = (bz / length) * max;
    }
    return { x: bx, z: bz };
  }

  /** Hand the composed offsets to the camera, which owns position. */
  #apply(): void {
    // Push along the view direction: `viewDirection` points from the board out
    // to the camera, so moving *toward* the board is its negation.
    const view = this.#camera.viewDirection;
    this.#camera.setOffset(
      -view.x * this.#push + this.#shake.offsetX,
      -view.y * this.#push + this.#shake.offsetY,
      -view.z * this.#push,
    );
    this.#camera.setTargetOffset(this.#biasX, this.#biasZ);
  }

  #reset(): void {
    this.#state = CinematicState.Gameplay;
    this.#push = 0;
    this.#biasX = 0;
    this.#biasZ = 0;
    this.#shake.reset();
    this.#camera.setOffset(0, 0, 0);
    this.#camera.setTargetOffset(0, 0);
  }
}
