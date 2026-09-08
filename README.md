<h1 align="center">Carrom Arena 3D</h1>

<p align="center">
  A premium, physically believable 3D Carrom board game for the browser.
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white">
  <img alt="Three.js" src="https://img.shields.io/badge/Three.js-000000?logo=three.js&logoColor=white">
  <img alt="Rapier" src="https://img.shields.io/badge/Rapier-physics-8B5CF6">
</p>

---

## What this is

A complete, polished, playable 3D Carrom game — real physics, classic Carrom
rules, four game modes, a 30-level career, and four AI difficulty tiers. Built
modular so that online multiplayer and deeper mobile support can land later
without a rewrite.

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints.

```bash
npm run build      # typecheck + production build
npm run preview    # serve the production build
npm run typecheck  # types only, no emit
```

## Features

**Modes** — Quick Match vs AI · Practice · Local pass-and-play · Career

**Physics** — Rapier-driven sliding, momentum, collisions, energy loss, and
rest detection that gates turn completion

**Rules** — Classic Carrom: coin ownership, continue-on-own-coin, fouls, and
full Queen cover logic

**AI** — Four tiers from Easy to Expert. The AI plans and scores real shots and
fires them through the same striker and physics as a human — no faked outcomes

**Career** — 30 data-driven levels across six tiers, with star objectives and
`localStorage` progression

## Documentation

| Document | Purpose |
| --- | --- |
| [docs/SCOPE.md](docs/SCOPE.md) | Full specification — the source of truth |
| [docs/PHASES.md](docs/PHASES.md) | 15-phase build order and progress tracker |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module boundaries and dependency rules |
| [docs/reports/](docs/reports/) | End-of-phase reports |

## Project status

Built in 14 sequential phases; a phase ships only once it runs clean. Current
progress is tracked in [docs/PHASES.md](docs/PHASES.md).

> **Phase 6 — Pocket detection: complete.** The game is playable end to end:
> position the striker on the baseline, pull back to aim, release to shoot.
> Real Rapier physics, all 20 pieces, four working pockets with a shot event
> log. Phase 7 brings the rules that decide what a pocket means.

## Tech

TypeScript · Vite · Three.js · Rapier · modern ES modules. Minimal
dependencies by design.
