/**
 * Camera framing.
 *
 * A slightly isometric perspective camera that must keep the entire board on
 * screen at every aspect ratio, from desktop widescreen down to mobile
 * portrait. The camera does not rotate during play; it only re-frames on
 * resize.
 */

import * as THREE from 'three';

import { BOARD_CONFIG } from '../board/BoardConfig';

export const CAMERA_SETTINGS = {
  /**
   * Long lens, deliberately.
   *
   * A narrow field of view compresses perspective, which is what gives an
   * isometric tabletop look while staying a true perspective camera. It also
   * removes the fisheye stretch a wide FOV produces at the board's corners, and
   * — more importantly for play — keeps far coins nearly the same on-screen
   * size as near ones, so the board reads at a consistent scale and aim is not
   * misleading. The cost is a camera that sits further back, which is free.
   */
  fov: 30,

  /**
   * Tilt is measured from straight down, matching how a tabletop camera is
   * normally described: 0° is directly overhead, 90° is at table level.
   *
   * 20° gives the shallow, near-overhead angle of a premium board game
   * presentation — enough that the rails and the coins' thickness read as
   * three-dimensional, without the foreshortening that a lower camera forces
   * onto a flat square playfield.
   */
  tiltDegrees: 20,

  /**
   * Portrait sits closer to overhead.
   *
   * A tilted camera foreshortens the board into a shallow trapezoid: wide, but
   * vertically compressed. On a tall phone that fits easily across and leaves
   * most of the height empty, so the board ends up small. Flattening the tilt
   * un-foreshortens it and lets the board fill the narrow axis — which is what
   * prioritising board size in portrait actually requires. It stops short of
   * dead overhead, because some tilt is what makes the rails look raised.
   */
  portraitTiltDegrees: 11,
  /** Aspect at or above which the full tabletop angle is used. */
  landscapeAspect: 1.3,
  /** Aspect at or below which the portrait angle is used. */
  portraitAspect: 0.72,
  /**
   * Transition rate, in units of e-foldings per second.
   *
   * Used as `1 - exp(-rate·dt)` rather than a fixed per-frame lerp, so the
   * transition takes the same wall-clock time at 30 FPS and at 144 — a constant
   * per-frame factor converges more than twice as fast on a high-refresh
   * display, and the camera would feel different on every device.
   */
  transitionRate: 7.5,
  /** Rotation around the board. 0 puts the camera on Player One's side (+Z). */
  azimuthDegrees: 0,
  /** Breathing room around the board edge, as a fraction of the fitted distance. */
  framingMargin: 1.08,
  /**
   * Extra headroom in portrait, where the HUD occupies real estate at the top
   * and bottom of the screen rather than beside the board.
   */
  portraitExtraMargin: 1.06,
  near: 0.1,
  far: 200,
} as const;

export class CameraManager {
  readonly #camera: THREE.PerspectiveCamera;
  readonly #target = new THREE.Vector3(0, 0, 0);

  /** Half-extents of the volume that must stay framed. */
  readonly #bounds: THREE.Vector3;

  /** Stored as elevation above the board: 90° − tilt. */
  #elevation = THREE.MathUtils.degToRad(90 - CAMERA_SETTINGS.tiltDegrees);
  #azimuth = THREE.MathUtils.degToRad(CAMERA_SETTINGS.azimuthDegrees);
  #margin: number = CAMERA_SETTINGS.framingMargin;
  #aspect = 1;
  /** Set only by the dev tuner; when present it overrides aspect-driven elevation. */
  #manualElevation: number | undefined;

  /** Where the framing solver wants the camera; `update` eases toward it. */
  readonly #targetPosition = new THREE.Vector3();
  /**
   * Cinematic displacement, applied on top of the solved framing.
   *
   * The cinematic layer supplies an offset rather than writing
   * `camera.position` itself. Two writers would fight on every resize and the
   * camera would snap mid-shot; this way the framing solver stays the single
   * owner of position, and shake or a shot-follow composes on top of it without
   * ever being able to break the "whole board visible" guarantee.
   */
  readonly #offset = new THREE.Vector3();
  /** Scratch for the eased target; avoids allocating every frame. */
  readonly #desired = new THREE.Vector3();
  /** First framing snaps; later ones ease. */
  #settled = false;

