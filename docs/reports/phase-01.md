# Phase 1 — Project Setup + Scene Foundation ✅

Toolchain, strict TypeScript, module skeleton, config objects, and the full
rendering foundation: renderer, scene, camera, lighting, and a fixed-timestep
loop. No gameplay logic by design.

> The master spec listed "Three.js scene" as a separate phase; on the owner's
> direction it is folded into Phase 1. Later phases shift up by one.

## 1. Files created

### Toolchain
| File | Purpose |
| --- | --- |
| `package.json` | Scripts and pinned dependencies |
| `tsconfig.json` | Strict TypeScript, bundler resolution, `noEmit` |
| `vite.config.ts` | Dev server on LAN, ES2022 target, vendor chunk splitting |
| `.gitignore` | Standard Node/Vite/editor ignores |
| `index.html` | Shell + boot overlay; touch-action and overscroll locked |

### Source
| File | Purpose |
| --- | --- |
| `src/main.ts` | Entry point; boots Rapier, constructs and starts `Game` |
| `src/core/Game.ts` | Root orchestrator; owns subsystem lifetimes |
| `src/core/GameLoop.ts` | Fixed 60 Hz loop with interpolated rendering |
| `src/rendering/Renderer.ts` | WebGL renderer, quality tiers, pixel-ratio clamp |
| `src/rendering/SceneManager.ts` | Scene graph ownership and GPU disposal |
| `src/rendering/CameraManager.ts` | Isometric camera with exact frustum fit |
| `src/rendering/Lighting.ts` | Key/fill/hemisphere rig, fitted shadow camera |
| `src/core/types.ts` | Engine-free domain vocabulary |
| `src/core/EventBus.ts` | Typed pub/sub with unsubscribe handles |
| `src/config/GameConfig.ts` | Global config, quality presets, debug flags |
| `src/physics/PhysicsConfig.ts` | `PHYSICS_CONFIG` and force/drag mapping |
| `src/board/BoardConfig.ts` | Regulation board geometry, pockets, baselines |

### Docs
`docs/SCOPE.md`, `docs/PHASES.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md`,
`README.md`, this report.

Full `src/` skeleton created for all 14 modules, empty folders held by
`.gitkeep`.

## 2. Files modified

None — the repository was empty at the start of this phase.

## 3. What works

**Verified in a real browser (Chrome, five viewports), not assumed:**

| Viewport | Canvas buffer | WebGL | Boot overlay | Camera distance |
| --- | --- | --- | --- | --- |
| Desktop 1440×900 | 1440×900 | alive | cleared | y 10.83 / z 7.58 |
| Laptop 1280×800 | 1280×800 | alive | cleared | y 10.83 / z 7.58 |
| Tablet 1024×768 | 1024×768 | alive | cleared | y 10.83 / z 7.58 |
| Mobile landscape 844×390 | 844×390 | alive | cleared | y 10.83 / z 7.58 |
| Mobile portrait 390×844 | 390×844 | alive | cleared | y 27.68 / z 19.38 |

- Runs at **60 FPS** on every viewport (desktop measured 44 on the very first
  second — first-load shader compilation, 60 once warm).
- **The portrait number is the point.** The camera pulls back from 13.2 to 33.8
  units of distance on its own, because the frustum fit solves for the binding
  constraint per aspect ratio. Landscape viewports all share a distance because
  once the board is no longer horizontally constrained, vertical fit sets it —
  which is correct, not a bug.
- Console is clean. The one 404 seen during verification was the browser's
  automatic `favicon.ico` probe; a `favicon.svg` now ships and it is gone.
- `npm run build` passes: `tsc --noEmit` clean under strict mode plus
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`,
  and `verbatimModuleSyntax`. Builds in 227 ms; `three` splits to its own
  516 kB chunk (129 kB gzipped).
- **Rapier WASM genuinely runs.** Confirmed in Node: `RAPIER.init()` resolves,
  a coin-sized cylinder collider is created, and after 10 steps the body has
  fallen to y = −0.397 — the solver is integrating, not merely loaded.
- Resize, quality switching, pause/resume, visibility handling, and full
  disposal are all wired.

**Design decisions worth knowing:**

- **World units, not metres.** A regulation coin is 3 cm; at SI scale a
  0.015 m collider sits below Rapier's comfortable range, where default
  contact margins and sleep thresholds dominate and produce mushy collisions.
  Everything is scaled ×10 (`UNITS.PER_METRE`), putting the board at 7.4 units
  and coins at 0.30. Gravity is scaled identically. All dimensions still derive
  from real centimetre measurements via `cm()`, so they stay checkable against
  a physical board.
- **Exact frustum fit, not a bounding sphere.** The usual shortcut fits the
  board's bounding sphere, which circumscribes the diagonal and wastes a lot of
  screen on a square board — badly so in portrait. `CameraManager` instead
  projects the eight bounding-box corners into camera space and solves
  `D ≥ qz + |qx|/tanH` and `D ≥ qz + |qy|/tanV` for each, taking the maximum.
  That is why portrait framing is tight rather than marooned in the middle.
- **Fixed 60 Hz timestep** with a 5-step catch-up ceiling. Without the ceiling,
  returning from a backgrounded tab hands the loop seconds of owed time and it
  spirals into a lock-up; dropping the excess loses time but keeps the game
  responsive.
- **`ShotCommand` is serializable** — human input, AI, and a future network
  peer all produce the same struct, and the rule layer cannot tell them apart.
  This is the concrete thing that keeps online multiplayer viable later.
- **Debug flags are behind `import.meta.env.DEV`**, which Vite statically
  replaces, so debug branches are dropped from production bundles entirely.
- **One shadow-casting light.** A second would double shadow-map cost for a
  barely visible second contact shadow; the fill light is deliberately
  shadow-free.

## 4. Known limitations

- **The scene is empty.** Correct for this phase — the screenshot is a cleanly
  cleared frame at the right size on every viewport, with the board arriving in
  Phase 2. Lighting is therefore configured but not yet visually judgeable.
- **Rapier chunk is 2.85 MB** (1.09 MB gzipped). The `-compat` build inlines
  its WASM as base64, which is what makes it work under Vite with no plugin.
  Acceptable now; revisit in Phase 13 — switching to the non-compat build with
  a WASM plugin would cut this substantially.
- **Physics values are informed starting points, not tuned.** Masses and
  dimensions come from regulation pieces so relative momentum transfer is
  right, but friction, restitution, and damping need hand-tuning against real
  coins in Phases 3–4.
- **`GameState.ts` not yet written.** It would hold only rule state, and
  writing it now would mean inventing placeholder gameplay. It lands with the
  rule engine in Phase 7.
- **Verification ran in desktop Chrome at emulated viewport sizes**, not on
  physical phone hardware. The dev server binds to the LAN (`host: true`) so a
  real device test is available whenever wanted.

## 5. Recommended next phase

**Phase 2 — Carrom board.**

`board/CarromBoard.ts` building the playing surface, raised rails with rounded
edges, four corner pockets, centre circle, baselines, base circles, and
decorative markings on the geometry already defined in `BoardConfig`, plus
realistic materials and a dev camera tuner.

The empty stage is the right moment for it: framing, lighting, and shadow
fitting are all in place and tested, so the board arrives into a scene that is
already correct.
