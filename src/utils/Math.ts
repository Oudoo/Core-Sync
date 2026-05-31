/**
 * Math utilities — pure functions, no state, no allocations.
 */

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Linear interpolation.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Map a value from one range to another.
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/**
 * Convert a frequency in Hz to an FFT bin index.
 */
export function freqToBin(freq: number, sampleRate: number, fftSize: number): number {
  return Math.round((freq * fftSize) / sampleRate);
}

/**
 * Convert an FFT bin index to a frequency in Hz.
 */
export function binToFreq(bin: number, sampleRate: number, fftSize: number): number {
  return (bin * sampleRate) / fftSize;
}

/**
 * Simple 32-bit hash of an ArrayBuffer (FNV-1a).
 * Used for deterministic chart caching, not security.
 */
export function hashBuffer(buffer: ArrayBuffer): number {
  const view = new Uint8Array(buffer);
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < view.length; i++) {
    hash ^= view[i];
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0; // Unsigned
}

/**
 * Format seconds as mm:ss.
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
