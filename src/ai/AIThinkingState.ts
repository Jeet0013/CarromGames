/**
 * AI turn state machine.
 *
 * The AI does not decide and fire in one frame. It moves through these states
 * across real time so the human can see what it is doing — the striker slides
 * into place, the aim line appears, then the shot goes. An opponent that acts
 * instantly reads as a scripted event rather than a player.
 */

export const AIThinkingState = {
  Idle: 'AI_IDLE',
  TurnStart: 'AI_TURN_START',
  Thinking: 'AI_THINKING',
  AnalyzingBoard: 'AI_ANALYZING_BOARD',
  GeneratingShots: 'AI_GENERATING_SHOTS',
  ScoringShots: 'AI_SCORING_SHOTS',
  SelectingShot: 'AI_SELECTING_SHOT',
  PositioningStriker: 'AI_POSITIONING_STRIKER',
  Aiming: 'AI_AIMING',
  PreparingShot: 'AI_PREPARING_SHOT',
  Shooting: 'AI_SHOOTING',
  WaitingForPhysics: 'AI_WAITING_FOR_PHYSICS',
  EvaluatingResult: 'AI_EVALUATING_RESULT',
  ContinueTurn: 'AI_CONTINUE_TURN',
  TurnComplete: 'AI_TURN_COMPLETE',
  Error: 'AI_ERROR',
} as const;
export type AIThinkingState = (typeof AIThinkingState)[keyof typeof AIThinkingState];
