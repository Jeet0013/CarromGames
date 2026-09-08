# Implementation Plan & Risk Analysis

> Written at the Phase 8 → 9 boundary, against the revised specification that
> adds four-player, the cinematic shot camera, and impact effects. Requirements
> live in [SCOPE.md](./SCOPE.md); phase order in [PHASES.md](./PHASES.md).

---

## 1. Repository analysis

**45 TypeScript source files, 7,236 lines, 10 commits, 28 passing rule tests.**

| Layer | Files | State |
| --- | --- | --- |
| `core/` | 6 | Game, GameLoop, EventBus, GameState, PlayerSide, types |
| `rendering/` | 5 | Renderer, SceneManager, CameraManager, Lighting, DebugCameraTuner |
| `physics/` | 4 | PhysicsWorld, CollisionSystem, PhysicsConfig, PhysicsDebugRenderer |
| `board/` | 4 | CarromBoard, BoardConfig, BoardTexture, Pockets |
| `pieces/` | 5 | Piece, Coin, Queen, Striker, PieceFactory |
| `gameplay/` | 9 | RuleEngine, TurnManager, QueenManager, FoulManager, PocketManager, ShotEvaluator, RuleSet, Placement, tests |
| `input/` | 5 | InputManager, AimSystem, ControlProfile, Desktop/MobileControls |
| `ui/` | 4 | GameHUD, PlayerPanel, Notifications, SoundToggle |
| `audio/` | 1 | AudioManager |
| `config/` | 1 | GameConfig |
| `camera/`, `effects/`, `ai/`, `levels/`, `storage/` | 0 | Created, empty — Phases 9–13 |

**Phases 1–8 of the revised plan are complete and verified.** Phase 1's
requirements in particular are all present and building green — see §7.

---

## 2. Dependencies

Everything needed is installed. No further packages are required for any
remaining phase.

