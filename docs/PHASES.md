# Carrom Arena 3D — Phase Plan & Progress Tracker

> Execution order is binding. A phase is not started until the previous one
> runs, builds clean, and has been verified. Full requirements live in
> [SCOPE.md](./SCOPE.md).

## Status legend

`⬜ Not started` · `🟨 In progress` · `✅ Done`

| # | Phase | Status | Notes |
| --- | --- | --- | --- |
| 1 | Project setup | ✅ Done | Vite + TS + Three.js + Rapier, folder skeleton, configs |
| 2 | Three.js scene | ⬜ Not started | Renderer, scene, camera, lighting |
| 3 | Carrom board | ⬜ Not started | Surface, frame, pockets, markings |
| 4 | Physics | ⬜ Not started | Rapier world, `PHYSICS_CONFIG`, rest detection |
| 5 | Coins and striker | ⬜ Not started | Meshes + bodies, `PieceFactory` |
| 6 | Input and shooting | ⬜ Not started | Positioning, aiming, power, release |
| 7 | Pocket detection | ⬜ Not started | Corner sensors, removal, events |
| 8 | Game rules | ⬜ Not started | `RuleEngine`, `TurnManager`, fouls |
| 9 | Queen logic | ⬜ Not started | Cover, return-to-center, UI signal |
| 10 | AI | ⬜ Not started | Planner, scorer, difficulty tiers |
| 11 | UI | ⬜ Not started | All 11 screens, HUD |
| 12 | Career levels | ⬜ Not started | 30 data-driven levels, challenges |
| 13 | Audio and effects | ⬜ Not started | SFX, music, particles |
| 14 | Mobile optimization | ⬜ Not started | Touch controls, responsive layout |
| 15 | Testing and polish | ⬜ Not started | Validation suite, debug mode, tuning |

---

## Per-phase detail

### Phase 1 — Project setup
Vite + TypeScript scaffold, Three.js and Rapier installed, full `src/` folder
skeleton, `GameConfig.ts`, `PhysicsConfig.ts`, `BoardConfig.ts`, strict
tsconfig, npm scripts. `npm run dev` and `npm run build` both succeed.

### Phase 2 — Three.js scene
`Renderer`, `SceneManager`, `CameraManager`, `Lighting`. Slightly isometric
perspective camera framing the whole board, responsive resize, soft shadows,
ambient + directional light. Fixed-timestep `GameLoop` driving render.

### Phase 3 — Carrom board
`CarromBoard` builds the wooden surface, raised borders with rounded edges,
four corner pockets, center circle, baselines, placement circles, pocket
indicators. Believable materials.

### Phase 4 — Physics
`PhysicsWorld` wrapping Rapier, fixed timestep synced to `GameLoop`, board
walls as static colliders, `PHYSICS_CONFIG` tunables, damping, and **rest
detection** for all bodies (gates turn completion).

### Phase 5 — Coins and striker
`Coin`, `Striker`, `Queen`, `PieceFactory`. 9 white + 9 black + Queen +
striker, each with mesh, rigid body, collider, configurable mass/friction/
restitution. Standard opening arrangement. Geometry and materials reused.

### Phase 6 — Input and shooting
`InputManager`, `DesktopControls`, `MobileControls`, `AimSystem`. Striker drags
along the baseline within legal bounds; aim line, direction indicator, power
meter; force from drag vector, clamped; release fires. Accidental shots
prevented. Input locked during simulation.

### Phase 7 — Pocket detection
Four pocket sensors, correct-piece detection, removal from active play, pocket
animation, sound hook, state update, rule evaluation. Striker-in-pocket flagged
as foul.

### Phase 8 — Game rules
`RuleEngine`, `TurnManager` (full state machine), `FoulManager`,
`PocketManager`, `ShotEvaluator`. Coin ownership from first valid pocket,
continue-on-own-coin, turn change on miss, foul penalties, win detection.

### Phase 9 — Queen logic
`QueenManager` with the four-state machine, cover-on-next-shot requirement,
return-to-center with nearest-valid-position fallback, and the
`QUEEN POCKETED` / `COVER THE QUEEN` indicators.

### Phase 10 — AI
`AIPlayer`, `ShotPlanner`, `ShotScorer`, `AIDifficulty`. Real shots through the
same striker and physics systems. Scoring across all listed factors, bank
shots, difficulty-based error injection, thinking delay.

### Phase 11 — UI
`UIManager`, `GameHUD`, `MainMenu`, `PauseMenu`, `VictoryScreen` and the
remaining screens. Premium minimal styling that never blocks the board.

### Phase 12 — Career levels
`LevelManager`, `LevelData` (30 levels across 6 tiers), `CareerManager`,
challenge objectives, star awards, `SaveManager` persistence, player profile.

### Phase 13 — Audio and effects
`AudioManager` with all SFX and music, music/SFX toggles, subtle pocket
particles and glow, victory confetti.

### Phase 14 — Mobile optimization
Touch controls, portrait and landscape layouts, board scaling, graphics quality
tiers, object pooling and allocation cleanup against the FPS targets.

### Phase 15 — Testing and polish
Validation for the eight listed behaviors, debug mode (colliders, sensors,
velocity, aim vectors, AI targets) stripped from production builds, physics
tuning, final polish.

---

## Phase reports

Each completed phase records: files created, files modified, what works, known
limitations, recommended next phase.

### Phase 1 — Project setup ✅

See [`reports/phase-01.md`](./reports/phase-01.md).
