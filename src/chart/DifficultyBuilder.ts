import { Difficulty } from './Chart';

export interface DifficultyConfig {
  difficulty: Difficulty;
  /** Minimum onset strength required to generate a note (0.0 to 1.0) */
  threshold: number;
  /** Lookahead window in seconds (speed of visual flow) */
  lookaheadS: number;
  /** Note scroll speed in seconds */
  scrollSpeedS: number;
  /** Allow subdivision: 0.5 (half beats), 0.25 (quarter beats) */
  allowSubdivision: number;
  /** Chance scale of generating double notes (simultaneous notes) */
  simultaneousChance: number;
}

export const DifficultyConfigs: Record<Difficulty, DifficultyConfig> = {
  [Difficulty.EASY]: {
    difficulty: Difficulty.EASY,
    threshold: 0.5,
    lookaheadS: 2.2,
    scrollSpeedS: 2.2,
    allowSubdivision: 1.0, // Only place on full beats
    simultaneousChance: 0.0, // No simultaneous notes
  },
  [Difficulty.NORMAL]: {
    difficulty: Difficulty.NORMAL,
    threshold: 0.35,
    lookaheadS: 1.8,
    scrollSpeedS: 1.8,
    allowSubdivision: 0.5, // Allow half-beats
    simultaneousChance: 0.1, // 10% chance on high flux
  },
  [Difficulty.HARD]: {
    difficulty: Difficulty.HARD,
    threshold: 0.22,
    lookaheadS: 1.4,
    scrollSpeedS: 1.4,
    allowSubdivision: 0.25, // Allow quarter-beats
    simultaneousChance: 0.3, // 30% chance on high flux
  },
  [Difficulty.EXTREME]: {
    difficulty: Difficulty.EXTREME,
    threshold: 0.12,
    lookaheadS: 1.1,
    scrollSpeedS: 1.1,
    allowSubdivision: 0.25, // Full quarter subdivisions
    simultaneousChance: 0.6, // 60% chance
  },
};
