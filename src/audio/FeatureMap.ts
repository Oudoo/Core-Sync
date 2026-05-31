/**
 * FeatureMap — the complete audio analysis result.
 *
 * Generated once per song before gameplay. Every frame carries the timestamp
 * and all extracted features. The ChartGenerator (Phase 2) consumes this to
 * produce the note chart.
 */

/**
 * One analysis frame's worth of audio features.
 */
export interface AnalysisFrame {
  /** Time in seconds from the start of the song. */
  time: number;

  /** Root-mean-square energy of the time-domain window. */
  rms: number;

  /** Energy in the low frequency band (20–250 Hz). */
  lowEnergy: number;

  /** Energy in the mid frequency band (250–4000 Hz). */
  midEnergy: number;

  /** Energy in the high frequency band (4000–20000 Hz). */
  highEnergy: number;

  /** Total spectral energy across all bands. */
  totalEnergy: number;

  /**
   * Spectral flux — sum of positive magnitude differences from the previous
   * frame. High flux = new frequency content appearing = likely a transient.
   */
  spectralFlux: number;

  /**
   * Spectral centroid in Hz — the "center of mass" of the spectrum.
   * Bright sounds have a high centroid; dull/bassy sounds have a low one.
   */
  spectralCentroid: number;

  /**
   * Spectral roll-off in Hz — the frequency below which 85% of the total
   * spectral energy is concentrated.
   */
  spectralRolloff: number;

  /** Change in total energy from the previous frame. */
  energyDelta: number;

  /**
   * True if this frame is a detected spectral-flux peak (local maximum above
   * an adaptive threshold). These are onset candidates.
   */
  isPeak: boolean;

  /**
   * True if this frame is a confirmed onset after post-processing
   * (peak picking + minimum inter-onset gap).
   */
  isOnset: boolean;
}

/**
 * The complete feature map for an analyzed song.
 */
export interface FeatureMap {
  /** Sample rate of the source audio. */
  sampleRate: number;

  /** Duration of the song in seconds. */
  duration: number;

  /** Number of analysis frames. */
  frameCount: number;

  /** Hop size in samples between consecutive frames. */
  hopSize: number;

  /** FFT window size. */
  fftSize: number;

  /** All analysis frames, chronologically ordered. */
  frames: AnalysisFrame[];

  /** Peak values for normalization (set during post-processing). */
  peaks: {
    rms: number;
    lowEnergy: number;
    midEnergy: number;
    highEnergy: number;
    spectralFlux: number;
  };
}
