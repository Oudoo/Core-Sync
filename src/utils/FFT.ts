/**
 * FFT — Radix-2 Cooley-Tukey in-place Fast Fourier Transform.
 *
 * Operates on pre-allocated Float64Array buffers — zero allocations.
 * Only works for power-of-2 sizes (enforced by the caller using FFT_SIZE=2048).
 *
 * DECISION: Float64Array for precision in frequency analysis.
 * The perf cost vs Float32 is negligible for offline analysis.
 */

/**
 * In-place FFT. Modifies `real` and `imag` in place.
 * @param real - Real part of the signal (length must be power of 2)
 * @param imag - Imaginary part (should be zero-filled for real input)
 */
export function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;

  // ── Bit-reversal permutation ──
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;

    if (i < j) {
      // Swap real
      const tmpR = real[i];
      real[i] = real[j];
      real[j] = tmpR;
      // Swap imag
      const tmpI = imag[i];
      imag[i] = imag[j];
      imag[j] = tmpI;
    }
  }

  // ── Butterfly stages ──
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;

      for (let j = 0; j < halfLen; j++) {
        const evenIdx = i + j;
        const oddIdx = i + j + halfLen;

        const uRe = real[evenIdx];
        const uIm = imag[evenIdx];

        const vRe = real[oddIdx] * curRe - imag[oddIdx] * curIm;
        const vIm = real[oddIdx] * curIm + imag[oddIdx] * curRe;

        real[evenIdx] = uRe + vRe;
        imag[evenIdx] = uIm + vIm;
        real[oddIdx] = uRe - vRe;
        imag[oddIdx] = uIm - vIm;

        // Rotate twiddle factor
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }
}

/**
 * Create a Hann window of the given size. Allocated once, reused forever.
 */
export function createHannWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  const factor = (2 * Math.PI) / (size - 1);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos(factor * i));
  }
  return window;
}
