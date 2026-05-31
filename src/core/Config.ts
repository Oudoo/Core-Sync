/**
 * Config — all tunable constants for the game, centralized.
 *
 * DECISION: Flat object, not a class. These are compile-time-ish constants
 * that systems import directly. No runtime config changes except calibration
 * (which lives in Clock).
 */

export const Config = {
  /** Generator version — bump this to invalidate cached charts. */
  CHART_GENERATOR_VERSION: 1,

  // ── Timing / Judgment (in milliseconds) ──
  PERFECT_WINDOW_MS: 25,
  GREAT_WINDOW_MS: 50,
  GOOD_WINDOW_MS: 90,

  // ── Scoring ──
  PERFECT_SCORE: 100,
  GREAT_SCORE: 75,
  GOOD_SCORE: 50,
  MISS_SCORE: 0,

  // ── Gameplay ──
  /** How far ahead (in seconds) to activate notes from the pool. */
  LOOKAHEAD_WINDOW_S: 2.0,
  /** Base scroll speed — notes travel from spawn to hit zone in this many seconds. */
  SCROLL_SPEED_S: 2.0,
  /** Number of lanes for note placement. */
  // DECISION: 4 lanes — good balance of spatial variety without clutter on mobile portrait.
  LANE_COUNT: 4,

  // ── Performance Ceilings ──
  MAX_ACTIVE_NOTES: 200,
  MAX_PARTICLES: 500,
  MAX_TRAILS: 50,
  MAX_SHADER_PASSES: 3,
  /** Target frame time in ms (60 FPS). */
  TARGET_FRAME_TIME_MS: 16.67,

  // ── Audio Analysis ──
  FFT_SIZE: 2048,
  /** Hop size in samples between analysis frames. */
  // DECISION: 512 samples hop — gives ~86 frames/sec at 44100 Hz, good temporal resolution
  // for onset detection without being wastefully dense.
  HOP_SIZE: 512,
  /** Frequency band boundaries in Hz. */
  FREQ_LOW_MIN: 20,
  FREQ_LOW_MAX: 250,
  FREQ_MID_MIN: 250,
  FREQ_MID_MAX: 4000,
  FREQ_HIGH_MIN: 4000,
  FREQ_HIGH_MAX: 20000,

  // ── Visual ──
  /** Background color (black). */
  BG_COLOR: 0x000000,
  /** Hitbox scale relative to visual note size. */
  HITBOX_SCALE: 1.4,

  // ── Energy ──
  ENERGY_HIT_GAIN: 0.05,
  ENERGY_MISS_PENALTY: 0.08,
  ENERGY_DECAY_RATE: 0.002, // per frame, passive decay

  // ── Combo ──
  COMBO_MULTIPLIER_THRESHOLDS: [10, 25, 50, 100] as readonly number[],
  COMBO_MULTIPLIER_VALUES: [1, 2, 3, 4, 5] as readonly number[],
} as const;

export type ConfigType = typeof Config;
