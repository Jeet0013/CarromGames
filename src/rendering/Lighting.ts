/**
 * Lighting rig.
 *
 * Three lights, arranged like a tabletop under a warm room lamp: a key light
 * that casts the board's shadow, a cool fill to keep the shadow side readable,
 * and a hemisphere wash for ambient bounce.
 */

import * as THREE from 'three';

import { BOARD_CONFIG } from '../board/BoardConfig';
import { QUALITY_PRESETS } from '../config/GameConfig';
import type { QualityTier } from '../core/types';

export const LIGHTING_SETTINGS = {
  /** Warm overhead lamp. */
  keyColor: 0xfff1dc,
  keyIntensity: 2.4,
  /** Cool fill from the opposite side, so shadowed wood does not read as black. */
  fillColor: 0xbcd4ff,
  fillIntensity: 0.55,
  /** Sky/ground wash standing in for room bounce. */
  skyColor: 0xdce6ff,
  groundColor: 0x3a2a1c,
  hemiIntensity: 0.7,
  ambientIntensity: 0.25,
} as const;

export class Lighting {
  readonly #group = new THREE.Group();
  readonly #key: THREE.DirectionalLight;
  readonly #fill: THREE.DirectionalLight;
  readonly #hemi: THREE.HemisphereLight;
  readonly #ambient: THREE.AmbientLight;

  constructor(quality: QualityTier) {
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
      LIGHTING_SETTINGS.hemiIntensity,
    );
    this.#hemi.position.set(0, boardHalf * 2, 0);

    this.#ambient = new THREE.AmbientLight(0xffffff, LIGHTING_SETTINGS.ambientIntensity);

    this.#group.add(this.#key, this.#key.target, this.#fill, this.#hemi, this.#ambient);
  }

  get group(): THREE.Group {
    return this.#group;
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

    // The shadow camera is fitted tightly to the board. An oversized frustum
    // is the usual cause of blocky shadows: texels get spread over empty space
    // instead of the surface where the coins actually sit.
    const extent = boardHalf * 1.35;
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
    shadow.radius = 3;
  }

  dispose(): void {
    this.#key.shadow.map?.dispose();
    this.#key.dispose();
    this.#fill.dispose();
    this.#hemi.dispose();
    this.#ambient.dispose();
  }
}
