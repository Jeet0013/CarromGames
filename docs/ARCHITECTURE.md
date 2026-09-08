# Carrom Arena 3D — Architecture

> Module boundaries and ownership rules. Requirements live in
> [SCOPE.md](./SCOPE.md).

## Guiding rules

1. **No giant files.** One responsibility per module.
2. **Rules never touch rendering.** `gameplay/` must be driveable headlessly —
   this is what keeps future online multiplayer viable.
3. **Communication through `EventBus`.** Systems emit and subscribe rather than
   reaching into each other.
4. **Config is data, not code.** Tunables live in `config/`, `PhysicsConfig`,
   `BoardConfig`, and `LevelData` — never scattered as literals.
5. **AI is a player, not a special case.** It drives the same striker through
   the same physics as a human.

## Directory layout

```
src/
  core/
    Game.ts              Root orchestrator; wires systems, owns lifecycle
    GameLoop.ts          Fixed-timestep loop; drives physics + render
    EventBus.ts          Typed pub/sub used across systems
    GameState.ts         Central authoritative state snapshot

  rendering/
    Renderer.ts          WebGL renderer setup, quality tiers, resize
    SceneManager.ts      Scene graph ownership, add/remove of visuals
    CameraManager.ts     Perspective camera, framing, responsive fit
    Lighting.ts          Ambient + directional lights, shadow config

  physics/
    PhysicsWorld.ts      Rapier world, stepping, rest detection
    PhysicsConfig.ts     PHYSICS_CONFIG tunables
    CollisionSystem.ts   Contact events → gameplay events

  board/
    CarromBoard.ts       Surface, frame, markings mesh construction
    BoardConfig.ts       Dimensions, baselines, pocket positions
    Pockets.ts           Pocket sensors and pocket geometry

  pieces/
    Coin.ts              Coin entity (mesh + body + collider)
    Striker.ts           Striker entity; heavier, more powerful
    Queen.ts             Queen entity
    PieceFactory.ts      Creates pieces; reuses geometry + materials

  gameplay/
    TurnManager.ts       Turn state machine
    RuleEngine.ts        Classic Carrom ruleset
    QueenManager.ts      Queen state machine and cover logic
    FoulManager.ts       Foul detection and penalties
    PocketManager.ts     Pocketed-piece bookkeeping
    ShotEvaluator.ts     Post-shot outcome evaluation

  input/
    InputManager.ts      Routes to desktop/mobile controls; input locking
    DesktopControls.ts   Mouse: position, aim, power, release
    MobileControls.ts    Touch: position, aim, power, release
    AimSystem.ts         Aim line, direction indicator, power meter

  ai/
    AIPlayer.ts          Turn driver for AI opponents
    ShotPlanner.ts       Candidate shot generation, incl. bank shots
    ShotScorer.ts        Scores candidates across weighted factors
    AIDifficulty.ts      AI_CONFIG tiers and error injection

  levels/
    LevelManager.ts      Loads and runs a level
    LevelData.ts         30 data-driven career levels
    CareerManager.ts     Progress, unlocks, stars

  ui/
    UIManager.ts         Screen routing and lifecycle
    GameHUD.ts           In-game HUD
    MainMenu.ts          Main menu
    PauseMenu.ts         Pause menu
    VictoryScreen.ts     Victory / defeat results

  audio/
    AudioManager.ts      SFX + music, per-channel toggles

  storage/
    SaveManager.ts       localStorage persistence

  config/
    GameConfig.ts        Global constants, quality tiers, debug flag

  assets/                Textures, audio, models
```

## Dependency direction

```
        ┌──────────────┐
        │    core/     │  owns lifecycle, no domain knowledge
        └──────┬───────┘
               │
   ┌───────────┼───────────┬───────────┐
   ▼           ▼           ▼           ▼
rendering/  physics/   gameplay/     input/
   │           │           │           │
   └─────┬─────┘           │           │
         ▼                 │           │
     board/ pieces/  ◄─────┘           │
                                       │
              ai/  ──────────────► (same striker API)
                                       │
     ui/ ◄── EventBus ◄────────────────┘
```

`gameplay/` depends on **no** rendering module. `ui/`, `audio/`, and effects
observe events; they are never a dependency of the rules.

## Multiplayer readiness

Not implemented in the core version, but the shape is preserved:

- All rule outcomes derive from `GameState` plus a shot input `{ position,
  direction, power }` — a serializable command.
- Rendering subscribes to state; it never mutates it.
- `TurnManager` drives turns from state transitions, so a remote turn source
  can be substituted for `AIPlayer` or local input.
