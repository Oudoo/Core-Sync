import { Difficulty } from './Chart';

export interface DifficultyConfig {
  difficulty: Difficulty;
  /** Minimum onset strength required to generate a note (0.0 to 1.0) */
  threshold: number;
  /** Lookahead window in seconds (speed of visual flow) */
  lookaheadS: number;
  /** Note scroll speed in seconds */
  scrollSpeedS: number;
  /** Allow subdivision: 1=full beats, 2=half, 4=quarter */
  allowSubdivision: number;
  /** Chance of generating a simultaneous (double) note */
  simultaneousChance: number;
  /** Minimum gap in seconds before another note can land in the SAME lane */
  laneCooldownS: number;
}

export const DifficultyConfigs: Record<Difficulty, DifficultyConfig> = {
  [Difficulty.EASY]: {
    difficulty: Difficulty.EASY,
    threshold: 0.9,            // Only the biggest hits
    lookaheadS: 2.2,
    scrollSpeedS: 2.2,
    allowSubdivision: 1.0,    // Full beats only
    simultaneousChance: 0.0,
    laneCooldownS: 0.5,       // Half-second gap per lane — very spacious
  },
  [Difficulty.NORMAL]: {
    difficulty: Difficulty.NORMAL,
    threshold: 0.7,            // Clear, distinct beats
    lookaheadS: 1.8,
    scrollSpeedS: 1.8,
    allowSubdivision: 0.5,    // Half-beats allowed
    simultaneousChance: 0.08,
    laneCooldownS: 0.3,       // 300ms gap — one note per lane every ~2 beats at 120BPM
  },
  [Difficulty.HARD]: {
    difficulty: Difficulty.HARD,
    threshold: 0.5,
    lookaheadS: 1.4,
    scrollSpeedS: 1.4,
    allowSubdivision: 0.25,
    simultaneousChance: 0.25,
    laneCooldownS: 0.18,
  },
  [Difficulty.EXTREME]: {
    difficulty: Difficulty.EXTREME,
    threshold: 0.3,
    lookaheadS: 1.1,
    scrollSpeedS: 1.1,
    allowSubdivision: 0.25,
    simultaneousChance: 0.5,
    laneCooldownS: 0.1,
  },
};
