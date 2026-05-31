/**
 * Clock — the single source of truth for gameplay time.
 *
 * Wraps AudioContext.currentTime. Every system that needs "what time is it in
 * the song" reads from here. The offset (from calibration) is applied once,
 * centrally, so individual systems never need to know about it.
 *
 * DECISION: Clock does NOT tick on its own. It is read by systems each frame.
 * This avoids drift from accumulated deltas — positions are always a pure
 * function of the clock's instantaneous reading.
 */

export class Clock {
  private audioContext: AudioContext | null = null;
  private songStartTime: number = 0; // audioContext.currentTime when the song started
  private pauseTime: number = 0;     // song-time at moment of pause
  private _paused: boolean = true;
  private _calibrationOffset: number = 0; // ms, from calibration system

  /**
   * Bind the clock to an AudioContext. Must be called before use.
   */
  setAudioContext(ctx: AudioContext): void {
    this.audioContext = ctx;
  }

  /**
   * Mark the moment the song starts playing.
   * Call this at the exact instant the AudioBufferSourceNode starts.
   */
  start(audioContextTimeAtStart: number): void {
    this.songStartTime = audioContextTimeAtStart;
    this.pauseTime = 0;
    this._paused = false;
  }

  /**
   * Pause the clock. Captures current song time so we can resume later.
   */
  pause(): void {
    if (!this._paused) {
      this.pauseTime = this.songTime;
      this._paused = true;
    }
  }

  /**
   * Resume from pause.
   */
  resume(audioContextTimeAtResume: number): void {
    if (this._paused && this.audioContext) {
      this.songStartTime = audioContextTimeAtResume - this.pauseTime;
      this._paused = false;
    }
  }

  /**
   * Reset the clock (between songs).
   */
  reset(): void {
    this.songStartTime = 0;
    this.pauseTime = 0;
    this._paused = true;
  }

  /**
   * The current song time in seconds. This is the master value that drives
   * all note positions: position = f(clock.songTime).
   *
   * Applies calibration offset internally.
   */
  get songTime(): number {
    if (this._paused) {
      return this.pauseTime;
    }
    if (!this.audioContext) {
      return 0;
    }
    const raw = this.audioContext.currentTime - this.songStartTime;
    // Calibration offset is in ms, convert to seconds
    return raw - this._calibrationOffset / 1000;
  }

  /**
   * Raw audioContext.currentTime (for scheduling, not for gameplay positions).
   */
  get audioTime(): number {
    return this.audioContext?.currentTime ?? 0;
  }

  get paused(): boolean {
    return this._paused;
  }

  /**
   * Set the calibration offset in milliseconds.
   * Positive = audio is perceived late (device has output latency).
   */
  set calibrationOffset(ms: number) {
    this._calibrationOffset = ms;
  }

  get calibrationOffset(): number {
    return this._calibrationOffset;
  }
}
