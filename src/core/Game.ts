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
import { DifficultySelect } from '../ui/DifficultySelect';
import { AIPlayer } from '../ai/AIPlayer';
import { AIDifficulty } from '../ai/AIDifficulty';
import { PocketEffect } from '../effects/PocketEffect';
import { VictoryScreen } from '../ui/VictoryScreen';
import { PowderEffect } from '../effects/PowderEffect';
import { PowderCan } from '../ui/PowderCan';
import { CinematicCameraManager } from '../camera/CinematicCameraManager';
import { NetworkManager, type PieceSnapshot } from '../net/NetworkManager';
import { OnlineLobby } from '../ui/OnlineLobby';
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
  readonly #difficultySelect: DifficultySelect;
  readonly #ai: AIPlayer;
  readonly #pocketEffect: PocketEffect;
  readonly #victory: VictoryScreen;
  readonly #powder: PowderEffect;
  readonly #powderCan: PowderCan;
  readonly #cinematic: CinematicCameraManager;
  readonly #net: NetworkManager;
  readonly #lobby: OnlineLobby;
  #lastMode: GameMode = GameMode.LocalMultiplayer;

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

    // Confirmation lands where the player is already looking — at the pocket.
    this.#pocketEffect = new PocketEffect();
    this.#scene.addPermanent(this.#pocketEffect.group);

    // Supplies camera offsets only; CameraManager keeps ownership of position.
    this.#cinematic = new CinematicCameraManager(this.events, this.#camera, this.#pieces);

    this.#powder = new PowderEffect();
    this.#scene.addPermanent(this.#powder.group);
    this.#powderCan = new PowderCan(container, () => {
      this.#physics.applyPowder();
      this.#powder.burst();
      this.events.emit('ui:notify', { message: 'BOARD POWDERED', tone: 'good' });
    });
    this.events.on('pocket:scored', ({ pocketIndex }) =>
      this.#pocketEffect.play(pocketIndex),
    );

    this.events.on('rules:gameComplete', ({ winner }) => this.#showResult(winner));
    this.#turns = new TurnManager(
      this.events,
      this.#physics,
      this.#pieces,
      this.#pockets,
    );

    // Audio subscribes to physics and pocket events; it never calls into rules.
    this.#audio = new AudioManager(this.events);
    this.#soundToggle = new SoundToggle(container, this.#audio);

    this.#net = new NetworkManager(this.events);
    this.#lobby = new OnlineLobby(container, () => {
      this.#net.disconnect();
      this.#lobby.hide();
      this.showMenu();
    });
    this.#wireNetwork();

    this.#victory = new VictoryScreen(
      container,
      () => this.#startMode(this.#lastMode),
      () => this.showMenu(),
    );
    this.#menu = new MainMenu(container, (mode) => this.#startMode(mode));
    this.#tutorial = new Tutorial(container, () => {
      this.#save.update({ hasSeenTutorial: true });
    });
    this.#helpButton = new HelpButton(container, () => this.#tutorial.show());
    this.#difficultySelect = new DifficultySelect(
      container,
      (difficulty) => this.#startVsComputer(difficulty),
      () => {
        this.#difficultySelect.hide();
        this.#menu.show();
      },
    );

    this.#hud = new GameHUD(container, this.events);
    this.#notifications = new Notifications(container);
    this.events.on('ui:notify', ({ message, tone }) =>
      this.#notifications.show(message, tone),
    );
    this.events.on('queen:banner', ({ message }) =>
      this.#notifications.setBanner(message),
    );
    // Locks the pointer out while the computer is playing. Routed through the
    // same `acceptsInput` gate humans pass, so there is no second code path.
    this.#input = new InputManager({
      canvas: this.#canvas,
      camera: this.#camera.camera,
      physics: this.#physics,
      pieces: this.#pieces,
      turns: this.#turns,
      uiContainer: container,
    });
    this.#scene.addPermanent(this.#input.aimSystem.group);

    // Built after the input layer because it drives the *same* AimSystem the
    // player sees, rather than a private one.
    this.#ai = new AIPlayer(
      this.events,
      this.#physics,
      this.#pieces,
      this.#turns,
      this.#input.aimSystem,
    );
    this.#input.setLock(
      () =>
        this.#ai.isActing ||
        (this.#net.isOnline && this.#turns.currentPlayer !== this.#net.localSlot),
    );
    // The shot camera performs for the player only; the computer's turn keeps
    // the stable wide framing.
    this.#cinematic.setHumanSeatTest((slot) => !this.#ai.controls(slot));

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

  /** Announce the result in the winner's own terms. */
  #showResult(winner: PlayerSlot): void {
    const seats = SEAT_LAYOUTS[this.#lastMode];
    const seat = seats.find((s) => s.slot === winner);
    const vsComputer = this.#lastMode === GameMode.QuickMatch;
    const humanWon = winner === PlayerSlot.One;

    this.#victory.show({
      headline: vsComputer
        ? humanWon
          ? 'YOU WIN'
          : 'COMPUTER WINS'
        : `${seat?.name ?? 'Player'} WINS`,
      subtitle: humanWon
        ? 'All nine coins pocketed, with the Queen settled.'
        : 'All nine of their coins pocketed, with the Queen settled.',
      playerWon: humanWon,
    });
  }

  get menu(): MainMenu {
    return this.#menu;
  }

  get ai(): AIPlayer {
    return this.#ai;
  }

  get net(): NetworkManager {
    return this.#net;
  }

  /** Create a room and show the share link. */
  async #hostOnline(): Promise<void> {
    try {
      this.#lobby.showHosting('Creating room…', '');
      const roomId = await this.#net.host();
      this.#lobby.showHosting(this.#net.shareLink, roomId);
    } catch (error) {
      this.#lobby.setStatus(
        `Could not create a room: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /** Join a room from a shared link. Called at boot when `?join=` is present. */
  async joinOnline(roomId: string): Promise<void> {
    this.#menu.hide();
    this.#lobby.showJoining();
    try {
      await this.#net.join(roomId);
    } catch (error) {
      this.#lobby.setStatus(
        error instanceof Error ? error.message : 'Could not join that game.',
      );
    }
  }

  /**
   * Connect the network to the game.
   *
   * Shots go both ways; board state goes one way. The host is the referee — see
   * NetworkManager for why replaying shots alone is not enough.
   */
  #wireNetwork(): void {
    this.#net.onStatus = (status, detail) => {
      if (status === 'connected') {
        this.#lobby.hide();
        this.setMode(GameMode.Online);
        this.#ai.configure(null, AIDifficulty.Normal);
        this.#turns.start();
        this.events.emit('ui:notify', { message: 'OPPONENT CONNECTED', tone: 'good' });
      }
      if (status === 'disconnected') {
        this.events.emit('ui:notify', { message: 'OPPONENT LEFT', tone: 'bad' });
      }
      if (status === 'error' && detail) this.#lobby.setStatus(detail);
    };

    // A shot from the other device is replayed through the same turn machine
    // that a local shot uses, so the rules cannot tell them apart.
    this.#net.onShot = (by, shot) => {
      if (by === this.#net.localSlot) return;
      this.#physics.setPosition('striker', shot.origin.x, shot.origin.z);
      this.#turns.beginAiming();
      this.#turns.executeShot(shot);
    };

    // Guest only: adopt the host's positions once its shot has settled.
    this.#net.onSync = (pieces, currentPlayer) => {
      for (const snapshot of pieces) {
        const piece = this.#pieces.get(snapshot.id);
        if (!piece) continue;
        if (!snapshot.active && piece.active) piece.pocket(this.#physics);
        else if (snapshot.active) {
          if (piece.pocketed) piece.reset(this.#physics, { x: snapshot.x, z: snapshot.z });
          else this.#physics.setPosition(snapshot.id, snapshot.x, snapshot.z);
        }
      }
      this.#turns.match.currentPlayer = currentPlayer;
      this.#hud.bind(this.#turns.match);
    };

    // Relay every locally-taken shot.
    this.events.on('shot:fired', ({ by, shot }) => {
      if (!this.#net.isOnline) return;
      if (by !== this.#net.localSlot) return;
      this.#net.sendShot(by, shot);
    });

    // Host publishes the truth after every shot.
    this.events.on('shot:settled', () => {
      if (!this.#net.isHost) return;
      const snapshot: PieceSnapshot[] = this.#pieces.pieces.map((piece) => ({
        id: piece.id,
        x: +piece.position.x.toFixed(4),
        z: +piece.position.z.toFixed(4),
        active: piece.active,
      }));
      this.#net.sendSync(snapshot, this.#turns.match.currentPlayer);
    });
  }

  get cinematic(): CinematicCameraManager {
    return this.#cinematic;
  }

  /** Start a match against the computer at the chosen difficulty. */
  #startVsComputer(difficulty: AIDifficulty): void {
    this.#difficultySelect.hide();
    this.setMode(GameMode.QuickMatch);
    // The AI takes the top seat; the human keeps the bottom one.
    this.#ai.configure(PlayerSlot.Two, difficulty);
    this.#save.update({ settings: { ...this.#save.data.settings } });
    this.#turns.start();
    this.#tutorial.show();
  }

  /** Return to mode selection. Panels are cleared so none linger. */
  showMenu(): void {
    this.#hud.setSeats([]);
    this.#notifications.setBanner(null);
    this.#menu.show();
  }

  /** Chosen from the menu: configure the mode, then hand over the board. */
  #startMode(mode: GameMode): void {
    this.#lastMode = mode;
    this.#victory.hide();

    if (mode === GameMode.Online) {
      this.#menu.hide();
      void this.#hostOnline();
      return;
    }
    // Leaving an online game must actually drop the connection, or the peer
    // keeps sending shots into a match that no longer exists.
    if (this.#net.isOnline) this.#net.disconnect();
    // Playing the computer needs a difficulty before a match can begin.
    if (mode === GameMode.QuickMatch) {
      this.#menu.hide();
      this.#difficultySelect.show();
      return;
    }

    this.#menu.hide();
    // Any human-only mode must switch the AI off, or it would keep acting.
    this.#ai.configure(null, AIDifficulty.Normal);
    this.setMode(mode);
    this.#turns.start();

    // Shown at the start of every match, not just the first. It carries the
    // win condition as well as the controls, and one tap dismisses it — the
    // board is already waiting underneath.
    this.#tutorial.show();
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
    // Advanced on the fixed step so thinking delays are frame-rate independent
    // and can never stall rendering.
    this.#ai.update(delta);
    // Detection runs before the turn machine: a piece pocketed on this step
    // must be logged before the same step can declare the shot settled.
    this.#pockets.update(delta);
    this.#turns.update();
  }

  #render(_alpha: number, frameDelta: number): void {
    // Both run on the real frame delta, not the fixed step — they are
    // presentation, and must take the same wall-clock time at any frame rate.
    // Cinematic first: it writes the offsets the camera then applies.
    this.#cinematic.update(frameDelta);
    this.#camera.update(frameDelta);
    // Positions are copied from the simulation once per frame rather than once
    // per fixed step: several steps can run in one frame, and only the last
    // one is ever seen.
    this.#pieces.sync();
    this.#pocketEffect.update(frameDelta);
    // The visual reads the physics world's own powder level, so what is shown
    // and what the coins feel can never drift apart.
    const powderLevel = this.#physics.powderLevel;
    this.#powder.update(frameDelta, powderLevel);
    this.#powderCan.setLevel(powderLevel);
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
    this.#net.disconnect();
    this.#lobby.dispose();
    this.#powderCan.dispose();
    this.#powder.dispose();
    this.#victory.dispose();
    this.#pocketEffect.dispose();
    this.#difficultySelect.dispose();
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
  // Online is two seats like local play; the difference is only which device
  // owns which one, which `NetworkManager.localSlot` decides.
  [GameMode.Online]: [
    { slot: PlayerSlot.One, side: PlayerSide.Bottom, name: 'You', initials: 'YO', accent: SEAT_ACCENTS.bottom },
    { slot: PlayerSlot.Two, side: PlayerSide.Top, name: 'Friend', initials: 'FR', accent: SEAT_ACCENTS.top },
  ],
  [GameMode.Career]: [
    { slot: PlayerSlot.One, side: PlayerSide.Bottom, name: 'You', initials: 'YO', accent: SEAT_ACCENTS.bottom },
    { slot: PlayerSlot.Two, side: PlayerSide.Top, name: 'Opponent', initials: 'OP', accent: SEAT_ACCENTS.top },
  ],
};
