# Carrom Arena 3D — Phase Plan & Progress Tracker

> Execution order is binding. A phase is not started until the previous one
> runs, builds clean, and has been verified. Full requirements live in
> [SCOPE.md](./SCOPE.md).

**Numbering note.** The master spec listed "Three.js scene" as its own phase.
On the owner's direction it was folded into Phase 1, which now delivers the
toolchain *and* the rendering foundation. Everything after has shifted up one,
giving 14 phases. Content is unchanged — only the grouping.

## Status legend

`⬜ Not started` · `🟨 In progress` · `✅ Done`

| # | Phase | Status | Notes |
| --- | --- | --- | --- |
| 1 | Project setup + scene foundation | ✅ Done | Toolchain, skeleton, configs, renderer, camera, lighting, loop |
| 2 | Carrom board | 🟨 In progress | Surface, rails, pockets, markings, materials |
| 3 | Physics | ⬜ Not started | Rapier world, `PHYSICS_CONFIG`, rest detection |
| 4 | Coins and striker | ⬜ Not started | Meshes + bodies, `PieceFactory` |
| 5 | Input and shooting | ⬜ Not started | Positioning, aiming, power, release |
| 6 | Pocket detection | ⬜ Not started | Corner sensors, removal, events |
| 7 | Game rules | ⬜ Not started | `RuleEngine`, `TurnManager`, fouls |
| 8 | Queen logic | ⬜ Not started | Cover, return-to-center, UI signal |
| 9 | AI | ⬜ Not started | Planner, scorer, difficulty tiers |
| 10 | UI | ⬜ Not started | All 11 screens, HUD |
| 11 | Career levels | ⬜ Not started | 30 data-driven levels, challenges |
| 12 | Audio and effects | ⬜ Not started | SFX, music, particles |
| 13 | Mobile optimization | ⬜ Not started | Touch controls, responsive layout |
| 14 | Testing and polish | ⬜ Not started | Validation suite, debug mode, tuning |

---

## Per-phase detail

### Phase 1 — Project setup + scene foundation
Vite + TypeScript scaffold, Three.js and Rapier installed and verified, full
`src/` skeleton, `GameConfig` / `PhysicsConfig` / `BoardConfig`, strict
tsconfig. Plus `Renderer` (quality tiers, pixel-ratio clamp), `SceneManager`,
`CameraManager` (isometric perspective camera with exact frustum fit),
`Lighting` (key/fill/hemisphere with fitted shadow camera), `GameLoop`
(fixed 60 Hz), and `Game` wiring it together. `npm run dev` and `npm run build`
both succeed.

### Phase 2 — Carrom board
`CarromBoard` builds the wooden surface, raised rails with rounded edges, four
corner pockets, centre circle, baselines, base circles, and decorative
markings. Realistic materials, shadows, and a dev camera tuner. Board fully
visible on desktop and mobile.

### Phase 3 — Physics
`PhysicsWorld` wrapping Rapier, fixed timestep synced to `GameLoop`, board
walls as static colliders, `PHYSICS_CONFIG` tunables, damping, and **rest
detection** for all bodies (gates turn completion).

### Phase 4 — Coins and striker
`Coin`, `Striker`, `Queen`, `PieceFactory`. 9 white + 9 black + Queen +
striker, each with mesh, rigid body, collider, configurable mass/friction/
restitution. Standard opening arrangement. Geometry and materials reused.

### Phase 5 — Input and shooting
`InputManager`, `DesktopControls`, `MobileControls`, `AimSystem`. Striker drags
along the baseline within legal bounds; aim line, direction indicator, power
meter; force from drag vector, clamped; release fires. Accidental shots
prevented. Input locked during simulation.

### Phase 6 — Pocket detection
Four pocket sensors, correct-piece detection, removal from active play, pocket
animation, sound hook, state update, rule evaluation. Striker-in-pocket flagged
as foul.

### Phase 7 — Game rules
`RuleEngine`, `TurnManager` (full state machine), `FoulManager`,
`PocketManager`, `ShotEvaluator`. Coin ownership from first valid pocket,
continue-on-own-coin, turn change on miss, foul penalties, win detection.

### Phase 8 — Queen logic
`QueenManager` with the four-state machine, cover-on-next-shot requirement,
return-to-center with nearest-valid-position fallback, and the
`QUEEN POCKETED` / `COVER THE QUEEN` indicators.

### Phase 9 — AI
`AIPlayer`, `ShotPlanner`, `ShotScorer`, `AIDifficulty`. Real shots through the
same striker and physics systems. Scoring across all listed factors, bank
shots, difficulty-based error injection, thinking delay.

### Phase 10 — UI
`UIManager`, `GameHUD`, `MainMenu`, `PauseMenu`, `VictoryScreen` and the
remaining screens. Premium minimal styling that never blocks the board.

### Phase 11 — Career levels
`LevelManager`, `LevelData` (30 levels across 6 tiers), `CareerManager`,
challenge objectives, star awards, `SaveManager` persistence, player profile.

### Phase 12 — Audio and effects
`AudioManager` with all SFX and music, music/SFX toggles, subtle pocket
particles and glow, victory confetti.

### Phase 13 — Mobile optimization
Touch controls, portrait and landscape layouts, board scaling, graphics quality
tiers, object pooling and allocation cleanup against the FPS targets.

### Phase 14 — Testing and polish
Validation for the eight listed behaviors, debug mode (colliders, sensors,
velocity, aim vectors, AI targets) stripped from production builds, physics
tuning, final polish.

---

## Phase reports

Each completed phase records: files created, files modified, what works, known
limitations, recommended next phase.

- Phase 1 — [`reports/phase-01.md`](./reports/phase-01.md)
- Phase 2 — [`reports/phase-02.md`](./reports/phase-02.md)
