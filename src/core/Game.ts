/**
 * Root orchestrator.
 *
 * Owns every subsystem's lifetime and wires them together. It knows *what* the
 * systems are but not how they work, and it holds no game rules — those arrive
 * in `gameplay/` in a later phase.
 */

import { CarromBoard } from '../board/CarromBoard';
import { GAME_CONFIG, IS_DEV } from '../config/GameConfig';
import { CameraManager } from '../rendering/CameraManager';
import { DebugCameraTuner } from '../rendering/DebugCameraTuner';
import { Lighting } from '../rendering/Lighting';
import { Renderer } from '../rendering/Renderer';
import { SceneManager } from '../rendering/SceneManager';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import type { QualityTier } from './types';

export interface GameOptions {
  /** Element the canvas is mounted into. Sizing follows this element. */
  readonly container: HTMLElement;
  readonly quality?: QualityTier;
}

export class Game {
  readonly events = new EventBus();

  readonly #container: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #renderer: Renderer;
  readonly #scene: SceneManager;
  readonly #camera: CameraManager;
  readonly #lighting: Lighting;
  readonly #loop: GameLoop;
  readonly #board: CarromBoard;

  #resizeObserver: ResizeObserver | undefined;
  #cameraTuner: DebugCameraTuner | undefined;
  #disposed = false;

  constructor({ container, quality = GAME_CONFIG.defaultSettings.quality }: GameOptions) {
    this.#container = container;

    this.#canvas = document.createElement('canvas');
    this.#canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    container.append(this.#canvas);

    this.#renderer = new Renderer({ canvas: this.#canvas, quality });
    this.#scene = new SceneManager();
    this.#camera = new CameraManager();
    this.#lighting = new Lighting(quality);

    // Lights are permanent furniture — they must survive a board teardown
    // between matches.
    this.#scene.addPermanent(this.#lighting.group);

    // The board is content, not furniture: a level change tears it down and
    // rebuilds it, which is why it goes through `add` rather than `addPermanent`.
    this.#board = new CarromBoard(quality);
    this.#scene.add(this.#board.group);

    // Constructed inside the DEV guard so the class is tree-shaken out of
    // production builds entirely, not merely left inert.
    if (IS_DEV) this.#cameraTuner = new DebugCameraTuner(this.#camera);

    this.#loop = new GameLoop({
      fixedUpdate: (delta) => this.#fixedUpdate(delta),
      render: (alpha) => this.#render(alpha),
    });

    this.#observeSize();
    this.#handleVisibility();
    this.#resize();
  }

  get scene(): SceneManager {
    return this.#scene;
  }

  get camera(): CameraManager {
    return this.#camera;
  }

  get renderer(): Renderer {
    return this.#renderer;
  }

  get board(): CarromBoard {
    return this.#board;
  }

  get loop(): GameLoop {
    return this.#loop;
  }

  start(): void {
    if (this.#disposed) throw new Error('Game has been disposed');
    this.#loop.start();
    this.events.emit('game:ready');
  }

  pause(): void {
    if (!this.#loop.isRunning) return;
    this.#loop.stop();
    this.events.emit('game:paused');
  }

  resume(): void {
    if (this.#loop.isRunning || this.#disposed) return;
    // Drop the time accumulated while paused; otherwise the loop immediately
    // tries to simulate the whole pause.
    this.#loop.resetTiming();
    this.#loop.start();
    this.events.emit('game:resumed');
  }

  setQuality(quality: QualityTier): void {
    this.#renderer.setQuality(quality);
    this.#lighting.setQuality(quality);
  }

  /** Advance simulation. Physics and the turn machine hook in here later. */
  #fixedUpdate(_delta: number): void {
    // No simulation yet — the board is static until physics lands.
  }

  #render(_alpha: number): void {
    this.#renderer.render(this.#scene.scene, this.#camera.camera);
  }

  /**
   * Track the container's size.
   *
   * `ResizeObserver` rather than the `resize` event: it also fires for layout
   * changes that leave the window alone — a mobile browser's URL bar
   * collapsing, or the on-screen keyboard opening — which `resize` can miss.
   */
  #observeSize(): void {
    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    this.#resizeObserver.observe(this.#container);
  }

  #resize(): void {
    const width = this.#container.clientWidth;
    const height = this.#container.clientHeight;
    if (width === 0 || height === 0) return;

    this.#renderer.resize(width, height);
    this.#camera.resize(width, height);
  }

  /** Stop simulating while the tab is hidden — no point burning battery. */
  #handleVisibility(): void {
    document.addEventListener('visibilitychange', this.#onVisibilityChange);
  }

  readonly #onVisibilityChange = (): void => {
    if (this.#disposed) return;
    if (document.hidden) this.#loop.stop();
    else if (!this.#loop.isRunning) {
      this.#loop.resetTiming();
      this.#loop.start();
    }
  };

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;

    this.#loop.stop();
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;

    this.#cameraTuner?.dispose();
    this.#cameraTuner = undefined;

    this.#board.dispose();
    this.#lighting.dispose();
    this.#scene.dispose();
    this.#renderer.dispose();
    this.events.clear();
    this.#canvas.remove();
  }
}
