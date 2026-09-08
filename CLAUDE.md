# Carrom Arena 3D

A production-quality browser-based 3D Carrom game. TypeScript + Vite +
Three.js + Rapier.

## Read these first

| Document | Purpose |
| --- | --- |
| [docs/SCOPE.md](docs/SCOPE.md) | **Source of truth.** Full specification — rules, systems, modes, AI, UI, performance targets |
| [docs/PHASES.md](docs/PHASES.md) | 15-phase build order and live progress tracker |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module boundaries, dependency direction, multiplayer readiness |
| [docs/reports/](docs/reports/) | End-of-phase reports |

Before starting work, check `docs/PHASES.md` for the current phase.

## Commands

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc typecheck + production build
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
```

## Binding development rules

These come from the project owner and are not optional:

1. **One phase at a time.** Do not implement ahead of the current phase.
2. After each phase: run the app, fix all TypeScript errors, fix runtime
   errors, verify gameplay. **Do not proceed until the phase works.**
3. **Never replace working functionality unnecessarily.**
4. **No placeholder gameplay logic** where real implementation is possible.
5. Keep code modular — no giant files, one responsibility per module.
6. Prioritize core gameplay over extra features.
7. Online multiplayer is **out of scope** until core gameplay is complete and
   stable. Architect for it; do not build it.

## End-of-phase report

Every completed phase gets a report in `docs/reports/phase-NN.md` covering:
files created, files modified, what works, known limitations, recommended next
phase. Update the status table in `docs/PHASES.md` in the same commit.

## Architecture invariants

- `gameplay/` must never import from `rendering/` — the rules have to be
  driveable headlessly, which is what keeps future online multiplayer possible.
- Systems communicate through `core/EventBus.ts`, not direct references.
- Tunables belong in `config/`, `physics/PhysicsConfig.ts`,
  `board/BoardConfig.ts`, or `levels/LevelData.ts` — never inline literals.
- The AI drives the same striker API and the same physics as a human player.
  Do not fake AI shots.