| Package | Version | Role |
| --- | --- | --- |
| `three` | 0.185.1 | Rendering |
| `@dimforge/rapier3d-compat` | 0.20.0 | Physics |
| `typescript` | 7.0.2 | Language (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `vite` | 8.2.2 | Dev server + build |
| `@types/three` | 0.185.4 | Types |
| `vitest` | 5.0.0 | Rule validation |

**Why `rapier3d-compat` and not `rapier3d`.** The compat build inlines its
WebAssembly as base64, so it needs no WASM plugin, no separate fetch, and works
inside the single-file build. The cost is a 2.85 MB chunk (1.09 MB gzipped),
which is the single largest line item in the bundle and the obvious Phase 14
optimisation.

**Deliberately absent:** no UI framework, no state library, no tween library,
no physics debug package, no asset pipeline. The board wood, its markings, and
every sound are generated at runtime, so the game ships zero binary assets — a
constraint worth keeping, since it is what makes the whole game fit in one
shareable 3.31 MB file.

---

## 3. Architecture

### Dependency direction

```
                    core/  (Game, GameLoop, EventBus, GameState)
                      │  owns lifetime, holds no rules
      ┌───────────────┼───────────────┬──────────────┐
      ▼               ▼               ▼              ▼
  rendering/      physics/       gameplay/        input/
      │               │               │              │
      └──── board/ ───┴─── pieces/ ───┘              │
                                                     │
   ai/ ──────── produces ShotCommand ────────────────┘
                                                     │
  ui/  audio/  effects/  ◄──── EventBus ─────────────┘
                (observers only)
```

### The one invariant everything else rests on

**`gameplay/` never imports from `rendering/`.** The rule layer takes state and
a shot outcome and returns a decision; the caller carries it out. That is why
28 rule tests run with no renderer, no Rapier, and no DOM — and it is the thing
that keeps online multiplayer possible later, because the rules can be driven
from a serialized command rather than from a mouse.

`ShotCommand { origin, direction, power }` is the seam. A human drag, the AI's
planner, and a future network peer all produce that same struct, and the rule
layer cannot tell them apart. This is also why the spec's "AI must not cheat"
requirement is structural rather than a promise: the AI has no other way in.

### Determinism

Physics runs on a fixed 60 Hz accumulator with a 5-step catch-up ceiling, so a
shot resolves identically at 30 and 144 FPS. Friction is applied by hand as
Coulomb deceleration rather than by the solver, because pieces are plane-locked
and never touch a floor collider — and because Coulomb friction stops a coin in
*finite* time, which is what makes "all pieces at rest" a fact rather than an
arbitrary threshold.

---

## 4. Remaining phase plan

| Phase | Deliverable | Key risk |
| --- | --- | --- |
| **9** Four-player | 4 seats, team ownership, 4 panels | Input fairness across seats (§5) |
| **10** AI | `AIPlayer`, `ShotPlanner`, `ShotScorer`, `AIDifficulty` | Search cost vs. shot quality |
| **11** Cinematic camera | `CinematicCameraManager`, 6 camera states | Coupling to physics (§6) |
| **12** Effects | Impact particles, pocket burst, slow motion | Slow-mo must not touch the timestep (§6) |
| **13** UI polish | Main menu, pause, victory, settings | — |
| **14** Mobile | Touch tuning on real hardware, Rapier chunk | Untested on a real phone |
| **15** Testing | Integration play-through, tuning | — |

---

## 5. Four-player input orientation — challenges

The spec's instruction not to rotate the browser UI is correct, and
`core/PlayerSide.ts` already implements the world-coordinate alternative. The
remaining problems are subtler.

### 5.1 Power is unfair between seats — the real one

The pointer is ray-cast onto the board plane, and the camera is tilted ~55°.
That tilt **foreshortens the Z axis on screen**: a drag of 100 screen pixels
toward the bottom of the display covers noticeably more board distance than 100
pixels sideways.

Power is currently derived from board-space pull length. So the same finger
travel yields *different power depending on which edge you sit at*. Bottom and
top players (dragging along the foreshortened axis) reach maximum power with
less screen movement than left and right players. In a four-player match that
is a genuine fairness bug, not a cosmetic one.

**Options:** derive power from screen-space drag normalised by viewport size
(fair by construction, but decouples the aim line from the pull); or scale the
board-space pull per axis by the camera's foreshortening factor (keeps the
visual coupling, needs the factor recomputed on resize). Leaning toward the
second, measured rather than assumed — it must be verified by dragging equal
screen distances from all four seats and comparing resulting impulse.

### 5.2 Left and right panels collide with the board

Panels currently anchor to viewport corners. That works for two seats. In
portrait on a phone the board fills the full width, so mid-height left/right
panels would sit **on top of the playing surface** — exactly what the spec
forbids. Needs either compact edge-hugging panels for 4P portrait, or panels
projected against the board's actual on-screen bounds.

### 5.3 Ownership becomes per-team, not per-player

There are two coin colours and four players, so standard four-player Carrom is
**partners**: Bottom+Top against Left+Right, sharing a colour and a score.
`RuleEngine` currently assigns colour to a `PlayerSlot`. Team ownership means
`assignColors` and every `coinsPocketed` read need a team indirection, and
victory is a team condition. This touches the tested rule layer, so it should
land with tests extended first.

### 5.4 Turn order must be seating order

`CLOCKWISE_ORDER` exists for this: play must pass to the person physically
beside you, and with partners that also means opponents alternate correctly.

### 5.5 Solved already

Baseline geometry per edge, striker clamping on the correct axis, the striker
auto-moving to the active seat's baseline, and rejecting shots aimed backwards
off your own edge — all implemented and measured in Phase 8.

---

## 6. Cinematic camera during physics — challenges

### 6.1 Slow motion must not change the timestep

The most dangerous item in the whole revised spec. The obvious implementation
scales `world.timestep` or the fixed delta. **That changes collision
resolution**: the solver sees different-sized steps, contacts resolve
differently, and the same shot produces a different result depending on whether
a cinematic happened to trigger. It would also destroy the determinism that
future networked play depends on.

