# Phase 8 — Two-Player Mode ✅

Two humans on one device, with seat-aware striker placement, per-seat aiming,
and player panels at the board edges.

## 1. Files created

| File | Purpose |
| --- | --- |
| `src/core/PlayerSide.ts` | Seat geometry: baselines, clamping, shot direction |
| `src/ui/PlayerPanel.ts` | Avatar, name, score, coins, turn indicator |
| `src/ui/GameHUD.ts` | Owns panels; syncs from match state |

## 2. Files modified

`src/core/GameState.ts` (seats, mode, `seatOrder`, `nextSeat`),
`src/gameplay/TurnManager.ts` (`configureSeats`, `currentSide`, seat-aware
striker reset), `src/gameplay/RuleEngine.ts` (turn passing follows `seatOrder`),
`src/input/InputManager.ts` (per-side baseline, forward-shot guard),
`src/core/Game.ts` (`setMode`, seat layouts, HUD).

## 3. Features working

**Seats are data, not branches.** A mode names which edges are occupied and in
what order; turn passing, striker placement, and the HUD all read that. Adding
four-player is a layout entry rather than new logic — the groundwork is already
in place and tested.

**Aiming needs no rotation.** The scope is explicit that the browser UI must not
spin, and it does not need to: the drag already reads correctly from any edge,
because pulling back toward yourself always sends the striker toward the centre.
What actually differs per seat is which axis the striker slides along, and that
is all `PlayerSide` encodes. A new guard rejects a shot aimed backwards off the
player's own edge.

### Measured

| Check | Result |
| --- | --- |
| Seats | P1 = BOTTOM, P2 = TOP; order `[P1, P2]` |
| Striker at start | (0, **+2.508**) — bottom baseline |
| After switch | side **TOP**, striker (0, **−2.508**) |
| Panels rendered | **2**, correct names and status |
| Active highlight | `[1, 0.72]` → `[0.72, 1]` after the switch |
| Console | clean |
| Rule tests | 28 passing |

### Two bugs found and fixed

- **Illegal transition logged.** `setMode` resets straight into
  `STRIKER_POSITIONING`, so `start()` then transitioned to the state it was
  already in. `start()` is now idempotent.
- **Both panels looked active on load.** `#active` was seeded to `false`, so an
  initial inactive state matched the cache and the dimmed styling never
  applied. It now starts undefined, forcing the first paint.

## 4. Known issues

- **No main menu yet**, so the mode is set in code and two-player local is the
  default. `game.setMode()` works; the menu is Phase 13.
- **Panels are anchored to viewport corners, not projected board edges.** Fine
  for two seats; the left/right panels for four-player will need checking
  against the board's actual on-screen bounds.
- **Names and avatars are placeholders** (`P1`/`P2` monograms). No profile
  system until later.
- **No pass-the-device prompt.** Turns alternate and the active panel lights up,
  but nothing explicitly tells two humans to swap.
- **Verified with scripted events, not two people playing.** Baseline switching
  and panel state are measured; the feel of handing a phone back and forth is not.

## 5. Next recommended phase

**Phase 9 — Four-player mode.** `PlayerSide` already carries LEFT and RIGHT
geometry and `CLOCKWISE_ORDER`; the work is a four-seat layout, two more panels,
and confirming the left/right panels clear the board on a phone.
