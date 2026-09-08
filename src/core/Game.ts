/**
 * Root orchestrator.
 *
 * Owns every subsystem's lifetime and wires them together. It knows *what* the
 * systems are but not how they work, and it holds no game rules — those arrive
 * in `gameplay/` in a later phase.
 */

import { CarromBoard } from '../board/CarromBoard';
import { PhysicsDebugRenderer } from '../physics/PhysicsDebugRenderer';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PieceFactory } from '../pieces/PieceFactory';
import { InputManager } from '../input/InputManager';
import { TurnManager } from '../gameplay/TurnManager';
import { PocketManager } from '../gameplay/PocketManager';
import { Notifications } from '../ui/Notifications';
import { AudioManager } from '../audio/AudioManager';
import { SoundToggle } from '../ui/SoundToggle';
import { GameHUD, SEAT_ACCENTS, type SeatConfig } from '../ui/GameHUD';
import { MainMenu } from '../ui/MainMenu';
import { Tutorial } from '../ui/Tutorial';
import { HelpButton } from '../ui/HelpButton';
import { SaveManager } from '../storage/SaveManager';
import { PlayerSide } from './PlayerSide';
import { GameMode, PlayerSlot } from './types';
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
  readonly #physics: PhysicsWorld;

  readonly #pieces: PieceFactory;
  readonly #turns: TurnManager;
  readonly #pockets: PocketManager;
  readonly #input: InputManager;
  readonly #notifications: Notifications;
  readonly #audio: AudioManager;
  readonly #soundToggle: SoundToggle;
  readonly #hud: GameHUD;
  readonly #menu: MainMenu;
  readonly #tutorial: Tutorial;
  readonly #helpButton: HelpButton;
  readonly #save = new SaveManager();

  #physicsDebug: PhysicsDebugRenderer | undefined;

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

    // Physics owns the rails as static colliders, built from the same
    // BoardConfig the visual rails came from.
    this.#physics = new PhysicsWorld(this.events);

    // 9 white + 9 black + Queen + striker, in the standard opening arrangement.
    this.#pieces = new PieceFactory(this.#physics);
    this.#scene.add(this.#pieces.group);

    // Pockets must exist before turns: the turn machine reads the shot log.
    this.#pockets = new PocketManager(this.events, this.#physics, this.#pieces);
    this.#turns = new TurnManager(
      this.events,
      this.#physics,
      this.#pieces,
      this.#pockets,
    );

    // Audio subscribes to physics and pocket events; it never calls into rules.
    this.#audio = new AudioManager(this.events);
    this.#soundToggle = new SoundToggle(container, this.#audio);

    this.#menu = new MainMenu(container, (mode) => this.#startMode(mode));
    this.#tutorial = new Tutorial(container, () => {
      this.#save.update({ hasSeenTutorial: true });
    });
    this.#helpButton = new HelpButton(container, () => this.#tutorial.show());
    this.#hud = new GameHUD(container, this.events);
    this.#notifications = new Notifications(container);
    this.events.on('ui:notify', ({ message, tone }) =>
      this.#notifications.show(message, tone),
    );
    this.events.on('queen:banner', ({ message }) =>
      this.#notifications.setBanner(message),
    );
    this.#input = new InputManager({
      canvas: this.#canvas,
      camera: this.#camera.camera,
      physics: this.#physics,
      pieces: this.#pieces,
      turns: this.#turns,
      events: this.events,
      uiContainer: container,
    });
    this.#scene.addPermanent(this.#input.aimSystem.group);

    if (IS_DEV) {
      this.#physicsDebug = new PhysicsDebugRenderer(this.#physics);
      this.#scene.addPermanent(this.#physicsDebug.object);
      window.addEventListener('keydown', this.#onDebugKey);
    }

    // Constructed inside the DEV guard so the class is tree-shaken out of
    // production builds entirely, not merely left inert.
    if (IS_DEV) this.#cameraTuner = new DebugCameraTuner(this.#camera);

    this.#loop = new GameLoop({
      fixedUpdate: (delta) => this.#fixedUpdate(delta),
      render: (alpha, frameDelta) => this.#render(alpha, frameDelta),
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

  get physics(): PhysicsWorld {
    return this.#physics;
  }

  get pieces(): PieceFactory {
    return this.#pieces;
  }

  get turns(): TurnManager {
    return this.#turns;
  }

  get pockets(): PocketManager {
    return this.#pockets;
  }

  get audio(): AudioManager {
    return this.#audio;
  }

  get hud(): GameHUD {
    return this.#hud;
  }

  /**
   * Start a match in a given mode.
   *
   * Seats are data: the mode picks which edges are occupied and in what order,
   * and everything downstream — turn passing, striker placement, the HUD —
   * reads that rather than branching on the mode.
   */
  setMode(mode: GameMode): void {
    const seats = SEAT_LAYOUTS[mode];
    this.#turns.configureSeats(mode, seats);
    this.#hud.setSeats(seats);
    this.#hud.bind(this.#turns.match);
    this.resetBoard();
  }

  get menu(): MainMenu {
    return this.#menu;
  }

  /** Return to mode selection. Panels are cleared so none linger. */
  showMenu(): void {
    this.#hud.setSeats([]);
    this.#notifications.setBanner(null);
    this.#menu.show();
  }

  /** Chosen from the menu: configure the mode, then hand over the board. */
  #startMode(mode: GameMode): void {
    this.#menu.hide();
    this.setMode(mode);
    this.#turns.start();

    // Teach the controls the first time only. The turn machine is already
    // running underneath, so a player who dismisses it immediately loses
    // nothing — the board is waiting exactly as they left it.
    if (!this.#save.data.hasSeenTutorial) this.#tutorial.show();
  }

  get input(): InputManager {
    return this.#input;
  }

  /** Return every piece to its opening position. */
  resetBoard(): void {
    this.#pieces.resetBoard();
    this.#pockets.reset();
    this.#turns.reset();
    this.#notifications.setBanner(null);
    this.#input.resetStriker();
    this.#hud.bind(this.#turns.match);
  }

  get loop(): GameLoop {
    return this.#loop;
  }

  start(): void {
    if (this.#disposed) throw new Error('Game has been disposed');
    // The loop runs from the outset so the board is live behind the menu —
    // the menu sits on the table rather than replacing it.
    this.#loop.start();
    this.showMenu();
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

  #fixedUpdate(delta: number): void {
    this.#physics.step(delta);
    // Detection runs before the turn machine: a piece pocketed on this step
    // must be logged before the same step can declare the shot settled.
    this.#pockets.update(delta);
    this.#turns.update();
  }

  #render(_alpha: number, frameDelta: number): void {
    // Camera easing runs on the real frame delta, not the fixed step — it is
    // presentation, and must take the same wall-clock time at any frame rate.
    this.#camera.update(frameDelta);
    // Positions are copied from the simulation once per frame rather than once
    // per fixed step: several steps can run in one frame, and only the last
    // one is ever seen.
    this.#pieces.sync();
    this.#physicsDebug?.update();
    this.#renderer.render(this.#scene.scene, this.#camera.camera);
  }

  /** Dev overlays. `C` toggles colliders, `R` resets the board. */
  readonly #onDebugKey = (event: KeyboardEvent): void => {
    if (event.key === 'c' || event.key === 'C') {
      const visible = this.#physicsDebug?.toggle() ?? false;
      console.info(`[Debug] colliders ${visible ? 'on' : 'off'}`);
    }
    if (event.key === 'r' || event.key === 'R') this.resetBoard();
  };

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

    window.removeEventListener('keydown', this.#onDebugKey);
    this.#helpButton.dispose();
    this.#tutorial.dispose();
    this.#menu.dispose();
    this.#hud.dispose();
    this.#soundToggle.dispose();
    this.#audio.dispose();
    this.#notifications.dispose();
    this.#input.dispose();
    this.#pieces.dispose();
    this.#physicsDebug?.dispose();
    this.#physics.dispose();
    this.#board.dispose();
    this.#lighting.dispose();
    this.#scene.dispose();
    this.#renderer.dispose();
    this.events.clear();
    this.#canvas.remove();
  }
}