  // Scratch vectors, reused every frame-fit to keep the resize path allocation-free.
  readonly #dir = new THREE.Vector3();
  readonly #xAxis = new THREE.Vector3();
  readonly #yAxis = new THREE.Vector3();
  /** Scratch for the bounding-box corner being tested during framing. */
  readonly #corner = new THREE.Vector3();
  static readonly #UP = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.#camera = new THREE.PerspectiveCamera(
      CAMERA_SETTINGS.fov,
      1,
      CAMERA_SETTINGS.near,
      CAMERA_SETTINGS.far,
    );

    // The framed volume is the board's outer footprint including the rails.
    const half = BOARD_CONFIG.frame.outerSize / 2;
    this.#bounds = new THREE.Vector3(half, BOARD_CONFIG.frame.height, half);
  }

  get camera(): THREE.PerspectiveCamera {
    return this.#camera;
  }

  /** Re-frame for a new viewport. Called on every resize. */
  resize(cssWidth: number, cssHeight: number): void {
    this.#aspect = cssWidth / Math.max(1, cssHeight);
    this.#camera.aspect = this.#aspect;

    // Portrait needs the board pulled in slightly to clear the stacked HUD.
    this.#margin =
      this.#aspect < 1
        ? CAMERA_SETTINGS.framingMargin * CAMERA_SETTINGS.portraitExtraMargin
        : CAMERA_SETTINGS.framingMargin;

    // The dev tuner takes precedence, so live experimentation is not undone by
    // a resize.
    if (this.#manualElevation === undefined) {
      this.#elevation = THREE.MathUtils.degToRad(this.#autoElevation(this.#aspect));
    }

    this.#applyFraming();
  }

  /**
   * Ease the camera toward the framing target.
   *
   * Called once per rendered frame with the real frame delta.
   */
  update(deltaSeconds: number): void {
    if (!this.#settled) {
      this.#camera.position.copy(this.#targetPosition).add(this.#offset);
      this.#camera.lookAt(this.#target);
      this.#settled = true;
      return;
    }

    const alpha = 1 - Math.exp(-CAMERA_SETTINGS.transitionRate * deltaSeconds);
    this.#desired.copy(this.#targetPosition).add(this.#offset);
    this.#camera.position.lerp(this.#desired, alpha);
    this.#camera.lookAt(this.#target);
  }

  /** Cinematic displacement, in world units. Cleared by passing zero. */
  setOffset(x: number, y: number, z: number): void {
    this.#offset.set(x, y, z);
  }

  /**
   * Elevation for a given aspect ratio.
   *
   * Blends smoothly between the tabletop angle in landscape and the more
   * top-down portrait angle, so a device rotating through the middle does not
   * snap.
   */
  #autoElevation(aspect: number): number {
    const { landscapeAspect, portraitAspect, tiltDegrees, portraitTiltDegrees } =
      CAMERA_SETTINGS;
    const elevationDegrees = 90 - tiltDegrees;
    const portraitElevationDegrees = 90 - portraitTiltDegrees;
    const t = THREE.MathUtils.clamp(
      (aspect - portraitAspect) / (landscapeAspect - portraitAspect),
      0,
      1,
    );
    // Smoothstep rather than linear: keeps both ends stable and puts the
    // transition in the middle, where no real device sits for long.
    const eased = t * t * (3 - 2 * t);
    return THREE.MathUtils.lerp(portraitElevationDegrees, elevationDegrees, eased);
  }

  /** Adjust the viewing angle. Used by the dev camera tuner only. */
  setAngles(elevationDegrees: number, azimuthDegrees: number): void {
    this.#manualElevation = THREE.MathUtils.clamp(elevationDegrees, 15, 89);
    this.#elevation = THREE.MathUtils.degToRad(this.#manualElevation);
    this.#azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
    this.#applyFraming();
  }

  /** Drop the dev override and return to aspect-driven framing. */
  resetAngles(): void {
    this.#manualElevation = undefined;
    this.#azimuth = THREE.MathUtils.degToRad(CAMERA_SETTINGS.azimuthDegrees);
    this.#elevation = THREE.MathUtils.degToRad(this.#autoElevation(this.#aspect));
    this.#margin =
      this.#aspect < 1
        ? CAMERA_SETTINGS.framingMargin * CAMERA_SETTINGS.portraitExtraMargin
        : CAMERA_SETTINGS.framingMargin;
    this.#applyFraming();
  }

  setMargin(margin: number): void {
    this.#margin = Math.max(1, margin);
    this.#applyFraming();
  }

  get elevationDegrees(): number {
    return THREE.MathUtils.radToDeg(this.#elevation);
  }

  /** Tilt from straight down — how the spec describes the camera. */
  get tiltDegrees(): number {
    return 90 - this.elevationDegrees;
  }

  get azimuthDegrees(): number {
    return THREE.MathUtils.radToDeg(this.#azimuth);
  }

  get margin(): number {
    return this.#margin;
  }

  /**
   * Position the camera at the closest distance that still contains the whole
   * board.
   *
   * Rather than fitting the board's bounding *sphere* — the usual shortcut,
   * which wastes a lot of screen on a square board because the sphere
   * circumscribes the diagonal — this projects each of the eight bounding-box
   * corners into camera space and solves for the exact distance.
   *
   * With the camera at `target + dir·D`, a corner's view-space position is
   * `(qx, qy, qz − D)`, so its depth is `D − qz`. It sits inside the frustum when
   *
   *     |qx| ≤ (D − qz)·tanH   and   |qy| ≤ (D − qz)·tanV
   *
   * Solving each for D gives the minimum distance that corner requires; the
   * largest across all corners frames the whole board exactly. This is what
   * keeps the board correctly filled in portrait, where a sphere fit would
   * leave it small and marooned in the middle of the screen.
   */
  #applyFraming(): void {
    const cosEl = Math.cos(this.#elevation);
    this.#dir
      .set(
        Math.sin(this.#azimuth) * cosEl,
        Math.sin(this.#elevation),
        Math.cos(this.#azimuth) * cosEl,
      )
      .normalize();

    // Orthonormal view basis. `dir` is the camera's +Z (it points from the
    // target back toward the camera, and a Three.js camera looks down −Z).
    this.#xAxis.crossVectors(CameraManager.#UP, this.#dir).normalize();
    this.#yAxis.crossVectors(this.#dir, this.#xAxis).normalize();

    const tanV = Math.tan(THREE.MathUtils.degToRad(this.#camera.fov) / 2);
    const tanH = tanV * this.#aspect;

    let distance = 0;
    for (let i = 0; i < 8; i += 1) {
      // Walk the 8 corners via the bits of i.
      this.#corner.set(
        (i & 1 ? 1 : -1) * this.#bounds.x,
        i & 2 ? this.#bounds.y : 0,
        (i & 4 ? 1 : -1) * this.#bounds.z,
      );
      this.#corner.sub(this.#target);

      const qx = this.#corner.dot(this.#xAxis);
      const qy = this.#corner.dot(this.#yAxis);
      const qz = this.#corner.dot(this.#dir);

      distance = Math.max(
        distance,
        qz + Math.abs(qx) / tanH,
        qz + Math.abs(qy) / tanV,
      );
    }

    distance *= this.#margin;

    // Solve for a target rather than snapping. `update` eases toward it, so a
    // rotation or an orientation change is a move, not a jump cut.
    this.#targetPosition
      .copy(this.#dir)
      .multiplyScalar(distance)
      .add(this.#target);

    // Tighten the depth range around the board so the depth buffer keeps its
    // precision — important once coins cast shadows onto the surface. Padded
    // generously because the camera may be mid-transition, and therefore not
    // yet at `distance`.
    const span = this.#bounds.length() * 3;
    this.#camera.near = Math.max(0.1, distance - span);
    this.#camera.far = distance + span;
    this.#camera.updateProjectionMatrix();
  }
}
