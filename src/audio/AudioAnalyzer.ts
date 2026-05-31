/**
 * AudioAnalyzer — offline whole-song analysis via windowed FFT over raw samples.
 *
 * NOT using AnalyserNode (that's a real-time node). Instead we:
 * 1. Mono-sum the AudioBuffer's channels.
 * 2. Slide a Hann-windowed FFT across the samples at `hopSize` intervals.
 * 3. Extract per-frame features: RMS, band energies, flux, centroid, rolloff.
 * 4. Post-process to find onsets via adaptive-threshold peak picking.
 *
 * Runs in chunks on the main thread, yielding between chunks so the UI stays
 * responsive. Each chunk processes FRAMES_PER_CHUNK analysis frames (~5 ms
 * of wall-clock time), keeping each slice well under 16 ms.
 *
 * DECISION: Main-thread chunked analysis rather than Web Worker.
 * Simpler (no message serialization), and chunking keeps each slice under
 * the frame budget. A 4-min song at 44.1 kHz / hop 512 ≈ 20 K frames,
 * chunked at 100 frames → ~200 yields → ~2–3 s total. Acceptable.
 */

import { fft, createHannWindow } from '../utils/FFT';
import { freqToBin } from '../utils/Math';
import { Config } from '../core/Config';
import type { AnalysisFrame, FeatureMap } from './FeatureMap';

/** How many frames to process before yielding to the main thread. */
const FRAMES_PER_CHUNK = 100;

/** Minimum inter-onset gap in frames (prevents double-triggers). */
// DECISION: 6 frames ≈ 70 ms at hop 512 / sr 44100. Tight enough for fast
// hi-hats, loose enough to avoid phantom doubles.
const MIN_ONSET_GAP_FRAMES = 6;

/** Window size for the adaptive flux threshold (one side). */
const ONSET_WINDOW_HALF = 7;

/** Multiplier above local mean flux to declare a peak. */
const ONSET_THRESHOLD_MULT = 1.4;

/** Absolute minimum flux to consider as an onset (filters silence). */
const ONSET_FLOOR = 0.005;

export type ProgressCallback = (progress: number) => void;

export class AudioAnalyzer {
  private readonly fftSize: number;
  private readonly hopSize: number;

  // Pre-allocated working buffers (zero allocations in the analysis loop)
  private readonly hannWindow: Float64Array;
  private readonly real: Float64Array;
  private readonly imag: Float64Array;
  private readonly magnitude: Float64Array;     // current frame
  private readonly prevMagnitude: Float64Array;  // previous frame (for flux)

  private prevTotalEnergy: number = 0;

  constructor() {
    this.fftSize = Config.FFT_SIZE;
    this.hopSize = Config.HOP_SIZE;

    const half = this.fftSize / 2;
    this.hannWindow = createHannWindow(this.fftSize);
    this.real = new Float64Array(this.fftSize);
    this.imag = new Float64Array(this.fftSize);
    this.magnitude = new Float64Array(half);
    this.prevMagnitude = new Float64Array(half);
  }