/**
 * Which seats each mode uses.
 *
 * Four-player order runs clockwise from the bottom, so play passes to the
 * person physically next to you — the same way it goes round a real board.
 * Names are placeholders until a profile system exists.
 */
const SEAT_LAYOUTS: Record<GameMode, readonly SeatConfig[]> = {
  [GameMode.QuickMatch]: [
    { slot: PlayerSlot.One, side: PlayerSide.Bottom, name: 'You', initials: 'YO', accent: SEAT_ACCENTS.bottom },
    { slot: PlayerSlot.Two, side: PlayerSide.Top, name: 'Computer', initials: 'AI', accent: SEAT_ACCENTS.top },
  ],
  [GameMode.LocalMultiplayer]: [
    { slot: PlayerSlot.One, side: PlayerSide.Bottom, name: 'Player 1', initials: 'P1', accent: SEAT_ACCENTS.bottom },
    { slot: PlayerSlot.Two, side: PlayerSide.Top, name: 'Player 2', initials: 'P2', accent: SEAT_ACCENTS.top },
  ],
  [GameMode.Practice]: [
    { slot: PlayerSlot.One, side: PlayerSide.Bottom, name: 'Practice', initials: 'PR', accent: SEAT_ACCENTS.bottom },
  ],
  // Seating exactly as specified: P1 left, P2 top, P3 right, P4 bottom, so
  // partners (P1+P3, P2+P4) sit opposite each other as at a real board.
  [GameMode.FourPlayer]: [
    { slot: PlayerSlot.One, side: PlayerSide.Left, name: 'Player 1', initials: 'P1', accent: SEAT_ACCENTS.left },
    { slot: PlayerSlot.Two, side: PlayerSide.Top, name: 'Player 2', initials: 'P2', accent: SEAT_ACCENTS.top },
    { slot: PlayerSlot.Three, side: PlayerSide.Right, name: 'Player 3', initials: 'P3', accent: SEAT_ACCENTS.right },
    { slot: PlayerSlot.Four, side: PlayerSide.Bottom, name: 'Player 4', initials: 'P4', accent: SEAT_ACCENTS.bottom },
  ],
  [GameMode.Career]: [
    { slot: PlayerSlot.One, side: PlayerSide.Bottom, name: 'You', initials: 'YO', accent: SEAT_ACCENTS.bottom },
    { slot: PlayerSlot.Two, side: PlayerSide.Top, name: 'Opponent', initials: 'OP', accent: SEAT_ACCENTS.top },
  ],
};
