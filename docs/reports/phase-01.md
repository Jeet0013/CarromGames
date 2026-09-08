# Phase 1 — Project Setup ✅

Toolchain, strict TypeScript, module skeleton, and the foundational config
objects. No gameplay yet by design; Phase 2 draws the first scene.

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
| `src/main.ts` | Entry point; boots and verifies both engines |
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

**Verified, not assumed:**

- `npm run build` passes — `tsc --noEmit` clean under strict mode plus
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`,
  and `verbatimModuleSyntax`; Vite build succeeds in 165 ms.
- `npm run dev` serves on `:5173`; `/` and `/src/main.ts` both return 200 and
  TypeScript transforms correctly.
- **Rapier WASM genuinely runs.** Confirmed in Node: `RAPIER.init()` resolves,
  a coin-sized cylinder collider is created, and after 10 steps the body has
  fallen to y = −0.397 — the solver is integrating, not merely loaded.
- Three.js resolves and reports r185.

**Design decisions worth knowing:**

- **World units, not metres.** A regulation coin is 3 cm; at SI scale a
  0.015 m collider sits below Rapier's comfortable range, where default
  contact margins and sleep thresholds dominate and produce mushy collisions.
  Everything is scaled ×10 (`UNITS.PER_METRE`), putting the board at 7.4 units
  and coins at 0.30. Gravity is scaled identically. All dimensions still derive
  from real centimetre measurements via `cm()`, so they stay checkable against
  a physical board.
- **Fixed 60 Hz timestep** with a 5-step catch-up ceiling, so a shot resolves
  identically at 30 and 144 FPS and a backgrounded tab cannot spiral.
- **`ShotCommand` is serializable** — human input, AI, and a future network
  peer all produce the same struct, and the rule layer cannot tell them apart.
  This is the concrete thing that keeps online multiplayer viable later.
- **Debug flags are behind `import.meta.env.DEV`**, which Vite statically
  replaces, so debug branches are dropped from production bundles entirely.

## 4. Known limitations

- **No visuals yet.** The page shows a boot overlay reporting engine versions,
  nothing more. Phase 2's job.
- **Rapier chunk is 2.85 MB** (1.09 MB gzipped). The `-compat` build inlines
  its WASM as base64, which is what makes it work under Vite with no plugin.
  Acceptable now; revisit in Phase 14 — switching to the non-compat build with
  a WASM plugin would cut this substantially.
- **No separate `three` chunk yet.** `main.ts` imports only `REVISION`, so
  tree-shaking removes the rest. The chunk will appear in Phase 2.
- **Physics values are informed starting points, not tuned.** Masses and
  dimensions are taken from regulation pieces so relative momentum transfer is
  right, but friction, restitution, and damping need hand-tuning against real
  coins on the board in Phases 4–5.
- **Not yet opened in a real browser.** Verification was the dev server
  responding plus the Node WASM check. Worth one manual load before Phase 2.

## 5. Recommended next phase

**Phase 2 — Three.js scene.**

`rendering/Renderer.ts` (quality tiers, pixel-ratio clamp, resize),
`SceneManager.ts`, `CameraManager.ts` (slightly isometric perspective camera
that keeps the whole 7.4-unit board framed on every aspect ratio, portrait
included), `Lighting.ts` (ambient + directional with soft shadows), and
`core/GameLoop.ts` driving render on the fixed timestep already configured.

Phase 2 should end with an empty, correctly lit, correctly framed stage that
holds its framing from desktop widescreen down to mobile portrait — the
hardest camera constraint in the scope, and cheaper to solve now than after
the board exists.
