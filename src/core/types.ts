/**
 * Shared domain types.
 *
 * These describe the *rules* of Carrom, not its presentation. Nothing in this
 * file may reference Three.js or Rapier — rendering and physics adapt to these
 * types, never the other way around. Keeping the vocabulary engine-free is
 * what allows the rule layer to run headlessly later.
 */

/** Which physical piece a body represents. */
export const PieceKind = {
  WhiteCoin: 'WHITE_COIN',
  BlackCoin: 'BLACK_COIN',
  Queen: 'QUEEN',
  Striker: 'STRIKER',
} as const;
export type PieceKind = (typeof PieceKind)[keyof typeof PieceKind];

/** The two coin colours a player can own. Assigned on the first valid pocket. */
export const CoinColor = {
  White: 'WHITE',
  Black: 'BLACK',
} as const;
export type CoinColor = (typeof CoinColor)[keyof typeof CoinColor];

/** Seat at the board. Local play and AI both map onto these. */
export const PlayerSlot = {
  One: 'PLAYER_ONE',
  Two: 'PLAYER_TWO',
} as const;
export type PlayerSlot = (typeof PlayerSlot)[keyof typeof PlayerSlot];

/** Who supplies the shot for a seat. A remote source slots in here later. */
export const ControllerKind = {
  Human: 'HUMAN',
  AI: 'AI',
} as const;
export type ControllerKind = (typeof ControllerKind)[keyof typeof ControllerKind];

/**
 * Turn state machine. Player input is only legal in `StrikerPositioning` and
 * `Aiming`; every other state must reject it.
 */
export const TurnState = {
  GameStart: 'GAME_START',
  BreakTurn: 'BREAK_TURN',
  StrikerPositioning: 'STRIKER_POSITIONING',
  Aiming: 'AIMING',
  Shooting: 'SHOOTING',
  PhysicsSettling: 'PHYSICS_SETTLING',
  ShotEvaluation: 'SHOT_EVALUATION',
  QueenEvaluation: 'QUEEN_EVALUATION',
  FoulEvaluation: 'FOUL_EVALUATION',
  TurnComplete: 'TURN_COMPLETE',
  PlayerSwitch: 'PLAYER_SWITCH',
  GameComplete: 'GAME_COMPLETE',
} as const;
export type TurnState = (typeof TurnState)[keyof typeof TurnState];

/** The states where a human may touch the striker. */
export const INTERACTIVE_TURN_STATES: readonly TurnState[] = [
  TurnState.StrikerPositioning,
  TurnState.Aiming,
];

/** Queen lifecycle, per the classic cover rule. */
export const QueenState = {
  OnBoard: 'ON_BOARD',
  PocketedPendingCover: 'POCKETED_PENDING_COVER',
  Covered: 'COVERED',
  ReturnToCenter: 'RETURN_TO_CENTER',
} as const;
export type QueenState = (typeof QueenState)[keyof typeof QueenState];

/** AI strength tiers. */
export const Difficulty = {
  Easy: 'EASY',
  Normal: 'NORMAL',
  Hard: 'HARD',
  Expert: 'EXPERT',
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

/** Top-level game modes. */
export const GameMode = {
  QuickMatch: 'QUICK_MATCH',
  Practice: 'PRACTICE',
  LocalMultiplayer: 'LOCAL_MULTIPLAYER',
  Career: 'CAREER',
} as const;
export type GameMode = (typeof GameMode)[keyof typeof GameMode];

/** Aim guidance level, chosen in settings. */
export const AimMode = {
  Assisted: 'ASSISTED_AIM',
  Classic: 'CLASSIC_AIM',
} as const;
export type AimMode = (typeof AimMode)[keyof typeof AimMode];

/** Renderer cost tier. */
export const QualityTier = {
  Low: 'LOW',
  Medium: 'MEDIUM',
  High: 'HIGH',
} as const;
export type QualityTier = (typeof QualityTier)[keyof typeof QualityTier];

/** Reasons a shot can be ruled a foul. */
export const FoulKind = {
  StrikerPocketed: 'STRIKER_POCKETED',
  OpponentCoinPocketed: 'OPPONENT_COIN_POCKETED',
  NoContact: 'NO_CONTACT',
  IllegalStrikerPlacement: 'ILLEGAL_STRIKER_PLACEMENT',
} as const;
export type FoulKind = (typeof FoulKind)[keyof typeof FoulKind];

/** A point on the board plane. The board lies in XZ; Y is height. */
export interface BoardPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * A complete shot, fully described by data.
 *
 * This is deliberately serializable: the human input layer, the AI, and (later)
 * a network peer all produce this same command, and the rule layer cannot tell
 * them apart. `power` is normalised 0–1 and mapped through `PHYSICS_CONFIG`.
 */
export interface ShotCommand {
  /** Striker placement along the baseline at the moment of release. */
  readonly origin: BoardPoint;
  /** Unit vector on the board plane. */
  readonly direction: BoardPoint;
  /** Normalised 0–1; scaled between MIN_STRIKE_FORCE and MAX_STRIKE_FORCE. */
  readonly power: number;
}
