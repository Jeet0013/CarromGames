# Phase 3 — Physics ✅

Rapier integrated with the board. Static rails, plane-locked dynamic discs,
friction, restitution, damping, rest detection, and a collider debug overlay.

## 1. Files created

| File | Purpose |
| --- | --- |
| `src/physics/PhysicsWorld.ts` | Rapier world, rails, bodies, friction, rest detection |
| `src/physics/CollisionSystem.ts` | Contact events → attributed game events |
| `src/physics/PhysicsDebugRenderer.ts` | Collider/sensor line overlay (dev-only) |
| `src/physics/PhysicsTestScene.ts` | Validation harness (removed in Phase 4) |

## 2. Files modified

`src/physics/PhysicsConfig.ts` (retuned, see below), `src/core/Game.ts`
(steps physics on the fixed timestep), `src/core/EventBus.ts`
(`physics:contact`).

## 3. What works

### Two decisions that shape everything after

**Pieces are locked to the play plane.** Y translation and X/Z rotation are
disabled, leaving slide-X, slide-Z, spin-Y. That is exactly what a Carrom coin
does, and it removes an entire class of failure — coins riding up over each
other, tipping onto edge, jittering against a floor collider. World gravity is
consequently zero.

**Friction is applied by hand, not by the solver.** With no floor contact there
is nothing for Rapier to apply surface friction at, so each step applies a
Coulomb deceleration `μ·g` opposing motion, clamped to the body's momentum so
it can reach zero but never reverse. This is also the more faithful model:
Coulomb friction stops a coin in *finite* time, whereas exponential damping —
the usual shortcut — only approaches zero asymptotically, so coins creep
forever and "all pieces at rest" degenerates into an arbitrary cutoff. Every
turn transition depends on that being a fact.

### Retuned constants

`MAX_STRIKE_FORCE` was 0.85 from Phase 1 — an untested guess. Against the
striker's 0.015 kg mass that is **57 u/s**, which passes through a 0.65-unit
rail in a single 60 Hz step. Now 0.27, giving ~18 u/s. `MAX_VELOCITY` (22) caps
it, well under the ~39 u/s tunnelling threshold.

### Measured results

Fired at full power into a five-disc cluster:

| Time | At rest | Max speed | Moving |
| --- | --- | --- | --- |
| 0 ms | true | 0.000 | 0/6 |
| 100 ms | false | 16.422 | 1/6 |
| 300 ms | false | 15.381 | 2/6 |
| 600 ms | false | 3.657 | 1/6 |
| 1000 ms | false | 0.000 | 0/6 |
| 1500 ms | **true** | 0.000 | 0/6 |

- **Collide** ✅ — the struck disc moved from (0, 0) to (0.215, −3.147); the
  heavier shooter carried on through, as mass ratio requires.
- **Slow naturally** ✅ — 16.42 at 100 ms decays to rest. The 100 ms reading
  matches the friction model's prediction (18 − 13.7×0.1 = 16.6) to 1%.
- **Come to rest** ✅ — genuine zero, confirmed at 1745 ms.

**Bounce** needed a second test: the cluster shot spends its energy on impact
and never reaches a rail, so restitution was initially unverified. A clear-lane
shot at the far rail gave:

- Deepest point **z = −3.477**, exactly the predicted contact (rail inner face
  −3.683 + striker radius 0.206). The collider layout matches `BoardConfig` to
  three decimals.
- Rebounded **0.982 units**; restitution 0.45 predicts 1.02. Within 4%.

### Also working

- Four static rails, overlapped at the corners so nothing escapes the seam.
- `CollisionSystem` attributes contacts to piece ids with an impact speed, so
  audio can scale hits. Contacts under 0.25 u/s are filtered — resting pieces
  touch constantly and would otherwise flood the bus every step.
- Collider overlay on `C`, skipping its rebuild entirely while hidden.

## 4. Known limitations

- **No pocket sensors yet** — Phase 6.
- **Rapier's own sleeping is disabled** deliberately: a slept body reports zero
  velocity and would disagree with our rest detection. Costs some idle CPU that
  a later pass could reclaim.
- **Restitution and friction are validated as self-consistent, not as
  *feeling* right.** They match their configured values; whether 0.45 is the
  right bounce for Carrom is a judgement call best made once shots are played
  by hand.
- **The 12 s settle timeout has never fired** in testing. It is a backstop, so
  that is the intent, but it is therefore untested in anger.

## 5. Recommended next phase

**Phase 4 — Coins and striker.**
