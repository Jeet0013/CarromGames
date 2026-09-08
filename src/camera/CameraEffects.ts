/**
 * Camera shake.
 *
 * Uses a *trauma* model rather than a decaying sine: events add trauma, trauma
 * decays linearly, and the shake applied each frame is `trauma²` times a noise
 * offset. Squaring matters — it makes a light knock almost invisible while a
 * hard strike is unmistakable, which is exactly the "impact strength should
 * affect effect intensity" the spec asks for, and it means repeated small
 * contacts during a scatter never accumulate into a rattle.
 *
 * Noise rather than a sine wave because a sine reads as a mechanical wobble;
 * sampled noise reads as a knock.
 */

const MAX_TRAUMA = 1;

export interface ShakeSettings {
  /** Peak positional displacement in world units, at full trauma. */
  readonly amplitude: number;
  /** Trauma lost per second. */
  readonly decay: number;
  /** How fast the noise is sampled. Higher is more frantic. */
  readonly frequency: number;
}

export const SHAKE_DEFAULTS: ShakeSettings = {
  amplitude: 0.2,
  // Slower decay and a lower sample rate: 22 Hz reads as a buzz, while a
  // gentler wobble over a longer tail reads as weight.
  decay: 1.9,
  frequency: 13,
};

export class CameraShake {
  #trauma = 0;
  #time = 0;
  #enabled = true;
  readonly #settings: ShakeSettings;

  /** Independent noise seeds per axis, so the shake is not diagonal. */
  readonly #seedX = Math.random() * 1000;
  readonly #seedY = Math.random() * 1000;

  #x = 0;
  #y = 0;

  constructor(settings: ShakeSettings = SHAKE_DEFAULTS) {
    this.#settings = settings;
    // Players who ask the OS for less motion get none of this.
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.#enabled = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }

  get offsetX(): number {
    return this.#x;
  }

  get offsetY(): number {
    return this.#y;
  }

  get isActive(): boolean {
    return this.#trauma > 0.001;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) this.reset();
  }

  /**
   * Add trauma from an impact.
   *
   * `strength` is normalised 0–1. Added rather than assigned so a genuine
   * multi-coin scatter builds slightly, but clamped so it can never run away.
   */
  add(strength: number): void {
    if (!this.#enabled) return;
    this.#trauma = Math.min(MAX_TRAUMA, this.#trauma + Math.max(0, strength));
  }

  update(deltaSeconds: number): void {
    if (this.#trauma <= 0) {
      this.#x = 0;
      this.#y = 0;
      return;
    }

    this.#time += deltaSeconds * this.#settings.frequency;
    this.#trauma = Math.max(0, this.#trauma - this.#settings.decay * deltaSeconds);

    // Squared: small knocks stay subtle, hard hits read clearly.
    const magnitude = this.#trauma * this.#trauma * this.#settings.amplitude;
    this.#x = magnitude * noise(this.#time + this.#seedX);
    this.#y = magnitude * noise(this.#time + this.#seedY);
  }

  reset(): void {
    this.#trauma = 0;
    this.#x = 0;
    this.#y = 0;
  }
}

/** Smooth value noise in −1…1, from a 1-D hash. */
function noise(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const smooth = f * f * (3 - 2 * f);
  return hash(i) * (1 - smooth) + hash(i + 1) * smooth;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
