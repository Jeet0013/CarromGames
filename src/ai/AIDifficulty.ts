/**
 * AI strength tiers.
 *
 * Difficulty is expressed as *competence*, never as advantage. Every tier plays
 * the same game through the same physics; what changes is how well it analyses
 * the board, how many options it considers, and how precisely it executes.
 * There is no tier that gets extra force, sees the future, or is handed a
 * result — a weak AI misses because its aim vector was genuinely off.
 */

export const AIDifficulty = {
  Easy: 'EASY',
  Normal: 'NORMAL',
  Hard: 'HARD',
  Expert: 'EXPERT',
} as const;
export type AIDifficulty = (typeof AIDifficulty)[keyof typeof AIDifficulty];

export const DIFFICULTY_ORDER: readonly AIDifficulty[] = [
  AIDifficulty.Easy,
  AIDifficulty.Normal,
  AIDifficulty.Hard,
  AIDifficulty.Expert,
];

export interface DifficultyPresentation {
  readonly label: string;
  readonly description: string;
  /** Filled stars out of four. */
  readonly stars: number;
  readonly accent: string;
}

export const DIFFICULTY_INFO: Record<AIDifficulty, DifficultyPresentation> = {
  [AIDifficulty.Easy]: {
    label: 'Easy',
    description: 'Relaxed opponent for learning the game.',
    stars: 1,
    accent: '#6fc08a',
  },
  [AIDifficulty.Normal]: {
    label: 'Normal',
    description: 'A balanced opponent with occasional mistakes.',
    stars: 2,
    accent: '#e8a33d',
  },
  [AIDifficulty.Hard]: {
    label: 'Hard',
    description: 'A tactical opponent with strong shot selection.',
    stars: 3,
    accent: '#4fb3c4',
  },
  [AIDifficulty.Expert]: {
    label: 'Expert',
    description: 'Highly accurate and strategic.',
    stars: 4,
    accent: '#a487e0',
  },
};
