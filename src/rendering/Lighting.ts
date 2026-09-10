/**
 * Lighting rig.
 *
 * A key light that casts the board's shadow, a cool fill so the shadow side
 * stays readable, and a much-reduced hemisphere wash.
 *
 * ## Why the fills are weaker than they look
 *
 * `scene.environment` (see `Environment.ts`) now supplies irradiance from
 * every direction. A hemisphere light and an ambient light supply the same
 * thing, less accurately. Left at their old strengths the three would stack,
 * and the result of over-filling is not a brighter board but a flatter one:
 * every surface tends towards the same value, contact shadows wash out, and
 * the frame's rounded shoulder stops reading as round.
 *
 * So the ambient is nearly gone and the hemisphere is a third of what it was.
 * The room does that work now, and does it with direction.
 */

import * as THREE from 'three';

import { BOARD_CONFIG } from '../board/BoardConfig';
import { QUALITY_PRESETS } from '../config/GameConfig';
import type { QualityTier } from '../core/types';

export const LIGHTING_SETTINGS = {
  /**
   * Warm overhead lamp.
   *
   * 1.45, not the 2.4 it was. That figure was chosen when the key was doing
   * nearly all the work; with the room supplying irradiance from every
   * direction the two stacked and blew the playing bed — a light cream albedo
   * — to flat white, taking the red coins to salmon with it. The key's job now
   * is shaping and the cast shadow, not exposure.
   */
  keyColor: 0xfff1dc,
  keyIntensity: 1.45,
  /** Cool fill from the opposite side, so shadowed wood does not read as black. */
  fillColor: 0xbcd4ff,
  fillIntensity: 0.32,
  /**
   * Sky/ground wash.
   *
   * Kept only for the low tier, which has no environment map, and as a gentle
   * cool tint from above on the others. `Environment` is the real ambient.
   */
  skyColor: 0xdce6ff,
  groundColor: 0x3a2a1c,
  hemiIntensity: 0.16,
  /** Enough to keep a fully occluded crevice off pure black, and no more. */
  ambientIntensity: 0.05,
  /** Restored on the low tier, where there is no environment to stand in. */
  hemiIntensityNoEnvironment: 0.7,
  ambientIntensityNoEnvironment: 0.25,
} as const;

export class Lighting {
  readonly #group = new THREE.Group();
  readonly #key: THREE.DirectionalLight;
  readonly #fill: THREE.DirectionalLight;
  readonly #hemi: THREE.HemisphereLight;
  readonly #ambient: THREE.AmbientLight;

  /**
   * @param hasEnvironment Whether `scene.environment` is supplying irradiance.
   *   When it is not — the low tier — the hemisphere and ambient lights go
   *   back to their old strengths, because they are then the only fill there
   *   is and a board lit by one directional light is a board in a cave.
   */
  constructor(quality: QualityTier, hasEnvironment = true) {
    this.#group.name = 'Lighting';

    const boardHalf = BOARD_CONFIG.frame.outerSize / 2;

    // Key: high and off to one side. Offset rather than directly overhead so
    // coins cast a visible shadow that reads as contact with the surface.
    this.#key = new THREE.DirectionalLight(
      LIGHTING_SETTINGS.keyColor,
      LIGHTING_SETTINGS.keyIntensity,
    );
    this.#key.position.set(boardHalf * 0.8, boardHalf * 2.2, boardHalf * 1.0);
    this.#key.target.position.set(0, 0, 0);
    this.#configureKeyShadow(quality, boardHalf);

    this.#fill = new THREE.DirectionalLight(
      LIGHTING_SETTINGS.fillColor,
      LIGHTING_SETTINGS.fillIntensity,
    );
    this.#fill.position.set(-boardHalf * 1.2, boardHalf * 1.1, -boardHalf * 0.9);
    // Only the key casts shadows — a second shadow-casting light would double
    // the shadow-map cost for a barely visible second contact shadow.
    this.#fill.castShadow = false;

    this.#hemi = new THREE.HemisphereLight(
      LIGHTING_SETTINGS.skyColor,
      LIGHTING_SETTINGS.groundColor,
      hasEnvironment
        ? LIGHTING_SETTINGS.hemiIntensity
        : LIGHTING_SETTINGS.hemiIntensityNoEnvironment,
    );
    this.#hemi.position.set(0, boardHalf * 2, 0);

    this.#ambient = new THREE.AmbientLight(
      0xffffff,
      hasEnvironment
        ? LIGHTING_SETTINGS.ambientIntensity
        : LIGHTING_SETTINGS.ambientIntensityNoEnvironment,
    );

    this.#group.add(this.#key, this.#key.target, this.#fill, this.#hemi, this.#ambient);
  }

  get group(): THREE.Group {
    return this.#group;
  }

  /**
   * Turn the whole rig to follow the camera.
   *
   * The lights were fixed in world space, which is correct for a fixed camera
   * and wrong for one that orbits. Four-player rotates the view to face each
   * seat in turn, and from the seat opposite the key the board reflected the
   * light straight back down the lens: the bed washed out and the coins
   * stopped reading against it. One player in four was effectively playing on
   * a mirror.
   *
   * Rotating the group keeps the key at a constant angle *relative to the
   * view*, so every seat sees the same board. It is not what a lamp in a real
   * room does, but a real room does not spin the players around the table
   * either — and a game where the board is harder to read on some turns than
   * others is unfair in a way nobody would accept as realism.
   *
   * The hemisphere and ambient lights are rotation-invariant; only the key and
   * the fill actually move.
   */
  setAzimuthDegrees(degrees: number): void {
    this.#group.rotation.y = THREE.MathUtils.degToRad(degrees);
  }

  /** Re-apply shadow settings after a quality change. */
  setQuality(quality: QualityTier): void {
    this.#configureKeyShadow(quality, BOARD_CONFIG.frame.outerSize / 2);
  }

  #configureKeyShadow(quality: QualityTier, boardHalf: number): void {
    const preset = QUALITY_PRESETS[quality];
    this.#key.castShadow = preset.shadowsEnabled;
    if (!preset.shadowsEnabled) return;

    const shadow = this.#key.shadow;
    shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);

    // The shadow camera is fitted to the board plus the length of shadow it
    // throws onto the table beside it. Tight is right — an oversized frustum
    // spreads texels over empty space instead of the surface where the coins
    // sit — but it was previously fitted to the board alone, from a key light
    // offset on two axes, so the board's own shadow ran off the edge of the
    // map and stopped mid-table. There was no table to notice it on before.
    const extent = boardHalf * 1.9;
    const cam = shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = boardHalf * 0.5;
    cam.far = boardHalf * 5;
    cam.updateProjectionMatrix();

    // Normal bias suits the flat surface far better than a constant bias,
    // which would either leave acne on the board or detach coin shadows.
    shadow.bias = -0.0002;
    shadow.normalBias = 0.02;
    // Softening happens here rather than via a renderer-wide soft shadow mode.
    // A coin is 3 cm across and sits flat on the board, so its contact shadow
    // wants to be tight and soft-edged, not blurred into a smudge.
    shadow.radius = 2.5;
    shadow.blurSamples = 12;
  }

  dispose(): void {
    this.#key.shadow.map?.dispose();
    this.#key.dispose();
    this.#fill.dispose();
    this.#hemi.dispose();
    this.#ambient.dispose();
  }
}
