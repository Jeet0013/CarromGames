/**
 * WebGL renderer ownership.
 *
 * Wraps `THREE.WebGLRenderer` so that quality decisions live in exactly one
 * place. Nothing else in the codebase branches on the quality tier — systems
 * ask the renderer, or read `QUALITY_PRESETS`.
 */

import * as THREE from 'three';

import { QUALITY_PRESETS, type QualityPreset } from '../config/GameConfig';
import { QualityTier } from '../core/types';

export interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly quality: QualityTier;
}

export class Renderer {
  readonly #renderer: THREE.WebGLRenderer;
  #preset: QualityPreset;
  #quality: QualityTier;

  constructor({ canvas, quality }: RendererOptions) {
    this.#quality = quality;
    this.#preset = QUALITY_PRESETS[quality];

    this.#renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.#preset.antialias,
      // The board fills the frame; there is nothing to see through it, and an
      // opaque buffer is measurably cheaper on mobile tile-based GPUs.
      alpha: false,
      powerPreference: 'high-performance',
      // Rendering happens every frame, so preserving the buffer only costs
      // memory bandwidth.
      preserveDrawingBuffer: false,
    });

    // Physically-correct pipeline: linear lighting maths, filmic roll-off, and
    // an sRGB output transform. Without this the varnished wood and the brass
    // striker blow out to flat white under a strong key light.
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.05;

    this.#applyQuality();
  }

  /** The underlying renderer, for systems that need direct access. */
  get three(): THREE.WebGLRenderer {
    return this.#renderer;
  }

  get quality(): QualityTier {
    return this.#quality;
  }

  get preset(): QualityPreset {
    return this.#preset;
  }

  /** Switch tier at runtime, from the settings screen. */
  setQuality(quality: QualityTier): void {
    if (quality === this.#quality) return;
    this.#quality = quality;
    this.#preset = QUALITY_PRESETS[quality];
    this.#applyQuality();
    this.#resizeToCurrent();
  }

  #applyQuality(): void {
    const { shadowsEnabled, shadowMapSize } = this.#preset;
    this.#renderer.shadowMap.enabled = shadowsEnabled;
    if (shadowsEnabled) {
      // Plain PCF, softened per-light via `shadow.radius` / `blurSamples`.
      // `PCFSoftShadowMap` is deprecated as of r185 — it silently falls back to
      // PCFShadowMap and logs a warning on every load, so asking for it gave
      // the warning *and* the harder shadow. Setting it explicitly and doing
      // the softening on the light is what actually produces the soft contact
      // shadow under each coin.
      this.#renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    // Lights read this when sizing their shadow maps.
    void shadowMapSize;
    this.#renderer.shadowMap.needsUpdate = true;
  }

  /**
   * Resize the drawing buffer to a CSS pixel size.
   *
   * `devicePixelRatio` is clamped per tier because it is the single largest
   * fragment cost on mobile: a phone reporting DPR 3 would otherwise render
   * nine times the pixels of the CSS layout.
   */
  resize(cssWidth: number, cssHeight: number): void {
    const ratio = Math.min(window.devicePixelRatio || 1, this.#preset.maxPixelRatio);
    this.#renderer.setPixelRatio(ratio);
    // `false` — never let Three.js write inline styles onto the canvas; CSS
    // owns layout, and letting both write it causes a resize feedback loop.
    this.#renderer.setSize(cssWidth, cssHeight, false);
  }

  #resizeToCurrent(): void {
    const size = new THREE.Vector2();
    this.#renderer.getSize(size);
    this.resize(size.x, size.y);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.#renderer.render(scene, camera);
  }

  /** Release GPU resources. Called on teardown. */
  dispose(): void {
    this.#renderer.dispose();
  }
}
