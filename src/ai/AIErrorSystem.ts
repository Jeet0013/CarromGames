/**
 * Difficulty-driven execution error.
 *
 * This is the mechanism that makes a weak AI weak, and it matters that it works
 * the way it does: the error is applied to the **aim vector and the force**,
 * before the shot is handed to physics. The AI then genuinely misses, for the
 * same reason a person does — it aimed slightly wrong.
 *
 * Nothing here inspects or alters the outcome. There is no "decide to miss"
 * path anywhere in this codebase.
 */

import type { AIConfig } from './AIConfig';
import type { BoardPoint } from '../core/types';

export interface ShotError {
  readonly aimErrorRadians: number;
  readonly powerScale: number;
}

export class AIErrorSystem {
  /**
   * Normally-distributed sample via Box–Muller.
   *
   * Uniform error would make every difficulty feel equally random. A normal
   * distribution clusters near-misses around the intended line and makes wild
   * errors rare, which is how human aim actually fails.
   */
  static #gaussian(random: () => number): number {
    const u = Math.max(1e-9, random());
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * Error for one shot.
   *
   * Peak aim error is ~9° at zero accuracy, tapering to well under a degree at
   * expert level. Nine degrees is enough to miss a pocket from across the board
   * without looking like the AI shot at random.
   */
  static compute(config: AIConfig, random: () => number = Math.random): ShotError {
    const aimSigma = (1 - config.accuracy) * 0.16; // radians
    const powerSigma = (1 - config.powerAccuracy) * 0.22;

    let aimErrorRadians = this.#gaussian(random) * aimSigma;
    let powerScale = 1 + this.#gaussian(random) * powerSigma;

    // Occasional genuine blunder — a badly struck shot, not a rigged result.
    if (random() < config.mistakeProbability) {
      aimErrorRadians *= 2.6;
      powerScale *= 0.72 + random() * 0.5;
    }

    return {
      aimErrorRadians,
      // Never below a nudge, never above the clamp physics enforces anyway.
      powerScale: Math.min(1.35, Math.max(0.35, powerScale)),
    };
  }

  /** Rotate an aim direction on the board plane. */
  static applyAim(direction: BoardPoint, radians: number): BoardPoint {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: direction.x * cos - direction.z * sin,
      z: direction.x * sin + direction.z * cos,
    };
  }
}
