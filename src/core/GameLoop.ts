/**
 * Fixed-timestep game loop.
 *
 * Simulation advances in whole 60 Hz steps regardless of display refresh, so a
 * shot resolves identically on a 30 Hz phone and a 144 Hz monitor. Rendering
 * runs once per animation frame and receives an interpolation factor, so
 * motion stays smooth even though physics is quantised.
 *
 * This separation is also what would let a future networked build replay a
 * shot deterministically — variable-step physics could not.
 */

import { GAME_CONFIG } from '../config/GameConfig';

/** Advance the simulation by exactly `fixedDelta` seconds. */
export type FixedUpdate = (fixedDelta: number) => void;

/**
 * Draw a frame. `alpha` is 0–1, the fraction of the way from the previous
 * fixed step to the next — use it to interpolate visual positions.
 */
export type RenderFrame = (alpha: number, frameDelta: number) => void;

export interface GameLoopOptions {
  readonly fixedUpdate: FixedUpdate;
  readonly render: RenderFrame;
}

export class GameLoop {
  readonly #fixedUpdate: FixedUpdate;
  readonly #render: RenderFrame;

  readonly #stepMs: number = GAME_CONFIG.simulation.fixedTimeStepMs;
  readonly #maxSteps: number = GAME_CONFIG.simulation.maxStepsPerFrame;

  #rafId = 0;
  #running = false;
  #lastTime = 0;
  #accumulator = 0;

  // Rolling FPS estimate for the debug overlay.
  #fps = 0;
  #frameCount = 0;
  #fpsWindowStart = 0;

  constructor({ fixedUpdate, render }: GameLoopOptions) {
    this.#fixedUpdate = fixedUpdate;
    this.#render = render;
  }

  get isRunning(): boolean {
    return this.#running;
  }

  get fps(): number {
    return this.#fps;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#lastTime = performance.now();
    this.#fpsWindowStart = this.#lastTime;
    this.#accumulator = 0;
    this.#frameCount = 0;
    this.#rafId = requestAnimationFrame(this.#tick);
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    cancelAnimationFrame(this.#rafId);
    this.#rafId = 0;
  }

  /**
   * Discard accumulated time without stopping.
   *
   * Call after a deliberate pause — returning from a background tab, or
   * closing the pause menu — so the loop does not try to simulate the gap.
   */
  resetTiming(): void {
    this.#lastTime = performance.now();
    this.#accumulator = 0;
  }

  readonly #tick = (now: number): void => {
    if (!this.#running) return;
    this.#rafId = requestAnimationFrame(this.#tick);

    const frameMs = now - this.#lastTime;
    this.#lastTime = now;

    // Cap the accumulator at the catch-up ceiling. Without this, returning
    // from a backgrounded tab hands the loop several seconds of owed time and
    // it spirals: each frame runs more steps than it can afford, falls further
    // behind, and the page locks up. Dropping the excess is the right trade —
    // time is lost, but the game stays responsive.
    const maxAccumulated = this.#stepMs * this.#maxSteps;
    this.#accumulator = Math.min(this.#accumulator + frameMs, maxAccumulated);

    const fixedDeltaSeconds = this.#stepMs / 1000;
    while (this.#accumulator >= this.#stepMs) {
      this.#accumulator -= this.#stepMs;
      this.#fixedUpdate(fixedDeltaSeconds);
    }

    this.#render(this.#accumulator / this.#stepMs, frameMs / 1000);
    this.#measureFps(now);
  };

  /** Recompute FPS once per second rather than smoothing every frame. */
  #measureFps(now: number): void {
    this.#frameCount += 1;
    const elapsed = now - this.#fpsWindowStart;
    if (elapsed < 1000) return;
    this.#fps = Math.round((this.#frameCount * 1000) / elapsed);
    this.#frameCount = 0;
    this.#fpsWindowStart = now;
  }
}
