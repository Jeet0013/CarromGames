/**
 * Four-player configuration.
 *
 * Teams and free-for-all differ in how colour is owned, how score is counted,
 * and how the match ends — but *not* in how a shot is taken. Encoding those
 * differences as configuration keeps the interaction layer (placement, aiming,
 * turn rotation) identical for both, which is what lets free-for-all be added
 * later without touching any of it.
 */

import { FourPlayerMode, PlayerSlot, TeamId } from '../core/types';

export type ColorAssignmentMode = 'INDIVIDUAL' | 'TEAM' | 'SCORE_BASED';
export type ScoringMode = 'COIN_POINTS' | 'COIN_OWNERSHIP' | 'MATCH_ELIMINATION';
export type TurnContinuation = 'POCKET_SUCCESS' | 'NO_CONTINUATION';
export type FoulBehavior = 'POINT_PENALTY' | 'COIN_RETURN' | 'TURN_LOSS';

export interface FourPlayerRuleSet {
  readonly mode: FourPlayerMode;
  readonly colorAssignmentMode: ColorAssignmentMode;
  readonly scoringMode: ScoringMode;
  readonly turnContinuation: TurnContinuation;
  readonly foulBehavior: FoulBehavior;
}

/**
 * The primary four-player mode: partners, sharing a colour and a win condition.
 *
 * Only two coin colours exist, so partners is the format the physical game
 * actually supports — the alternative would require inventing a fourth
 * ownership concept that no Carrom board has.
 */
export const FOUR_PLAYER_TEAMS: FourPlayerRuleSet = {
  mode: FourPlayerMode.Teams,
  colorAssignmentMode: 'TEAM',
  scoringMode: 'COIN_OWNERSHIP',
  turnContinuation: 'POCKET_SUCCESS',
  foulBehavior: 'COIN_RETURN',
};

/**
 * Free-for-all: no permanent colour ownership, points per pocket.
 *
 * Declared and wired through the same config so the architecture demonstrably
 * supports it. The scoring table it needs lives here rather than in the engine.
 */
export const FOUR_PLAYER_FREE_FOR_ALL: FourPlayerRuleSet = {
  mode: FourPlayerMode.FreeForAll,
  colorAssignmentMode: 'SCORE_BASED',
  scoringMode: 'COIN_POINTS',
  turnContinuation: 'POCKET_SUCCESS',
  foulBehavior: 'POINT_PENALTY',
};

/** Points awarded in free-for-all scoring. */
export const FREE_FOR_ALL_POINTS = {
  coin: 1,
  queen: 3,
  queenCover: 2,
  strikerFoul: -2,
} as const;

/**
 * Default seating, exactly as specified.
 *
 * Opposite seats are partners, which is how a physical four-player game is
 * arranged — you face your partner and sit between your opponents.
 */
export const FOUR_PLAYER_SEATING: ReadonlyArray<{
  readonly slot: PlayerSlot;
  readonly team: TeamId;
}> = [
  { slot: PlayerSlot.One, team: TeamId.A }, // LEFT
  { slot: PlayerSlot.Two, team: TeamId.B }, // TOP
  { slot: PlayerSlot.Three, team: TeamId.A }, // RIGHT
  { slot: PlayerSlot.Four, team: TeamId.B }, // BOTTOM
];

/** Default turn order: P1 → P2 → P3 → P4. Alternates teams every turn. */
export const FOUR_PLAYER_TURN_ORDER: readonly PlayerSlot[] = [
  PlayerSlot.One,
  PlayerSlot.Two,
  PlayerSlot.Three,
  PlayerSlot.Four,
];
