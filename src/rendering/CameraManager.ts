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
   * Narrow-ish field of view. A wide FOV would exaggerate perspective across
   * the board, making far coins look smaller than near ones and misleading the
   * player's aim — the one thing a Carrom camera must not do.
   */
  fov: 40,
  /** Degrees above the board plane. 90° is straight down; 55° reads as a real tabletop. */
  elevationDegrees: 55,
  /**
   * Elevation used on narrow (portrait) viewports.
   *
   * At 55° the board projects as a shallow trapezoid — wide but vertically
   * foreshortened. On a tall phone screen that fits easily across but leaves
   * two thirds of the height empty, and the board ends up tiny. Raising the
   * camera toward top-down un-foreshortens it so it fills the tall axis, which
   * is what "prioritize board size in portrait" actually requires. It is not
   * taken all the way to 90° because some tilt is what makes the rails read as
   * having height.
   */
  portraitElevationDegrees: 74,
  /** Aspect at or above which the full tabletop angle is used. */
  landscapeAspect: 1.3,
  /** Aspect at or below which the portrait angle is used. */
  portraitAspect: 0.72,
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

  #elevation = THREE.MathUtils.degToRad(CAMERA_SETTINGS.elevationDegrees);
  #azimuth = THREE.MathUtils.degToRad(CAMERA_SETTINGS.azimuthDegrees);
  #margin: number = CAMERA_SETTINGS.framingMargin;
  #aspect = 1;
  /** Set only by the dev tuner; when present it overrides aspect-driven elevation. */
  #manualElevation: number | undefined;

  // Scratch vectors, reused every frame-fit to keep the resize path allocation-free.
  readonly #dir = new THREE.Vector3();
  readonly #xAxis = new THREE.Vector3();
  readonly #yAxis = new THREE.Vector3();
  readonly #offset = new THREE.Vector3();
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
   * Elevation for a given aspect ratio.
   *
   * Blends smoothly between the tabletop angle in landscape and the more
   * top-down portrait angle, so a device rotating through the middle does not
   * snap.
   */
  #autoElevation(aspect: number): number {
    const { landscapeAspect, portraitAspect, elevationDegrees, portraitElevationDegrees } =
      CAMERA_SETTINGS;
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
      this.#offset.set(
        (i & 1 ? 1 : -1) * this.#bounds.x,
        i & 2 ? this.#bounds.y : 0,
        (i & 4 ? 1 : -1) * this.#bounds.z,
      );
      this.#offset.sub(this.#target);

      const qx = this.#offset.dot(this.#xAxis);
      const qy = this.#offset.dot(this.#yAxis);
      const qz = this.#offset.dot(this.#dir);

      distance = Math.max(
        distance,
        qz + Math.abs(qx) / tanH,
        qz + Math.abs(qy) / tanV,
      );
    }

    distance *= this.#margin;

    this.#camera.position
      .copy(this.#dir)
      .multiplyScalar(distance)
      .add(this.#target);
    this.#camera.lookAt(this.#target);

    // Tighten the depth range around the board so the depth buffer keeps its
    // precision — important once coins cast shadows onto the surface.
    this.#camera.near = Math.max(0.1, distance - this.#bounds.length() * 2);
    this.#camera.far = distance + this.#bounds.length() * 2;
    this.#camera.updateProjectionMatrix();
  }
}
