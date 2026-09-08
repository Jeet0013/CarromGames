# Carrom Arena 3D — Full Project Scope

> Canonical specification. This is the source of truth for what the game must
> become. Amendments go here first, then into code. Phase-by-phase execution
> order lives in [PHASES.md](./PHASES.md); module boundaries in
> [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Primary Goal

A visually premium, realistic, playable 3D Carrom board game that runs in the
browser. It should feel like a real physical Carrom board while keeping the
intuitive modern controls of popular mobile/browser Carrom games.

Production-quality, modular, maintainable, and architected so that multiplayer
and mobile support can be added later without rewrites.

**No single giant file.** Clean separation between: Rendering, Physics, Game
rules, Turn management, AI, UI, Input, Audio, Progression, Save data.

### Must support in the core version

1. Single-player versus AI
2. Local pass-and-play multiplayer
3. Multiple AI difficulty levels
4. Level progression
5. Realistic physics
6. Classic Carrom rules
7. Practice mode
8. Challenge levels
9. Mobile-responsive controls
10. Desktop controls

**Online multiplayer is explicitly out of scope** for the first core version.
It is only considered once core gameplay is complete and stable. The
architecture must be *prepared* for it (deterministic-friendly state, no
rendering logic embedded in rules).

---

## 2. Technology Requirements

| Concern | Choice |
| --- | --- |
| Language | TypeScript |
| Bundler / dev server | Vite |
| Rendering | Three.js |
| Physics | Rapier |
| Modules | Modern ES modules |

Avoid unnecessary dependencies.

Must run with `npm install` && `npm run dev`, and must build cleanly with
`npm run build`.

---

## 3. Visual Style

Premium modern 3D game aesthetic:

- Realistic wooden Carrom board
- Slightly elevated board frame, rounded edges
- Corner pockets
- Detailed board markings
- Realistic striker
- White coins, black coins, red Queen
- Soft shadows, ambient lighting, directional lighting
- Subtle reflections, high-quality materials

Viewed from a slightly angled top-down camera — the feel of a premium tabletop
game. The player must always have a clear view of the board.

---

## 4. Camera

Perspective camera. Default position shows the complete board.

- Slight isometric angle
- Entire board always visible
- Responsive for desktop and mobile
- Smooth transitions where appropriate
- **Must not rotate during normal gameplay** unless a future feature enables it
- The player's shooting side must always be visually clear

---

## 5. Game Board

Standard square Carrom board containing:

- Wooden playing surface
- Raised wooden borders
- Four corner pockets
- Center circle
- Decorative board markings
- Player baselines
- Placement circles
- Corner pocket indicators

The board must look physically believable.

---

## 6. Game Pieces

| Piece | Count |
| --- | --- |
| White coins | 9 |
| Black coins | 9 |
| Red Queen | 1 |
| Striker | 1 |

Each piece has: a Three.js mesh, a Rapier rigid body, a collider, and
configurable mass, friction, and restitution.

Coins slide smoothly; collisions feel realistic. The striker is slightly
heavier and more powerful than a regular coin.

---

## 7. Physics Requirements

Physics is one of the most important parts of this project.

Implement: smooth sliding, momentum, coin-to-coin collisions, striker-to-coin
collisions, board wall collisions, pocket detection, friction, energy loss,
collision damping, and rest detection.

The physics system must detect when **all** pieces have stopped moving. A turn
can only end after all pieces are fully at rest.

### `PHYSICS_CONFIG`

A single configurable object, easy to tune:

```
BOARD_FRICTION
COIN_FRICTION
STRIKER_FRICTION
COIN_RESTITUTION
STRIKER_RESTITUTION
VELOCITY_SLEEP_THRESHOLD
MAX_STRIKE_FORCE
MIN_STRIKE_FORCE
```

---

## 8. Pocket System

Each of the four corners contains a pocket sensor. When a coin enters a pocket:

1. Detect the correct piece
2. Remove it from active gameplay
3. Play pocket animation
4. Play sound
5. Update game state
6. Evaluate rules

The striker entering a pocket triggers a foul.

---

## 9. Game Rules — Classic Carrom (default ruleset)

Each player eventually owns either white or black coins. Ownership is
determined by the first valid color coin pocketed.

1. Players take turns shooting.
2. A player places the striker on their baseline.
3. The player aims and applies force.
4. The player releases the striker.
5. **Pockets own coin** → the player continues their turn.
6. **Miss** → the turn changes.
7. **Striker pocketed** → foul, end turn, apply penalty per the selected ruleset.
8. **Opponent coin pocketed** → apply the selected foul behavior, end turn.
9. The Queen is special.
10. The Queen must be covered according to the game rules.

---

## 10. Queen System

The Queen is red. Its state machine:

```
ON_BOARD
POCKETED_PENDING_COVER
COVERED
RETURN_TO_CENTER
```

Rules:

- The Queen may be pocketed during valid gameplay.
- After pocketing the Queen, the player must pocket one of their own coins on
  the required follow-up shot.
- If the Queen is not successfully covered, return it to the center of the board.
- If the center is occupied, find the nearest valid placement position.

The UI must clearly communicate `QUEEN POCKETED` and `COVER THE QUEEN` via an
indicator.

---

## 11. Turn System

A complete turn state machine:

```
GAME_START
BREAK_TURN
STRIKER_POSITIONING
AIMING
SHOOTING
PHYSICS_SETTLING
SHOT_EVALUATION
QUEEN_EVALUATION
FOUL_EVALUATION
TURN_COMPLETE
PLAYER_SWITCH
GAME_COMPLETE
```

Invalid player actions must be impossible during physics simulation.

---

## 12. Striker Positioning

Before each shot the player moves the striker horizontally along their baseline.

- **Desktop:** mouse drag / click and drag
- **Mobile:** touch drag

The striker must remain inside the legal shooting area; placement outside the
baseline is prevented.

---

## 13. Aiming System

When the player selects the striker, show:

- Aim line
- Direction indicator
- Optional predicted trajectory
- Power meter

The aim line extends visually toward the target direction. The system must feel
responsive, and the guide must not be overly intrusive.

Setting: `ASSISTED_AIM` | `CLASSIC_AIM`.

---

## 14. Shot Controls

**Desktop:** move striker along baseline → click/drag to aim → pull backward to
increase power → release to shoot.

**Mobile:** touch striker → drag to aim → pull backward → release.

Direction and force are calculated from the drag vector. Maximum force is
clamped. Accidental shots must be prevented.

---

## 15. Shot Feedback

After a shot: camera remains stable, physics runs, UI disables additional
shots, pieces settle, results are evaluated.

Small notifications: `NICE SHOT`, `GREAT COMBO`, `QUEEN POCKETED`, `FOUL`,
`YOUR TURN`, `OPPONENT TURN`.

---

## 16. Game Modes

### Mode 1 — Quick Match
Player vs AI. Difficulty: `EASY` | `NORMAL` | `HARD` | `EXPERT`.

### Mode 2 — Practice
Unlimited practice. Restart board, reset striker, no pressure, optional
trajectory guide.

### Mode 3 — Local Multiplayer
Pass-and-play on one device. Turn indicator clearly shows `PLAYER 1` /
`PLAYER 2`.

### Mode 4 — Career Mode
Progress through AI opponents and arenas.

---

## 17. Career Mode

30 levels initially. The level system must be **data-driven**.

| Levels | Tier |
| --- | --- |
| 1–5 | Beginner |
| 6–10 | Amateur |
| 11–15 | Intermediate |
| 16–20 | Advanced |
| 21–25 | Professional |
| 26–30 | Champion |

Each level defines: Level ID, Opponent, Difficulty, AI accuracy, AI power
control, AI decision quality, Reward, Board theme, Match objective.

---

## 18. AI Difficulty System

### `AI_CONFIG` parameters

```
accuracy
powerAccuracy
targetSelection
bankShotProbability
queenStrategy
riskTolerance
mistakeProbability
thinkingDelay
```

| Tier | Characteristics |
| --- | --- |
| **Easy** | Frequently misses, poor power control, rarely attempts difficult shots, weak Queen strategy |
| **Normal** | Reasonable accuracy, basic strategy, occasional mistakes, attempts simple Queen opportunities |
| **Hard** | Good accuracy, better target selection, understands Queen strategy, attempts tactical shots |
| **Expert** | High accuracy, strong target selection, good power calculation, uses bank shots, plans Queen coverage, still includes small natural mistakes |

---

## 19. AI System

**Do not fake AI shots.** The AI must use the same physics system and the same
striker system as the player.

Workflow:

1. Inspect all available coins
2. Identify valid target coins
3. Identify direct pocket shots
4. Score possible shots
5. Optionally calculate bank shots
6. Choose the best shot based on difficulty
7. Calculate aim vector
8. Calculate force
9. Add difficulty-based error
10. Execute the shot through the same striker system

### Shot scoring factors

```
SHOT_DISTANCE
TARGET_DISTANCE_TO_POCKET
SHOT_ANGLE
BLOCKING_COINS
QUEEN_VALUE
RISK
COVER_OPPORTUNITY
```

---

## 20. Level Challenges

Challenge objectives alongside normal matches, reusing the same physics and
game rules:

1. Pocket 3 coins in 3 shots
2. Pocket the Queen successfully
3. Win within 8 turns
4. Complete without fouls
5. Score a bank shot
6. Clear a specific set of coins

---

## 21. Progression

Player earns `COINS`, `XP`, `STARS`. Each level awards 1–3 stars:

| Stars | Condition |
| --- | --- |
| 1 | Complete level |
| 2 | Complete within target turns |
| 3 | Complete with no foul |

Persisted to `localStorage` via `SaveManager.ts`, holding:

```
playerLevel
xp
coins
unlockedLevels
levelStars
settings
```

---

## 22. Player Profile

Local profile: player name, avatar placeholder, current level, XP, win count,
loss count, accuracy percentage, best streak.

---

## 23. UI Screens

1. Splash Screen
2. Main Menu
3. Mode Selection
4. Level Selection
5. Difficulty Selection
6. Game Screen
7. Pause Menu
8. Settings
9. Victory Screen
10. Defeat Screen
11. Career Progress Screen

### Main Menu
Buttons: `PLAY`, `CAREER`, `PRACTICE`, `LOCAL MULTIPLAYER`, `SETTINGS`.
Premium and minimal.

### In-Game HUD
- **Top:** player name, opponent name, remaining coins, current turn indicator
- **Side (optional):** pause button, settings button
- **Bottom:** aim controls, power indicator, contextual information

The UI must not block the board.

---

## 24. Responsive Design

Must work on desktop, laptop, tablet, mobile landscape, and mobile portrait.

- **Mobile portrait:** the board scales to fit
- **Mobile landscape:** prioritize gameplay board size

Use responsive UI layouts.

---

## 25. Audio

Sounds: striker hit, coin collision, wall collision, pocket, Queen, foul,
victory, background music.

Settings: `MUSIC ON/OFF`, `SFX ON/OFF`.

---

## 26. Particle Effects

Subtle only.

- **Pocket:** small particle burst, slight glow, coin disappearance animation
- **Victory:** confetti

Do not overuse visual effects.

---

## 27. Game Settings

Music, sound effects, aim assist, graphics quality, shadow quality, camera
effects.

### Graphics quality tiers

| Tier | Behavior |
| --- | --- |
| `LOW` | Reduced shadows, reduced particles |
| `MEDIUM` | Standard shadows |
| `HIGH` | Better shadows, higher rendering quality |

---

## 28. Performance Targets

- **Desktop:** 60 FPS
- **Modern mobile:** stable 30–60 FPS

Optimize via geometry reuse, material reuse, object pooling, avoiding
unnecessary allocations, and an efficient render loop.

---

## 29. Testing

Tests or development validation for:

- Coin pocket detection
- Striker foul detection
- Turn switching
- Queen cover logic
- Queen reset
- Game victory detection
- AI valid shot execution
- Physics rest detection

---

## 30. Debug Mode

A development debug mode toggling: physics colliders, pocket sensors, velocity
display, aim vectors, AI target visualization.

**Debug mode must be disabled in production builds.**

---

## 31. Development Rules (binding)

After every major phase:

1. Run the application
2. Fix TypeScript errors
3. Fix runtime errors
4. Verify gameplay
5. **Do not proceed until the phase works**

Additional standing rules:

- Never replace working functionality unnecessarily
- Keep the code modular
- Do not use placeholder gameplay logic when real implementation is possible
- Prioritize the core gameplay experience over unnecessary features
- Do not implement all phases at once

### Required end-of-phase report

1. Files created
2. Files modified
3. What works
4. Known limitations
5. Recommended next phase
