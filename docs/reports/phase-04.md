# Phase 4 — Game Pieces ✅

All 20 pieces, the standard opening arrangement, and a verified `resetBoard()`.

## 1. Files created

| File | Purpose |
| --- | --- |
| `src/pieces/Piece.ts` | Base piece: id, kind, owner, mesh, body, active, pocketed |
| `src/pieces/Coin.ts` | White/black coin |
| `src/pieces/Queen.ts` | Red Queen |
| `src/pieces/Striker.ts` | Striker — heavier, CCD-enabled |
| `src/pieces/PieceFactory.ts` | Creation, shared resources, layout, reset |

## 2. Files modified

`src/core/Game.ts` (pieces replace the physics harness),
`src/board/CarromBoard.ts` (**geometry alignment bug**, below).
`src/physics/PhysicsTestScene.ts` deleted — it existed to validate Phase 3 and
real pieces supersede it.

## 3. What works

Every piece carries the required state: `id`, `kind`, `owner`, `mesh`,
`handle` (body + collider), `active`, `pocketed`. `owner` stays **null** until
the rule layer assigns colours from the first valid pocket, because that is
when Carrom actually decides who plays which side.

### Measured verification

| Check | Result |
| --- | --- |
| Piece counts | 9 white, 9 black, 1 Queen, 1 striker — **20** |
| Queen position | exactly **(0, 0)** |
| Closest coin pair | **0.311** vs 0.302 diameter — no overlap |
| Drift over 1.5 s idle | **0.00000** |
| Displacement after a shot | 5.92 units |
| Bodies after pocketing | 20 → **19** |
| Bodies after reset | 19 → **20**, pocketed coin active again |
| Reset position error | **0.00000** across all 20 |

The zero drift matters: it proves the opening arrangement is not secretly
overlapping. Rings sit at 2.06·r and 4.2·r rather than the geometric minimums
of 2·r and 3.86·r, because starting coins in exact contact makes the solver's
first step shove the whole cluster apart before anyone has played.

### Shared resources

Three geometries and four materials serve all 20 pieces. Coins use a
`LatheGeometry` with a rounded rim — a plain cylinder's hard 90° edge catches
the key light as a bright wire along the silhouette and reads as cheap.

`resetBoard()` reuses the existing pieces rather than rebuilding, so anything
holding a reference across a reset stays valid.

### A Phase 2 bug this phase exposed

Placing pieces revealed that the play surface was in the wrong place. In Phase
2 I wrote `geometry.translate(0, 0, 0)` — a no-op — while claiming the top face
sat at y = 0. `ExtrudeGeometry` actually spans 0…depth, so the surface occupied
y ∈ [0, 0.12] and its top was at 0.12. Two consequences:

1. Coins sit at y = 0.0375 and were **buried inside the board** — invisible.
2. The rails, aligned to the same wrong plane, **never rose above the playing
   surface** at all. That was on screen throughout Phase 2 and I did not catch
   it; the board simply looked flat and I read it as correct.

Fixed by measuring rather than assuming: `alignTop()` and `alignBottom()`
compute the bounding box and translate from it, so bevels and extrusion
conventions cannot silently misplace a mesh again.

## 4. Known limitations

- **The arrangement is the ring form, not the traditional "Y".** Queen centred,
  six alternating around her, twelve alternating outside — 9 and 9, which is
  what most digital Carrom uses. Some tournament conventions arrange the blacks
  into a Y; that would be a change to `buildOpeningLayout()` alone.
- **`owner` is never assigned yet** — nothing sets it until Phase 7.
- **Pieces cannot yet be pocketed by play**, only by calling `pocket()`
  directly. Sensors arrive in Phase 6.
- **The striker's home is Player One's baseline centre**; per-player placement
  arrives with the turn system.

## 5. Recommended next phase

**Phase 5 — Player controls.**