**Correct approach:** keep the 60 Hz fixed step exactly as it is and scale only
how much *real* time is fed into the accumulator. The simulation advances
through identical steps; there are simply fewer of them per wall-clock second.
`GameLoop` already isolates this — the scale belongs on the accumulator input,
nowhere else.

### 6.2 Camera easing must be frame-rate independent

The camera updates in `render()`, which is variable-rate. A fixed per-frame
`lerp(current, target, 0.1)` converges twice as fast at 120 FPS as at 60. Every
cinematic transition must use exponential damping against real delta —
`1 - Math.exp(-rate * dt)` — or the shot camera will feel different on every
device, which is precisely the kind of inconsistency the fixed-step physics was
built to avoid.

### 6.3 Two owners fighting over `camera.position`

`CameraManager` currently computes and *sets* camera position from the frustum
fit. A `CinematicCameraManager` that also writes position will fight it on
every resize, and the bug shows up as a camera that snaps back mid-shot.

Ownership must be explicit: the cinematic layer produces an **offset and a
look-at target**, and `CameraManager` remains the only thing that writes
`camera.position`, applying the offset on top of its computed framing. Camera
shake composes the same way — as an offset, never as a replacement — so it can
never break the "entire board visible" guarantee.

### 6.4 Following a fast striker without lag-then-snap

At full power the striker moves ~0.3 units per step. A camera chasing it with
constant damping lags visibly, then snaps when the striker decelerates. A
look-ahead point (position + velocity × time) tracks far better, and it is
already available from the rigid body.

### 6.5 Deciding what to follow, mid-step

"Follow the most important action" needs a heuristic, and it must be fed by
collision events that arrive *inside* a fixed step, while the camera updates at
render time with an interpolation alpha. Reading physics state directly from
the camera would sample a different sub-step each frame and jitter. The events
should be captured into a small "cinematic intent" object during the fixed
update and only *consumed* at render time.

### 6.6 Timing budget versus rest detection

The spec caps `SHOT_FOLLOW` at 1 s and slow motion at 0.7 s. Rest detection
already takes ~1.7 s for a full-power shot; slow motion stretches that in real
time. The cinematic must therefore be able to finish and return to the gameplay
camera *while the board is still settling*, rather than being tied to settle.

### 6.7 Comfort

`prefers-reduced-motion` must disable shake and shorten follows. And per the
spec's own warning, the default intensities should be tuned low — a camera that
moves on every one of ~40 shots per match becomes exhausting long before it
becomes impressive.

---

## 7. Phase 1 verification

Every Phase 1 requirement is present and green. Nothing was rebuilt — under
binding rule 3, replacing working, tested code would be a regression.

| Requirement | Status |
| --- | --- |
| Initialize Vite + TypeScript | ✅ `vite.config.ts`, strict `tsconfig.json` |
| Install Three.js | ✅ 0.185.1 |
| Install Rapier | ✅ 0.20.0, WASM init verified |
| Complete folder architecture | ✅ all 16 folders, incl. new `camera/`, `effects/` |
| `Game.ts` | ✅ 363 lines — subsystem wiring, lifecycle |
| `Renderer.ts` | ✅ quality tiers, DPR clamp, tone mapping |
| `SceneManager.ts` | ✅ scene graph + recursive GPU disposal |
| `CameraManager.ts` | ✅ exact frustum fit, aspect-driven elevation |
| Responsive canvas | ✅ `ResizeObserver`, verified on 5 viewports |
| Render loop | ✅ `GameLoop.ts`, fixed 60 Hz + interpolation |
| Basic lighting | ✅ key / fill / hemisphere, fitted shadow camera |
| Test scene | ✅ superseded — a full board with 20 pieces renders |
| `npm run build` | ✅ typecheck + 28 tests + build, no errors |
