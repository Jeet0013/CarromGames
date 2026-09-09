/**
 * Root orchestrator.
 *
 * Owns every subsystem's lifetime and wires them together. It knows *what* the
 * systems are but not how they work, and it holds no game rules — those arrive
 * in `gameplay/` in a later phase.
 */

import * as THREE from 'three';

import { BOARD_CONFIG } from '../board/BoardConfig';
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
import { SplashScreen } from '../ui/SplashScreen';
import { Tutorial } from '../ui/Tutorial';
import { HelpButton } from '../ui/HelpButton';
import { ExitButton } from '../ui/ExitButton';
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
import { GameMode, PlayerSlot, QueenState, TurnState } from './types';
import { GAME_CONFIG, IS_DEV } from '../config/GameConfig';
import { CameraManager } from '../rendering/CameraManager';
import { DebugCameraTuner } from '../rendering/DebugCameraTuner';
import { COINS_PER_PLAYER } from '../gameplay/RuleSet';
import { Haptics } from '../ui/Haptics';
import { Environment } from '../rendering/Environment';
import { Lighting } from '../rendering/Lighting';
import { Renderer } from '../rendering/Renderer';
import { Room } from '../rendering/Room';
import { SceneManager } from '../rendering/SceneManager';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { QualityTier } from './types';

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
  readonly #environment: Environment;
  readonly #room: Room;
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
  readonly #splash: SplashScreen;
  readonly #tutorial: Tutorial;
  readonly #helpButton: HelpButton;
  readonly #exitButton: ExitButton;
  readonly #save = new SaveManager();
  readonly #difficultySelect: DifficultySelect;
  readonly #ai: AIPlayer;
  readonly #pocketEffect: PocketEffect;
  readonly #victory: VictoryScreen;
  readonly #powder: PowderEffect;
  readonly #haptics: Haptics;
  readonly #powderCan: PowderCan;
  readonly #cinematic: CinematicCameraManager;
  readonly #net: NetworkManager;
  readonly #lobby: OnlineLobby;
  #lastMode: GameMode = GameMode.LocalMultiplayer;
  /** Host snapshot waiting for the local board to stop moving. */
  #pendingSync: { pieces: readonly PieceSnapshot[]; currentPlayer: PlayerSlot } | null = null;

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
    // Image-based lighting, baked once from a room built in code. The low
    // tier goes without: the bake is cheap but the per-fragment IBL lookup on
    // every physical material is not, and that tier exists for GPUs that are
    // already struggling.
    this.#environment = new Environment();
    const hasEnvironment = quality !== QualityTier.Low;
    if (hasEnvironment) {
      // Half strength. The bake is authored bright so highlights have somewhere
      // to roll off, which is the right way to author it and the wrong way to
      // apply it at full weight: the environment is the fill, and the key light
      // is still what shapes the board.
      this.#scene.setEnvironment(this.#environment.build(this.#renderer.three), 0.5);
    }

    this.#lighting = new Lighting(quality, hasEnvironment);

    // Lights and the room are permanent furniture — they must survive a board
    // teardown between matches.
    this.#scene.addPermanent(this.#lighting.group);

    this.#room = new Room(quality);
    this.#scene.addPermanent(this.#room.group);

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

    // Feel, on the two events worth feeling. Android only in practice; an
    // iPhone gets the sound and nothing else, which is the whole fallback.
    this.#haptics = new Haptics(this.events);

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

    this.events.on('rules:gameComplete', ({ winner, by }) => this.#showResult(winner, by));

    // Turn the board toward whoever plays next.
    this.events.on('turn:playerSwitched', () => this.#faceActivePlayer());
    this.#turns = new TurnManager(
      this.events,
      this.#physics,
      this.#pieces,
      this.#pockets,
    );

    // Audio subscribes to physics and pocket events; it never calls into rules.
    this.#audio = new AudioManager(this.events);

    /*
     * Restore the saved sound preference.
     *
     * `SaveManager` has persisted `settings.sfxEnabled` since it was written,
     * and nothing ever read it back — so muting the game survived exactly
     * until the next reload, then silently switched itself back on. The
     * setting was being written and thrown away.
     */
    this.#audio.setSfxEnabled(this.#save.data.settings.sfxEnabled);
    this.#audio.setMusicEnabled(this.#save.data.settings.musicEnabled);
    this.#soundToggle = new SoundToggle(container, this.#audio, (sfxEnabled) => {
      // Music follows the one mute control, so both are stored together.
      this.#save.update({ settings: { sfxEnabled, musicEnabled: sfxEnabled } });
    });

    this.#net = new NetworkManager(this.events);
    this.#lobby = new OnlineLobby(
      container,
      () => {
        this.#net.disconnect();
        this.#lobby.hide();
        this.showMenu();
      },
      (code) => this.#joinByCode(code),
    );
    this.#wireNetwork();

    this.#victory = new VictoryScreen(
      container,
      () => this.#playAgain(),
      () => this.showMenu(),
    );
    this.#splash = new SplashScreen(container, () => {
      // The tap has already unlocked audio via the capture-phase listeners, so
      // the theme is running by the time the menu appears.
      this.#audio.startMenuMusic();
      this.showMenu();
    });
    this.#menu = new MainMenu(container, (mode) => this.#startMode(mode));
    this.#tutorial = new Tutorial(container, () => {
      this.#save.update({ hasSeenTutorial: true });
      /*
       * The theme runs until the player actually starts playing.
       *
       * Stopping it the moment a mode is chosen cut it off while the player was
       * still reading the rules — which is still pre-game, and silence there
       * feels like something broke. Dismissing the tutorial is the real
       * boundary: that is when the board becomes theirs.
       */
      this.#audio.stopMenuMusic();
    });
    this.#helpButton = new HelpButton(container, () => this.#tutorial.show());
    this.#exitButton = new ExitButton(container, () => {
      // Leaving must also drop an online session, or the peer keeps sending
      // shots into a match that no longer exists on this device.
      if (this.#net.isOnline) {
        this.#net.disconnect();
        this.#camera.setAzimuthDegrees(0);
      }
      this.#pendingSync = null;
      this.#ai.configure(null, AIDifficulty.Normal);
      this.#victory.hide();
      this.showMenu();
    });
    this.#difficultySelect = new DifficultySelect(
      container,
      (difficulty) => this.#startVsComputer(difficulty),
      () => {
        this.#difficultySelect.hide();
        this.#menu.show();
      },
    );

    /*
     * One delegated listener rather than a call in every control.
     *
     * Capture phase, because several buttons call `stopPropagation` so a tap
     * does not also aim a shot — a bubbling listener would miss exactly the
     * controls a player presses most.
     */
    container.addEventListener(
      'pointerdown',
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('button')) this.#audio.playClick();
      },
      { capture: true },
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
    this.#lastBoardTop = -1;
    this.resetBoard();
    // Snap on entry; later turns swing.
    this.#faceActivePlayer(true);
  }

  /** Announce the result in the winner's own terms. */
  #showResult(winner: PlayerSlot, by: PlayerSlot): void {
    const seats = SEAT_LAYOUTS[this.#lastMode];
    const match = this.#turns.match;
    const seat = seats.find((s) => s.slot === winner);
    const vsComputer = this.#lastMode === GameMode.QuickMatch;
    const online = this.#net.isOnline;
    // Online, "you" is whichever seat this device owns; everywhere else the
    // human is Player One.
    const localSlot = online ? this.#net.localSlot : PlayerSlot.One;
    const humanWon = winner === localSlot;

    // A board can be cleared by the *other* player: pocketing an opponent's
    // coin is a foul, but the coin still counts for its owner. Saying "all
    // nine coins pocketed" there would read as a bug, so the result explains
    // itself.
    const clearedByOpponent = winner !== by;

    this.#setChromeVisible(false);
    this.#victory.show({
      headline: vsComputer
        ? humanWon
          ? 'YOU WIN'
          : 'COMPUTER WINS'
        : `${seat?.name ?? 'Player'} WINS`,
      subtitle: clearedByOpponent
        ? humanWon
          ? 'Your opponent pocketed your last coin — the board is yours.'
          : 'Their last coin went down on your shot, which finishes their board.'
        : humanWon
          ? 'All nine coins pocketed, with the Queen settled.'
          : 'All nine of their coins pocketed, with the Queen settled.',
      playerWon: humanWon,
      // Every seat's final board, winner first, so the eye lands on the result
      // before the detail.
      rows: seats
        .map((s) => {
          const player = match.players[s.slot];
          return {
            name: s.name,
            color: player.color,
            potted: Math.min(COINS_PER_PLAYER, player.coinsPocketed),
            total: COINS_PER_PLAYER,
            hasQueen:
              match.queen === QueenState.Covered && match.queenPocketedBy === s.slot,
            isWinner: s.slot === winner,
          };
        })
        .sort((a, b) => Number(b.isWinner) - Number(a.isWinner)),
    });
  }

  /**
   * Show or hide the in-game corner controls.
   *
   * They are pinned above everything so they stay reachable during play, which
   * meant they also sat on top of the menu and could be tapped through it —
   * on a small screen they landed directly over the first mode card.
   */
  #setChromeVisible(visible: boolean): void {
    this.#soundToggle.setVisible(visible);
    this.#helpButton.setVisible(visible);
    this.#powderCan.setVisible(visible);
    this.#exitButton.setVisible(visible);
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

  /**
   * Put this device's own player at the near edge.
   *
   * The board is shared, so both devices cannot both have Player One at the
   * bottom in *world* terms — but each player must see their own side nearest
   * them, or they are shooting away from themselves at a striker on the far
   * rail. The guest therefore views the board from the opposite azimuth and
   * gets its panel moved to the bottom. No game state changes: the world is
   * identical on both machines, only the viewpoint differs.
   */
  /**
   * Rotate the board so the active player's edge is nearest the screen.
   *
   * Only one person plays at a time, and asking three of four players to shoot
   * "upwards" at a striker on the far rail is the single worst thing about
   * hot-seat play on one device. Turning the board between turns costs nothing
   * — the world is untouched, only the viewpoint moves — and the swing itself
   * tells the next player the device is now theirs.
   *
   * Input needs no adjustment: it is ray-cast into world space, so dragging
   * toward yourself always sends the striker away from you, whatever the
   * camera angle.
   */
  #faceActivePlayer(snap = false): void {
    if (this.#turns.match.mode !== GameMode.FourPlayer) return;
    const azimuth = {
      [PlayerSide.Bottom]: 0,
      [PlayerSide.Right]: 90,
      [PlayerSide.Top]: 180,
      [PlayerSide.Left]: 270,
    }[this.#turns.currentSide];
    this.#camera.setAzimuthDegrees(azimuth, snap);
  }

  #applyLocalSeatView(): void {
    const guest = this.#net.role === 'guest';
    this.#camera.setAzimuthDegrees(guest ? 180 : 0);

    const seats = SEAT_LAYOUTS[GameMode.Online].map((seat) => ({
      ...seat,
      // Whoever is local sits at the bottom of *this* screen.
      side: seat.slot === this.#net.localSlot ? PlayerSide.Bottom : PlayerSide.Top,
      name: seat.slot === this.#net.localSlot ? 'You' : 'Opponent',
      initials: seat.slot === this.#net.localSlot ? 'YO' : 'OP',
    }));
    this.#hud.setSeats(seats);
    this.#hud.bind(this.#turns.match);
  }

  /** Create a room and show the share link. */
  async #hostOnline(): Promise<void> {
    this.#setChromeVisible(false);
    try {
      this.#lobby.showHosting('Creating room…', '');
      const roomId = await this.#net.host();
      this.#lobby.showHosting(
        this.#net.shareLink,
        roomId,
        NetworkManager.shareLinkReachable,
      );
    } catch (error) {
      this.#lobby.setStatus(
        `Could not create a room: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /**
   * Join from a code the player typed, rather than a link they followed.
   *
   * The host is already hosting an empty room of their own by the time they
   * reach this box, so that has to be torn down first — otherwise the device
   * would be waiting for a guest and joining someone else at the same time.
   */
  #joinByCode(input: string): void {
    const roomId = NetworkManager.parseRoomCode(input);
    if (roomId === null) {
      this.#lobby.setJoinError(
        'That does not look like a room code. It is six letters and numbers, like “a1b2c3”.',
      );
      return;
    }
    this.#net.disconnect();
    void this.joinOnline(roomId);
  }

  /** Join a room from a shared link. Called at boot when `?join=` is present. */
  async joinOnline(roomId: string): Promise<void> {
    /*
     * The splash sits above everything so its tap can unlock audio, which put
     * it directly on top of the lobby for anyone arriving on a share link:
     * they saw "Tap to start" over a connection they had not asked to make,
     * and the tap fell through onto the lobby's own controls. Someone opening
     * an invitation has already chosen what they want, so this screen is not
     * theirs — audio unlocks on their first tap anywhere regardless.
     */
    this.#splash.hide();
    this.#menu.hide();
    this.#setChromeVisible(false);
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
        this.#startOnlineMatch();
        this.events.emit('ui:notify', { message: 'OPPONENT CONNECTED', tone: 'good' });
      }
      if (status === 'disconnected') {
        /*
         * A dropped opponent used to leave the match standing, and that is a
         * dead end rather than a setback: input is locked whenever it is the
         * remote player's turn, so the local player was left holding a board
         * they could not touch and no way out but a reload.
         */
        this.events.emit('ui:notify', { message: 'OPPONENT LEFT', tone: 'bad' });
        this.#pendingSync = null;
        this.#victory.hide();
        this.#net.disconnect();
        this.#camera.setAzimuthDegrees(0, true);
        this.showMenu();
      }
      if (status === 'error' && detail) this.#lobby.setStatus(detail);
    };

    // Both devices restart together, or the boards disagree from move one.
    this.#net.onRematch = () => {
      this.#victory.hide();
      this.#startOnlineMatch();
      this.events.emit('ui:notify', { message: 'REMATCH', tone: 'good' });
    };

    // A shot from the other device is replayed through the same turn machine
    // that a local shot uses, so the rules cannot tell them apart.
    this.#net.onShot = (by, shot) => {
      if (by === this.#net.localSlot) return;
      this.#physics.setPosition('striker', shot.origin.x, shot.origin.z);
      this.#turns.acceptRemoteShot(shot);
    };

    /*
     * Guest only: adopt the host's positions once its shot has settled.
     *
     * Held back while the board is still moving. `adoptTurn` forces the turn
     * machine into positioning, and the host's snapshot routinely arrives
     * before the guest has finished simulating the same shot — so applying it
     * on arrival tore the guest out of `PHYSICS_SETTLING` mid-shot. The shot
     * was then never resolved locally: its score was never counted and its
     * pocket log leaked into the *next* shot's evaluation. Deferring costs a
     * few frames and keeps both boards honest.
     */
    this.#net.onSync = (pieces, currentPlayer) => {
      this.#pendingSync = { pieces, currentPlayer };
      this.#drainSync();
    };

    // Relay every locally-taken shot.
    this.events.on('shot:fired', ({ by, shot }) => {
      if (!this.#net.isOnline) return;
      if (by !== this.#net.localSlot) return;
      this.#net.sendShot(by, shot);
    });

    // Host publishes the truth after every shot.
    //
    // On `shot:resolved`, not `shot:settled`: the latter fires before the rule
    // engine runs, so the sync carried the pre-shot `currentPlayer`. The guest
    // adopted it, was pushed back into the host's turn, and could never move.
    this.events.on('shot:resolved', ({ nextPlayer }) => {
      if (!this.#net.isHost) return;
      const snapshot: PieceSnapshot[] = this.#pieces.pieces.map((piece) => ({
        id: piece.id,
        x: +piece.position.x.toFixed(4),
        z: +piece.position.z.toFixed(4),
        active: piece.active,
      }));
      this.#net.sendSync(snapshot, nextPlayer);
    });
  }

  /**
   * Apply a held snapshot, once the board is settled enough to accept it.
   *
   * Called both on arrival and from the fixed update, so a snapshot that
   * turned up mid-shot lands the moment the shot resolves.
   */
  #drainSync(): void {
    const pending = this.#pendingSync;
    if (!pending) return;
    // Anything but positioning means a shot of our own is still resolving.
    if (this.#turns.state !== TurnState.StrikerPositioning) return;
    this.#pendingSync = null;

    for (const snapshot of pending.pieces) {
      const piece = this.#pieces.get(snapshot.id);
      if (!piece) continue;
      if (!snapshot.active && piece.active) piece.pocket(this.#physics);
      else if (snapshot.active) {
        if (piece.pocketed) piece.reset(this.#physics, { x: snapshot.x, z: snapshot.z });
        else this.#physics.setPosition(snapshot.id, snapshot.x, snapshot.z);
      }
    }
    this.#turns.adoptTurn(pending.currentPlayer);
    this.#hud.bind(this.#turns.match);
  }

  /**
   * Put both devices into a fresh online match.
   *
   * Shared by the first connection and by a rematch, so the two can never
   * drift apart in what they set up.
   */
  #startOnlineMatch(): void {
    this.#pendingSync = null;
    this.#lastMode = GameMode.Online;
    this.#setChromeVisible(true);
    // The theme belongs to the menus; play is quiet apart from the board.
    this.#audio.stopMenuMusic();
    this.setMode(GameMode.Online);
    this.#ai.configure(null, AIDifficulty.Normal);
    this.#applyLocalSeatView();
    this.#turns.start();
  }

  get cinematic(): CinematicCameraManager {
    return this.#cinematic;
  }

  /** Start a match against the computer at the chosen difficulty. */
  #startVsComputer(difficulty: AIDifficulty): void {
    this.#difficultySelect.hide();
    this.#setChromeVisible(true);
    // The theme belongs to the menus; play is quiet apart from the board.
    this.#audio.stopMenuMusic();
    this.setMode(GameMode.QuickMatch);
    // The AI takes the top seat; the human keeps the bottom one.
    this.#ai.configure(PlayerSlot.Two, difficulty);
    this.#save.update({ settings: { ...this.#save.data.settings } });
    this.#turns.start();
    this.#tutorial.show();
    if (!this.#tutorial.visible) this.#audio.stopMenuMusic();
  }

  /** Return to mode selection. Panels are cleared so none linger. */
  showMenu(): void {
    this.#pendingSync = null;
    this.#hud.setSeats([]);
    this.#notifications.setBanner(null);
    this.#setChromeVisible(false);
    this.#menu.show();
    // Plays whenever a menu is up, including on the way back from a match.
    this.#audio.startMenuMusic();
  }

  /**
   * Rematch from the victory screen.
   *
   * Online this must reuse the live connection. Routing it through
   * `#startMode` created a *second* room while the first was still open: the
   * player was shown a fresh invite link and their opponent, who had gone
   * nowhere, was silently abandoned.
   */
  #playAgain(): void {
    if (this.#net.isOnline && this.#net.status === 'connected') {
      this.#net.sendRematch();
      this.#victory.hide();
      this.#startOnlineMatch();
      return;
    }
    this.#startMode(this.#lastMode);
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
    this.#setChromeVisible(true);
    // Leaving an online game must actually drop the connection, or the peer
    // keeps sending shots into a match that no longer exists.
    if (this.#net.isOnline) {
      this.#net.disconnect();
      this.#camera.setAzimuthDegrees(0, true);
    }
    this.#camera.setAzimuthDegrees(0, true);
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
    if (!this.#tutorial.visible) this.#audio.stopMenuMusic();
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
    this.#setChromeVisible(false);
    this.#splash.show();
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
    // A snapshot held back mid-shot is applied the instant the board settles.
    this.#drainSync();
  }

  /** Board corners in world space, reused so the projection allocates nothing. */
  readonly #boardCorner = new THREE.Vector3();
  /** Last reported board bounds, to avoid redundant DOM writes. */
  #lastBoardTop = -1;
  #lastBoardBottom = -1;

  /**
   * Project the board and tell the HUD where its edges are.
   *
   * Done per frame because the camera moves — it swings between turns, pushes
   * in on a shot, and reframes on resize — and a label pinned to a stale
   * position would drift off the board. Four projections and a comparison is
   * nothing; the DOM is only touched when the value actually changes.
   */
  #layoutHud(): void {
    const half = BOARD_CONFIG.frame.outerSize / 2;
    const camera = this.#camera.camera;
    const height = this.#container.clientHeight;
    if (height === 0) return;

    let top = Infinity;
    let bottom = -Infinity;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.#boardCorner.set(sx * half, BOARD_CONFIG.frame.height, sz * half);
        this.#boardCorner.project(camera);
        const y = ((1 - this.#boardCorner.y) / 2) * height;
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }

    if (Math.abs(top - this.#lastBoardTop) < 1.5 && Math.abs(bottom - this.#lastBoardBottom) < 1.5) {
      return;
    }
    this.#lastBoardTop = top;
    this.#lastBoardBottom = bottom;
    this.#hud.layoutAroundBoard(top, bottom, height);
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
    this.#layoutHud();
    this.#pocketEffect.update(frameDelta);
    // The visual reads the physics world's own powder level, so what is shown
    // and what the coins feel can never drift apart.
    const powderLevel = this.#physics.powderLevel;
    // Dust off the striker while it runs, so a slick board looks slick rather
    // than just behaving strangely.
    const striker = this.#pieces.striker;
    const strikerMotion = striker.active
      ? {
          x: striker.position.x,
          z: striker.position.z,
          speed: this.#physics.speedOf(striker.id),
        }
      : null;
    this.#powder.update(frameDelta, powderLevel, strikerMotion);
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
    this.#hud.handleResize();
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
    this.#haptics.dispose();
    this.#powder.dispose();
    this.#victory.dispose();
    this.#pocketEffect.dispose();
    this.#difficultySelect.dispose();
    this.#exitButton.dispose();
    this.#helpButton.dispose();
    this.#tutorial.dispose();
    this.#splash.dispose();
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
    this.#room.dispose();
    this.#environment.dispose();
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