  /**
   * Analyze the entire AudioBuffer offline.
   * Calls `onProgress(0..1)` periodically so the UI can show progress.
   */
  async analyze(
    audioBuffer: AudioBuffer,
    onProgress: ProgressCallback,
  ): Promise<FeatureMap> {
    const sampleRate = audioBuffer.sampleRate;
    const samples = this.monoSum(audioBuffer);
    const totalFrames = Math.max(
      1,
      Math.floor((samples.length - this.fftSize) / this.hopSize) + 1,
    );

    const frames: AnalysisFrame[] = new Array(totalFrames);

    // Reset state
    this.prevMagnitude.fill(0);
    this.prevTotalEnergy = 0;

    // ── Chunked analysis loop ──
    for (let i = 0; i < totalFrames; i++) {
      const offset = i * this.hopSize;
      frames[i] = this.analyzeFrame(samples, offset, sampleRate, i === 0);

      // Yield every FRAMES_PER_CHUNK frames
      if (i % FRAMES_PER_CHUNK === 0 && i > 0) {
        onProgress(i / totalFrames);
        await yieldToMain();
      }
    }

    // ── Post-processing ──
    const peaks = this.computePeaks(frames);
    this.detectOnsets(frames);

    onProgress(1);

    return {
      sampleRate,
      duration: samples.length / sampleRate,
      frameCount: totalFrames,
      hopSize: this.hopSize,
      fftSize: this.fftSize,
      frames,
      peaks,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Analyze a single frame at the given sample offset.
   */
  private analyzeFrame(
    samples: Float32Array,
    offset: number,
    sampleRate: number,
    isFirst: boolean,
  ): AnalysisFrame {
    const half = this.fftSize / 2;

    // ── Apply Hann window and fill FFT input ──
    let rms = 0;
    for (let i = 0; i < this.fftSize; i++) {
      const s = offset + i < samples.length ? samples[offset + i] : 0;
      this.real[i] = s * this.hannWindow[i];
      this.imag[i] = 0;
      rms += s * s;
    }
    rms = Math.sqrt(rms / this.fftSize);

    // ── FFT ──
    fft(this.real, this.imag);

    // ── Magnitude spectrum + total energy ──
    let totalEnergy = 0;
    for (let k = 0; k < half; k++) {
      const re = this.real[k];
      const im = this.imag[k];
      this.magnitude[k] = Math.sqrt(re * re + im * im);
      totalEnergy += this.magnitude[k] * this.magnitude[k];
    }

    // ── Band energies ──
    const lowEnergy = this.bandEnergy(sampleRate, Config.FREQ_LOW_MIN, Config.FREQ_LOW_MAX);
    const midEnergy = this.bandEnergy(sampleRate, Config.FREQ_MID_MIN, Config.FREQ_MID_MAX);
    const highEnergy = this.bandEnergy(sampleRate, Config.FREQ_HIGH_MIN, Config.FREQ_HIGH_MAX);

    // ── Spectral flux (half-wave rectified) ──
    let spectralFlux = 0;
    if (!isFirst) {
      for (let k = 0; k < half; k++) {
        const diff = this.magnitude[k] - this.prevMagnitude[k];
        if (diff > 0) spectralFlux += diff;
      }
    }

    // ── Spectral centroid ──
    let centroidNum = 0;
    let centroidDen = 0;
    for (let k = 0; k < half; k++) {
      const freq = (k * sampleRate) / this.fftSize;
      centroidNum += freq * this.magnitude[k];
      centroidDen += this.magnitude[k];
    }
    const spectralCentroid = centroidDen > 0 ? centroidNum / centroidDen : 0;

    // ── Spectral rolloff (85%) ──
    const rolloffThreshold = totalEnergy * 0.85;
    let rolloffAccum = 0;
    let rolloffBin = half - 1;
    for (let k = 0; k < half; k++) {
      rolloffAccum += this.magnitude[k] * this.magnitude[k];
      if (rolloffAccum >= rolloffThreshold) {
        rolloffBin = k;
        break;
      }
    }
    const spectralRolloff = (rolloffBin * sampleRate) / this.fftSize;

    // ── Energy delta ──
    const energyDelta = totalEnergy - this.prevTotalEnergy;
    this.prevTotalEnergy = totalEnergy;

    // ── Save magnitude for next frame's flux ──
    this.prevMagnitude.set(this.magnitude);

    return {
      time: offset / sampleRate,
      rms,
      lowEnergy,
      midEnergy,
      highEnergy,
      totalEnergy,
      spectralFlux,
      spectralCentroid,
      spectralRolloff,
      energyDelta,
      isPeak: false,
      isOnset: false,
    };
  }

  /**
   * Sum energy (squared magnitudes) in the frequency band [freqMin, freqMax].
   */
  private bandEnergy(sampleRate: number, freqMin: number, freqMax: number): number {
    const binMin = freqToBin(freqMin, sampleRate, this.fftSize);
    const binMax = Math.min(
      freqToBin(freqMax, sampleRate, this.fftSize),
      this.fftSize / 2 - 1,
    );
    let energy = 0;
    for (let k = binMin; k <= binMax; k++) {
      energy += this.magnitude[k] * this.magnitude[k];
    }
    return energy;
  }

  /**
   * Compute peak values across all frames for later normalization.
   */
  private computePeaks(frames: AnalysisFrame[]): FeatureMap['peaks'] {
    let rms = 0, low = 0, mid = 0, high = 0, flux = 0;
    for (const f of frames) {
      if (f.rms > rms) rms = f.rms;
      if (f.lowEnergy > low) low = f.lowEnergy;
      if (f.midEnergy > mid) mid = f.midEnergy;
      if (f.highEnergy > high) high = f.highEnergy;
      if (f.spectralFlux > flux) flux = f.spectralFlux;
    }
    return { rms, lowEnergy: low, midEnergy: mid, highEnergy: high, spectralFlux: flux };
  }

  /**
   * Detect onsets using adaptive-threshold peak picking on spectral flux.
   *
   * Algorithm:
   * 1. For each frame, compute a local mean of flux over a sliding window.
   * 2. A frame is a "peak" if its flux exceeds (localMean × multiplier + floor)
   *    AND it's a local maximum in a ±1-frame neighborhood.
   * 3. Enforce a minimum inter-onset gap to prevent double-triggers.
   */
  private detectOnsets(frames: AnalysisFrame[]): void {
    const n = frames.length;
    if (n === 0) return;

    // Step 1 & 2: adaptive threshold + local max
    for (let i = 1; i < n - 1; i++) {
      // Local mean over [i - W, i + W]
      const lo = Math.max(0, i - ONSET_WINDOW_HALF);
      const hi = Math.min(n - 1, i + ONSET_WINDOW_HALF);
      let sum = 0;
      for (let j = lo; j <= hi; j++) {
        sum += frames[j].spectralFlux;
      }
      const localMean = sum / (hi - lo + 1);
      const threshold = localMean * ONSET_THRESHOLD_MULT + ONSET_FLOOR;

      const flux = frames[i].spectralFlux;
      const isLocalMax =
        flux > frames[i - 1].spectralFlux &&
        flux >= frames[i + 1].spectralFlux;

      frames[i].isPeak = flux > threshold && isLocalMax;
    }

    // Step 3: enforce minimum gap
    let lastOnset = -MIN_ONSET_GAP_FRAMES - 1;
    for (let i = 0; i < n; i++) {
      if (frames[i].isPeak && i - lastOnset >= MIN_ONSET_GAP_FRAMES) {
        frames[i].isOnset = true;
        lastOnset = i;
      }
    }
  }

  /**
   * Mono-sum all channels of an AudioBuffer into a single Float32Array.
   */
  private monoSum(audioBuffer: AudioBuffer): Float32Array {
    const length = audioBuffer.length;
    const channels = audioBuffer.numberOfChannels;

    if (channels === 1) {
      return audioBuffer.getChannelData(0);
    }

    const mono = new Float32Array(length);
    for (let ch = 0; ch < channels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mono[i] += data[i];
      }
    }
    const scale = 1 / channels;
    for (let i = 0; i < length; i++) {
      mono[i] *= scale;
    }
    return mono;
  }
}

/**
 * Yield control to the main thread so the UI can repaint.
 * DECISION: setTimeout(0) — simpler than requestIdleCallback,
 * and the ~4ms minimum delay is negligible over 200 yields.
 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
