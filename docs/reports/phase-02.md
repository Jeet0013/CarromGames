# Phase 2 — Carrom Board ✅

The complete board: playing surface, raised rails, corner pockets, regulation
markings, realistic materials, and shadows. Presentation only — no physics.

## 1. Files created

| File | Purpose |
| --- | --- |
| `src/board/CarromBoard.ts` | Assembles surface, rails, pockets, and table |
| `src/board/BoardTexture.ts` | Procedural wood and markings textures |
| `src/board/Pockets.ts` | Pocket cavities with brass rims |
| `src/rendering/DebugCameraTuner.ts` | Dev-only live camera adjustment |

## 2. Files modified

| File | Change |
| --- | --- |
| `src/core/Game.ts` | Builds the board, mounts the dev tuner, disposes both |
| `src/board/BoardConfig.ts` | Base circle 4.45 cm → 3.18 cm (see below) |
| `src/rendering/CameraManager.ts` | Aspect-driven elevation, `resetAngles()` |
| `docs/PHASES.md`, `README.md` | Status |

## 3. What works

Verified in Chrome at five viewports: **60 FPS everywhere, zero console
errors**, board fully visible on all of them.

- **Playing surface** with four corner pockets cut as *real geometry*, not dark
  paint — so a coin dropping through in a later phase passes through an actual
  opening.
- **Rails** built as one bevelled extrusion with a square hole rather than four
  boxes, so the corners meet exactly with no seams to catch light.
- **Regulation markings** — centre circles with the eight-spoke sun motif, four
  baselines with red base circles, corner arrows — all drawn from
  `BOARD_CONFIG`. The painted baseline and the line the striker will actually
  be clamped to are the same numbers, so they cannot drift apart.
- **Procedural textures.** No image assets: the surface and rails are generated
  into canvases at load. A 2K board PNG would be ~1.5 MB; this costs a few
  milliseconds. Resolution follows the quality tier.
- **Materials** — `MeshPhysicalMaterial` with clearcoat for the varnish sheen,
  dropping to `MeshStandardMaterial` on the LOW tier where the second specular
  lobe is not worth the shading cost.
- **Shadows** — the board casts onto a table plane beneath it, which is what
  grounds it rather than leaving it floating on the background.
- **Dev camera tuner** (`` ` `` to toggle) for live elevation/azimuth/margin
  adjustment, with `P` printing values to paste back into `CAMERA_SETTINGS`.
  Constructed inside the `IS_DEV` guard so it is tree-shaken from production.

### Visual issues found by rendering and then fixed

The first render was recognisable but not premium. Four real problems:

1. **Rails read as moulded plastic** — they were a flat colour while the
   surface was textured. They now have their own coarser, darker grain.
2. **Base circles merged into figure-8s** near each corner. `BoardConfig` had
   taken the 4.45 cm pocket diameter for them; the actual red circles are
   3.18 cm. At pocket size, circles from two adjacent baselines overlapped,
   because their centres are only ~4.2 cm apart.
3. **Grain looked like corduroy.** The first pass sampled noise per scanline,
   so every row got ink and the eye read the regular spacing instead of wood.
   Streaks are now placed at noise-driven intervals with individual widths and
   a slight wander, and the decorative knots — which read as smudges — are gone.
4. **Pockets looked painted on.** The brass rim was a tube 7% of the pocket
   radius, under a pixel at this scale. At 16% it catches the key light and
   gives the eye the highlight it needs to read depth.

### Portrait framing

Portrait initially fit the whole board but left it filling barely a third of
the screen. The frustum fit was correct — at 55° the board projects as a
shallow, foreshortened trapezoid that fits a narrow viewport easily across and
leaves the tall axis empty.

The fix is angular, not distance-based: **elevation now follows aspect ratio**,
smoothstepping from 55° in landscape to 74° in portrait. The more top-down view
un-foreshortens the board so it fills the narrow axis. It deliberately stops
short of 90°, because some tilt is what makes the rails read as having height.

The result fills the width and centres vertically, leaving symmetric space top
and bottom — which is exactly where the scope puts the HUD.

## 4. Known limitations

- **No physics.** The rails have no colliders and the pockets no sensors; both
  arrive in Phase 3 reading the same `BoardConfig` values.
- **Frame grain stretches slightly on the left and right rails.** The planar
  XZ projection runs the grain in one direction across the whole frame, so
  rails perpendicular to it show it stretched. Visible only on close
  inspection; a per-rail projection would fix it if it ever matters.
- **Two red circles sit close together at each corner.** This is authentic —
  each baseline ends in its own circle and adjacent baselines meet near the
  corners — but worth confirming against your preferred board style.
- **Board theming is not parameterised.** Career mode calls for per-level board
  themes; the palettes are currently constants in `BoardTexture.ts`. They
  should become data when Phase 11 lands.
- **Verified in desktop Chrome at emulated viewport sizes**, not on physical
  phone hardware. The dev server binds to the LAN, so a real device test is
  available whenever wanted.

## 5. Recommended next phase

**Phase 3 — Physics.**

`physics/PhysicsWorld.ts` wrapping Rapier and stepping on the `GameLoop`'s
existing fixed timestep, static colliders for the four rails, pocket sensors at
`POCKET_POSITIONS`, and rest detection across all bodies — the gate every later
turn transition depends on.

Worth doing before pieces exist: rest detection and the collider layout can be
validated against the board alone, and `PHYSICS_CONFIG`'s friction and
restitution values are currently untested guesses that Phase 4's coins will
immediately depend on.
