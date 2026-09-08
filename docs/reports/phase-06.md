# Phase 6 — Pocket Detection ✅

Four pockets detect, classify, remove, log, and animate — including several
pieces in a single shot.

## 1. Files created

`src/gameplay/PocketManager.ts` — detection, the shot event log, and the drop
animation.

## 2. Files modified

`src/core/Game.ts` — detection runs each fixed step, before the turn machine,
and clears on reset.

## 3. What works

### Detection is swept, not an overlap test

The obvious implementation asks each step whether a piece is *inside* a pocket.
**At this scale that misses pockets.** A piece can travel `MAX_VELOCITY / 60` ≈
0.37 units in one fixed step while a pocket is only ~0.20 units across, so a
fast coin is on one side at step N and past it at step N+1 — never sampled
inside. Rapier's own sensors have the same blind spot, for the same reason.

`PocketManager` instead tests the *segment* each piece travelled against each
pocket centre (point-to-segment distance, clamped to the segment). A piece that
passed over a pocket is caught however fast it was moving. Cost is four
distance tests per piece per step — about 80 total, negligible.

### Measured verification

| Case | Result |
| --- | --- |
| Coin into a pocket | pocketed, `COIN_POCKETED` logged with `pocketIndex: 0`, bodies 20 → **19** |
| **Fast coin** (~0.37 u/step, over a 0.20 pocket) | **caught** — this is the case an overlap test misses |
| **Three coins, one shot** | all three logged separately, bodies 20 → **17** |
| Queen | classified **`QUEEN_POCKETED`**, distinct from a coin |
| Striker | classified **`STRIKER_POCKETED`** |
| Near miss at 0.424 units | **not** pocketed |
| After `resetBoard()` | 20 bodies, 0 pocketed, 0 hidden, Queen back at (0, 0) |

### Shot event log

Per-shot, ordered, timestamped from the shot's start:

```
SHOT_STARTED → COIN_POCKETED → COIN_POCKETED → … → PHYSICS_SETTLED
```

Each pocket entry carries `pieceId`, `kind`, and `pocketIndex`.
`pocketedThisShot` filters to just the pockets, which is what the rule engine
will consume. The log is rebuilt per shot, so it never grows unbounded.

Detection deliberately runs **before** the turn machine in the same fixed step:
a piece pocketed on this step must be logged before that step can declare the
shot settled.

### Visual feedback

A pocketed piece drops into the cavity over 0.42 s with an ease-in curve —
coins accelerate as they fall, they do not glide — shrinking to 55% before
hiding. The rigid body is removed at the moment of detection, so the animation
is purely visual and the piece stops participating in collisions and rest
detection immediately.

## 4. Known limitations

- **No rules applied.** Detection reports *what happened*; it does not decide
  what it means. Ownership, continue-on-own-coin, foul penalties, and Queen
  cover are Phase 7 — deliberately, as instructed.
- **`STRIKER_POCKETED` is logged, not penalised.** The foul is recorded and
  nothing acts on it yet.
- **A pocketed piece is not re-placed.** Carrom returns some pocketed pieces to
  the board (a due coin after a foul, an uncovered Queen). `Piece.reset()` can
  restore any piece, but nothing calls it outside `resetBoard()` yet.
- **The drop animation is not pooled.** One small object per pocketed piece,
  garbage-collected after; worth revisiting only if profiling flags it.
- **No pocket sound.** `pocket:scored` is emitted and unhandled until Phase 12.

## 5. Recommended next phase

**Phase 7 — Game rules.** Everything it needs now exists: an ordered, classified
shot log; a turn machine with the evaluation states already declared; and
`Piece.owner` waiting to be assigned from the first valid pocket.
