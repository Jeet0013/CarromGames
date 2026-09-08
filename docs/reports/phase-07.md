# Phase 7 — Complete Game Rules ✅

The full Classic Carrom ruleset, a configurable `RuleSet`, player-facing
notifications, and 28 automated validation tests.

## 1. Files created

| File | Purpose |
| --- | --- |
| `src/gameplay/RuleSet.ts` | Configurable rulesets; `CLASSIC_CASUAL` default |
| `src/gameplay/RuleEngine.ts` | The rulebook — pure decision function |
| `src/gameplay/FoulManager.ts` | Foul detection and penalties |
| `src/gameplay/QueenManager.ts` | Queen state machine and cover logic |
| `src/gameplay/ShotEvaluator.ts` | Shot log → rule-shaped outcome |
| `src/gameplay/Placement.ts` | Nearest free spot for a returned piece |
| `src/core/GameState.ts` | Authoritative, serializable match state |
| `src/ui/Notifications.ts` | Toasts + sticky obligation banner |
| `src/gameplay/RuleEngine.test.ts` | 28 validation tests |

## 2. Files modified

`src/gameplay/TurnManager.ts` (rewritten to drive the rule chain),
`src/gameplay/PocketManager.ts` (drop-animation fix), `src/pieces/Piece.ts`
(crash fix), `src/core/Game.ts`, `src/core/EventBus.ts`, `package.json`
(Vitest; `build` now runs tests).

## 3. What works

### The engine is pure, and that is the point

`RuleEngine.evaluate()` takes state plus outcome and **returns** a decision —
it changes nothing. `TurnManager` carries the decision out. That split is why
every rule in the game is testable with no renderer, no Rapier, and no DOM, and
it is the payoff for keeping `gameplay/` free of engine imports since Phase 1.

Resolution order is deliberate: ownership → Queen → fouls → continuation →
victory. Ownership must come first because a coin cannot be "yours" before
colours exist; victory must come last because an uncovered Queen blocks it.

### Configurable rulesets

Carrom has no single rulebook. `RuleSet` encodes the variable parts as flags,
so a variant is a data entry rather than a rewrite. `CLASSIC_TOURNAMENT` ships
alongside the default purely to prove the abstraction earns its place — it
differs only in refusing a same-shot Queen cover, and a test pins that
difference.

### Validation — 28 tests, all passing

Covering turns and the break, colour assignment (including a mixed first shot
crediting both players), continuation, misses, opponent coins, striker fouls,
foul debt when the player has nothing to give, no-contact fouls, the entire
Queen lifecycle, victory, and every required notification.

**The suite was mutation-tested.** Removing the rule that a foul overrides turn
continuation caused exactly 2 tests to fail; restoring it returned all 28 to
green. The tests have teeth rather than merely executing the code.

### Two real bugs found

**A hard crash.** `Piece.position` read a rigid body that `pocket()` had
removed from the world. Rapier does not return null for that — it traps inside
WebAssembly with `unreachable` and kills the frame. Any code surveying all
pieces (placement search, AI board scan, debug tooling) would have had to
remember to filter first, and forgetting once was fatal. A pocketed piece now
reports its last live position.

**Pieces vanishing after being legitimately returned.** The drop animation held
only a mesh, and ran for 0.42 s. But the rules act the instant the board
settles — well inside that window — so a Queen returning to the centre or a
coin handed back by a foul would have its animation finish *after* the return
and hide it, leaving an invisible piece still physically on the board. The
animation now holds the piece and cancels itself the moment it is active again.

Confirmed live: after a Queen return, `pocketed: false`, `visible: true`,
`scale: 1`, resting at (−2.42, −2.42) — on the board and drawn.

## 4. Known limitations

- **The rules are proven by the unit suite, not by full live play.** The 28
  tests are deterministic and cover every scenario in the spec. The in-browser
  checks confirm no crashes, correct restoration, and correct visibility — but
  my scripted shots could not reliably pot a coin through the real striker, so
  end-to-end rule sequences were not exercised by hand in the browser. That is
  a gap in *integration* confidence, not in rule correctness.
- **`Notifications` is provisional.** It satisfies the required messages now;
  the real HUD arrives in the UI phase.
- **Deferred foul debt is recorded but never collected.** `penaltyDebt`
  increments when a player fouls with nothing banked; nothing yet deducts it
  from their next pocket.
- **No break-shot special handling.** `isBreakShot` is tracked and cleared, but
  no rule currently varies on it.
- **Local pass-and-play is not surfaced.** `switchPlayer()` exists and turns
  alternate correctly; there is no UI telling two humans to swap.

## 5. Recommended next phase

**Phase 8 — AI.** The gate you set is met: the rules work and are tested. The
AI can now be built against the same `RuleEngine`, and — as specified — must
drive the same striker through the same physics rather than fake outcomes.
