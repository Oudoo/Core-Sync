import { Note, NoteType } from '../chart/Note';
import { Chart, Difficulty } from '../chart/Chart';
import { DifficultyConfigs } from '../chart/DifficultyBuilder';
import { FeatureMap } from './FeatureMap';
import { hashBuffer } from '../utils/Math';

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed || 1;
  }

  /**
   * Return a float between 0 and 1
   */
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }

  /**
   * Return an integer between min and max (inclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.minMax(min, max + 1));
  }

  private minMax(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

export class ChartGenerator {
  static readonly VERSION = 1;

  /**
   * Generate a deterministic chart for a given song and difficulty.
   */
  static generate(
    fileName: string,
    fileBuffer: ArrayBuffer,
    featureMap: FeatureMap,
    sampleRate: number,
    difficulty: Difficulty
  ): Chart {
    const config = DifficultyConfigs[difficulty];
    const fileHash = hashBuffer(fileBuffer);
    
    // Seed LCG deterministically from filename length + hash
    const seed = (fileHash ^ fileName.length) >>> 0;
    const rng = new SeededRandom(seed);

    // 1. Estimate BPM and Beat Grid
    const bpm = this.estimateBPM(featureMap, sampleRate);
    const beatInterval = 60 / bpm;

    // Find the first onset to anchor the beat grid
    let firstOnsetFrame = featureMap.frames.find((f) => f.isOnset && f.spectralFlux > 1.5);
    if (!firstOnsetFrame && featureMap.frameCount > 0) {
      firstOnsetFrame = featureMap.frames[0];
    }
    const anchorTime = firstOnsetFrame ? firstOnsetFrame.time : 0;

    // 2. Setup Quantization Grid
    const subdivision = 1 / config.allowSubdivision; // e.g. Easy (1) => full beats, Normal (2) => half beats, etc.
    const stepDuration = beatInterval / subdivision;

    const snappedNotesMap = new Map<string, Note>(); // Keyed by "lane:snappedTime"
    // Track the last note time per lane to enforce per-lane cooldown spacing
    const lastNoteTimePerLane: number[] = [-999, -999, -999, -999];
    let noteIdCounter = 0;

    // 3. Generate Note Types (Tap, Spark, Hold)
    const totalDuration = featureMap.frameCount > 0 ? featureMap.frames[featureMap.frameCount - 1].time : 0;
    const stepsCount = Math.floor((totalDuration - anchorTime) / stepDuration);

    // We scan the feature frames to map transients onto our grid steps
    for (let s = 0; s < stepsCount; s++) {
      const stepTime = anchorTime + s * stepDuration;

      // Find the analysis frames falling in this step window
      const frameStartIdx = Math.max(0, featureMap.frames.findIndex((f) => f.time >= stepTime - stepDuration / 2));
      const frameEndIdx = Math.min(
        featureMap.frameCount - 1,
        featureMap.frames.findIndex((f) => f.time >= stepTime + stepDuration / 2)
      );

      if (frameStartIdx === -1 || frameEndIdx === -1 || frameStartIdx > frameEndIdx) {
        continue;
      }

      // Aggregate energy and look for onsets in this grid step
      let maxFlux = 0;
      let maxMidEnergy = 0;
      let maxHighEnergy = 0;
      let maxLowEnergy = 0;
      let hasOnset = false;

      for (let i = frameStartIdx; i <= frameEndIdx; i++) {
        const f = featureMap.frames[i];
        if (f.spectralFlux > maxFlux) maxFlux = f.spectralFlux;
        if (f.midEnergy > maxMidEnergy) maxMidEnergy = f.midEnergy;
        if (f.highEnergy > maxHighEnergy) maxHighEnergy = f.highEnergy;
        if (f.lowEnergy > maxLowEnergy) maxLowEnergy = f.lowEnergy;
        if (f.isOnset) hasOnset = true;
      }

      // Map intensities to strength [0..1]
      const fluxStrength = Math.min(1.0, maxFlux / 15.0);

      // --- TAP Notes (Mid frequency kicks / beats) ---
      // Threshold is against normalized flux (0-1), matching config.threshold directly
      const normalizedFlux = Math.min(1.0, maxFlux / 15.0);
      if (hasOnset && normalizedFlux > config.threshold) {
        const lane1 = this.chooseLaneForMidFrequency(maxMidEnergy, maxLowEnergy, rng);

        // Enforce per-lane cooldown to prevent note pile-ups
        if (stepTime - lastNoteTimePerLane[lane1] >= config.laneCooldownS) {
          const note1: Note = {
            id: `note_${noteIdCounter++}`,
            time: stepTime,
            type: NoteType.TAP,
            lane: lane1,
            duration: 0,
            velocity: 1.0,
            strength: fluxStrength,
          };
          snappedNotesMap.set(`${lane1}:${stepTime.toFixed(4)}`, note1);
          lastNoteTimePerLane[lane1] = stepTime;

          // Double note — only on very strong transients
          const isDouble = rng.next() < config.simultaneousChance && normalizedFlux > config.threshold + 0.2;
          if (isDouble) {
            let lane2 = (lane1 + 2) % 4;
            if (stepTime - lastNoteTimePerLane[lane2] < config.laneCooldownS) {
              lane2 = (lane1 + 1) % 4;
            }
            if (stepTime - lastNoteTimePerLane[lane2] >= config.laneCooldownS) {
              const note2: Note = {
                id: `note_${noteIdCounter++}`,
                time: stepTime,
                type: NoteType.TAP,
                lane: lane2,
                duration: 0,
                velocity: 1.0,
                strength: fluxStrength,
              };
              snappedNotesMap.set(`${lane2}:${stepTime.toFixed(4)}`, note2);
              lastNoteTimePerLane[lane2] = stepTime;
            }
          }
        }
      }

      // --- SPARK Notes (High frequency hats, rapid responses) ---
      const normalizedHigh = Math.min(1.0, maxHighEnergy / 10.0);
      if (
        difficulty !== Difficulty.EASY &&
        normalizedHigh > config.threshold + 0.1 &&
        rng.next() < (difficulty === Difficulty.EXTREME ? 0.35 : 0.18)
      ) {
        // High frequency hits map to edge lanes (0 or 3)
        const lane = rng.next() < 0.5 ? 0 : 3;
        const key = `${lane}:${stepTime.toFixed(4)}`;
        
        // Only generate Spark if there isn't a Tap note in this lane already
        if (!snappedNotesMap.has(key)) {
          const sparkNote: Note = {
            id: `note_${noteIdCounter++}`,
            time: stepTime,
            type: NoteType.SPARK,
            lane: lane,
            duration: 0,
            velocity: 1.2, // Sparks flow slightly faster
            strength: Math.min(1.0, maxHighEnergy / 10.0),
          };
          snappedNotesMap.set(key, sparkNote);
        }
      }
    }

    // --- HOLD Notes (Sustained Low Frequency Bass lines) ---
    // Scan raw frames for low-frequency intensity regions
    if (difficulty !== Difficulty.EASY) {
      let holdStartFrameIdx = -1;
      const minHoldFrames = Math.max(5, Math.round(0.8 / (512 / sampleRate))); // At least 0.8s hold

      for (let i = 0; i < featureMap.frameCount; i++) {
        const f = featureMap.frames[i];
        const isBassHeavy = f.lowEnergy > 6.0;

        if (isBassHeavy && holdStartFrameIdx === -1) {
          holdStartFrameIdx = i;
        } else if (!isBassHeavy && holdStartFrameIdx !== -1) {
          const durationFrames = i - holdStartFrameIdx;
          if (durationFrames >= minHoldFrames) {
            const startRawTime = featureMap.frames[holdStartFrameIdx].time;
            const endRawTime = featureMap.frames[i - 1].time;

            // Snap to nearest beat grid targets
            const snappedStart = anchorTime + Math.round((startRawTime - anchorTime) / stepDuration) * stepDuration;
            const snappedEnd = anchorTime + Math.round((endRawTime - anchorTime) / stepDuration) * stepDuration;
            const duration = snappedEnd - snappedStart;

            if (duration >= 0.75) {
              // Place hold in center lanes (1 or 2)
              const lane = rng.next() < 0.5 ? 1 : 2;
              const key = `${lane}:${snappedStart.toFixed(4)}`;

              // Only place if it doesn't overwrite a note in the lane
              if (!snappedNotesMap.has(key)) {
                const holdNote: Note = {
                  id: `note_${noteIdCounter++}`,
                  time: snappedStart,
                  type: NoteType.HOLD,
                  lane: lane,
                  duration: duration,
                  velocity: 0.9, // Holds flow slightly slower
                  strength: 0.8,
                };
                snappedNotesMap.set(key, holdNote);
                
                // Block future taps on this exact grid path to avoid overlay overlap
                let blockTime = snappedStart + stepDuration;
                while (blockTime <= snappedEnd) {
                  snappedNotesMap.set(`${lane}:${blockTime.toFixed(4)}`, null as any);
                  blockTime += stepDuration;
                }
              }
            }
          }
          holdStartFrameIdx = -1;
        }
      }
    }

    // Filter and collect all valid snapped notes
    const notes: Note[] = Array.from(snappedNotesMap.values())
      .filter((n) => n !== null && n !== undefined)
      .sort((a, b) => a.time - b.time);

    console.log(`[CORE SYNC] Chart Generated deterministically: ${notes.length} notes, BPM: ${bpm.toFixed(1)}`);

    return {
      difficulty,
      bpm,
      notes,
      unquantized: bpm === 120 && anchorTime === 0, // Fallback flag
      version: this.VERSION,
    };
  }

  /**
   * Offline autocorrelation-based tempo estimator.
   * Returns a BPM between 80 and 180.
   */
  private static estimateBPM(featureMap: FeatureMap, sampleRate: number): number {
    if (featureMap.frameCount < 100) {
      return 120; // Default fallback
    }

    const frameDelta = 512 / sampleRate;
    
    // 1. Build onset density envelope
    const envelope = new Float32Array(featureMap.frameCount);
    for (let i = 0; i < featureMap.frameCount; i++) {
      const f = featureMap.frames[i];
      envelope[i] = f.isOnset ? f.spectralFlux : 0;
    }

    // Real lags: 60 BPM to 200 BPM
    // lagFrames = (60 / BPM) / frameDelta
    const minLag = Math.floor((60 / 200) / frameDelta); // High BPM = small lag
    const maxLag = Math.ceil((60 / 60) / frameDelta);  // Low BPM = high lag

    let bestLag = 0;
    let maxR = -1;

    // 2. Perform autocorrelation
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      let count = 0;
      for (let i = 0; i < featureMap.frameCount - lag; i++) {
        r += envelope[i] * envelope[i + lag];
        count++;
      }
      if (count > 0) {
        r = r / count; // Average
      }

      if (r > maxR) {
        maxR = r;
        bestLag = lag;
      }
    }

    // Convert lag in frames to BPM
    const beatInterval = bestLag * frameDelta;
    let estimatedBPM = 60 / beatInterval;

    // Harmonize BPM into comfortable 80–180 BPM range
    while (estimatedBPM < 80) estimatedBPM *= 2;
    while (estimatedBPM > 180) estimatedBPM /= 2;

    // Round to nearest integer BPM
    estimatedBPM = Math.round(estimatedBPM);

    // If BPM estimate is garbage/flat, return fallback
    if (isNaN(estimatedBPM) || estimatedBPM < 60 || estimatedBPM > 240) {
      return 120;
    }

    return estimatedBPM;
  }

  private static chooseLaneForMidFrequency(midEnergy: number, lowEnergy: number, rng: SeededRandom): number {
    // Spatial spread: low heavy elements go to center lanes, higher elements go outer
    if (lowEnergy > midEnergy * 1.5) {
      return rng.next() < 0.5 ? 1 : 2; // Bass beats in lanes 1 or 2
    } else {
      return rng.nextInt(0, 3); // Spread randomly across all 4 lanes
    }
  }
}
