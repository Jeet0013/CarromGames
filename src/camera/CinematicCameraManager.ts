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
  shotStartSeconds: 0.5,
  /** Ceiling on the follow, so the camera is never away from framing for long. */
  shotFollowSeconds: 1.5,
  /** How long a pocket holds the camera. */
  pocketFollowSeconds: 0.75,
  returnSeconds: 1.1,

  /**
   * How much closer the camera gets during a shot, as a magnification factor.
   *
   * A factor rather than a distance: 4× means the same thing on a phone and a
   * widescreen monitor, while a fixed 2.3 units was a barely-visible nudge from
   * 18 units out.
   *
   * 2.4× is the tuned value. 4× was tried and measured worse on both counts
   * that matter: the striker fell out of frame on 7–9 of 61 sampled frames,
   * and per-frame camera movement rose to 0.89 units against 0.17 at rest —
   * the camera has to cross ~13 units inside a 1.5 s shot, and that is a lurch
   * however it is eased. At 2.4× the strike still reads as an event, the
   * striker stays framed throughout, and the motion stays smooth.
   */
  zoomFactor: 2.4,
  /**
   * Ceiling on how far the look-at point may leave the board centre.
   *
   * Generous, because at 4× the visible area is small and a tight clamp would
   * strand the striker off-screen while the camera stared at the middle of an
   * empty board.
   */
  maxTargetBias: BOARD_CONFIG.halfSurface * 1.05,
  /**
   * Fraction of the striker's offset the camera tracks. Full, so the striker
   * stays centred at close range.
   */
  followStrength: 1,
  /**
   * Seconds of velocity to lead by. Larger at this zoom: a striker crossing the
   * frame in a fraction of a second must be anticipated, not chased.
   */
  leadSeconds: 0.13,

  /**
   * Easing rates, in e-foldings per second.
   *
   * Zoom and aim are eased at deliberately different speeds, and that split is
   * what makes a 4× push usable at all.
   *
   * The *zoom* must be slow, because it now travels ~12 units instead of ~2,
   * and the same rate over a longer distance is simply faster motion — the
   * first attempt at 4× tripled the per-frame movement and read as a lurch.
   *
   * The *aim* must be quick, because at 4× the visible area is roughly a
   * quarter of the board and a look-at that lags a moving striker lets it slide
   * straight out of frame. Testing showed the striker leaving the view on 8 of
   * 61 samples with a single shared rate.
   */
  pushRate: 1.9,
  followRate: 1.6,
  /** Look-at tracking. Much faster than the zoom, so the striker stays centred. */
  biasRate: 7.5,
  returnRate: 1.25,
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
        targetPush = this.#pushForZoom(1);
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
        targetPush = this.#pushForZoom(1);
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
        // Pull back a little for the pocket, so the hole and its surroundings
        // are both visible rather than a close-up of dark wood.
        targetPush = this.#pushForZoom(0.62);
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
    // refresh rate. Zoom and aim use separate rates; see CINEMATIC_SETTINGS.
    const pushAlpha = 1 - Math.exp(-rate * delta);
    this.#push += (targetPush - this.#push) * pushAlpha;

    const returning = this.#state === CinematicState.ReturnToGameplay;
    const biasRate = returning ? CINEMATIC_SETTINGS.returnRate : CINEMATIC_SETTINGS.biasRate;
    const biasAlpha = 1 - Math.exp(-biasRate * delta);
    this.#biasX += (targetBias.x - this.#biasX) * biasAlpha;
    this.#biasZ += (targetBias.z - this.#biasZ) * biasAlpha;

    this.#apply();
  }

  /**
   * Distance to travel toward the board for a given share of the full zoom.
   *
   * Derived from the live framed distance, so the same factor holds when the
   * device rotates or the window resizes mid-shot.
   */
  #pushForZoom(share: number): number {
    const framed = this.#camera.framedDistance;
    const full = framed * (1 - 1 / CINEMATIC_SETTINGS.zoomFactor);
    return full * share;
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
