# Phase 5 — Player Controls ✅

Striker positioning, aiming, power, and shooting — with a turn state machine
that makes shooting mid-simulation impossible.

## 1. Files created

| File | Purpose |
| --- | --- |
| `src/gameplay/TurnManager.ts` | Turn state machine; the authority on what is legal now |
| `src/input/InputManager.ts` | Pointer pipeline, positioning, aiming, release |
| `src/input/AimSystem.ts` | Aim line, direction arrow, pull line, power meter |
| `src/input/ControlProfile.ts` | Per-device tolerances + primary-pointer detection |
| `src/input/DesktopControls.ts` | Mouse tolerances |
| `src/input/MobileControls.ts` | Touch tolerances |

## 2. Files modified

`src/core/Game.ts` — constructs the turn machine and input, ticks turns after
each physics step.

## 3. What works

### Control model

Two gestures, separated by **where the press lands** rather than by how it
moves — so a drag cannot be reinterpreted halfway through:

- **Press on the striker** → slide along the baseline. Releasing never fires.
- **Press elsewhere** → aim. The drag is a pull *back*; the shot travels away
  from the pointer, matching drawing a finger back and flicking.

Mouse, touch, and pen share one PointerEvent pipeline. Two parallel
implementations would drift apart, and what actually differs between devices is
tolerance, so that is data: a fingertip gets a 3.2× grab radius against the
mouse's 1.6×. The profile is chosen by `(pointer: coarse)`, not user-agent
sniffing — a touchscreen laptop still has a mouse as its primary pointer.

### Measured verification

| Check | Result |
| --- | --- |
| Drag striker to x = 3.4 | clamped to **2.0785** (limit 2.079) |
| Aiming state + power meter | `AIMING`, meter visible at **38.3%** |
| Release | `PHYSICS_SETTLING`, `acceptsInput: false`, striker at 7.03 u/s |
| **Second shot mid-flight** | **rejected** — striker decelerated 7.03 → 2.95 with no re-impulse |
| Settle | returns to `STRIKER_POSITIONING`, `acceptsInput: true` |
| Tap with no drag | **no shot** |

The turn machine declares legal transitions as data and logs an error on an
illegal one, rather than scattering guards through the code. `acceptsInput` is
the single gate every pointer event passes.

### A bug found by testing

The first accident guard measured the pull length — distance from the striker —
and treated anything beyond a threshold as deliberate. Testing showed a bare
tap 0.85 units from the striker firing a full shot at 3.5 u/s, because the tap
point was *already* far from the striker.

It now measures **travel**: how far the pointer actually moved between press
and release. A press with no drag is not a shot, wherever it lands. Power still
derives from pull length; only the intent test changed.

## 4. Known limitations

- **Illegal placement is prevented by clamping, not rejection.** Z is pinned to
  the baseline and X clamped, so an illegal position is unrepresentable. The
  striker cannot yet be blocked from a position *occupied by another piece*.
- **No predicted trajectory.** The scope lists it as optional; the aim line and
  arrow are in, ray-cast bounce prediction is not.
- **`ASSISTED_AIM` / `CLASSIC_AIM` is implemented but not yet reachable** — no
  settings UI until Phase 10. `AimSystem.setMode()` works.
- **The turn returns to the same player after settling.** Correct for this
  phase — evaluation, fouls, and switching are Phase 7.
- **Verified with synthetic pointer events in desktop Chrome.** Touch tolerances
  are reasoned, not yet felt on a real phone.

## 5. Recommended next phase

**Phase 6 — Pocket detection.**
