import { Clock } from '../core/Clock';

export class AudioSystem {
  private audioCtx: AudioContext;
  private clock: Clock;

  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode;
  private analyserNode: AnalyserNode;

  private startTime = 0; // In AudioContext time
  private elapsedPauseTime = 0; // In seconds
  private isPlaying = false;

  // Float arrays for real-time visual analysis (Phase 5 reactive background)
  private freqData: Uint8Array;
  private timeData: Uint8Array;

  constructor(audioCtx: AudioContext, clock: Clock) {
    this.audioCtx = audioCtx;
    this.clock = clock;
    this.clock.setAudioContext(audioCtx);

    // Audio node routing
    this.gainNode = this.audioCtx.createGain();
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 512;

    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioCtx.destination);

    this.freqData = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.timeData = new Uint8Array(this.analyserNode.frequencyBinCount);
  }

  /**
   * Set the active audio buffer.
   */
  setBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
    this.elapsedPauseTime = 0;
    this.isPlaying = false;
  }

  /**
   * Play the song from the current playback cursor.
   */
  play(offsetSeconds: number = 0): void {
    if (!this.buffer) return;

    this.stopNode();

    // Create a new source node (AudioBufferSourceNode can only be started once)
    this.source = this.audioCtx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.gainNode);

    this.isPlaying = true;
    this.elapsedPauseTime = offsetSeconds;

    // Start playing
    const ctxTime = this.audioCtx.currentTime;
    this.startTime = ctxTime - offsetSeconds;
    this.source.start(0, offsetSeconds);

    // Sync Master Clock
    this.clock.start(this.startTime);
    if (offsetSeconds > 0) {
      this.clock.resume(ctxTime);
    }
  }

  /**
   * Pause playback.
   */
  pause(): void {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    this.elapsedPauseTime = this.clock.songTime;

    this.stopNode();
    this.clock.pause();
  }

  /**
   * Resume playback from pause.
   */
  resume(): void {
    if (this.isPlaying) return;
    this.play(this.elapsedPauseTime);
  }

  /**
   * Seek to a specific timestamp in seconds.
   */
  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.duration));
    if (this.isPlaying) {
      this.play(clamped);
    } else {
      this.elapsedPauseTime = clamped;
      // Update Clock pause state time
      this.clock.reset();
      this.clock.pause();
      // Directly set Clock's internal pauseTime by tricking it via resume/pause
      this.clock.start(this.audioCtx.currentTime - clamped);
      this.clock.pause();
    }
  }

  /**
   * Terminate all ongoing audio processes.
   */
  stop(): void {
    this.isPlaying = false;
    this.elapsedPauseTime = 0;
    this.stopNode();
    this.clock.reset();
  }

  /**
   * Extract real-time low, mid, and high frequency energies.
   * Returns normalised float coefficients (0.0 to 1.0) for visual breathing.
   */
  getRealtimeEnergy(): { low: number; mid: number; high: number; total: number } {
    if (!this.isPlaying) {
      return { low: 0, mid: 0, high: 0, total: 0 };
    }

    this.analyserNode.getByteFrequencyData(this.freqData as any);

    const length = this.freqData.length;
    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;

    const lowEnd = Math.floor(length * 0.1);    // Bass
    const midEnd = Math.floor(length * 0.6);    // Midrange
    
    for (let i = 0; i < length; i++) {
      const val = this.freqData[i] / 255.0;
      if (i < lowEnd) lowSum += val;
      else if (i < midEnd) midSum += val;
      else highSum += val;
    }

    const lowScale = lowEnd;
    const midScale = midEnd - lowEnd;
    const highScale = length - midEnd;

    const low = lowScale > 0 ? lowSum / lowScale : 0;
    const mid = midScale > 0 ? midSum / midScale : 0;
    const high = highScale > 0 ? highSum / highScale : 0;
    const total = (low + mid + high) / 3.0;

    return { low, mid, high, total };
  }

  get duration(): number {
    return this.buffer ? this.buffer.duration : 0;
  }

  get currentTime(): number {
    return this.clock.songTime;
  }

  get active(): boolean {
    return this.isPlaying;
  }

  private stopNode(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Source may not have started yet or already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  destroy(): void {
    this.stop();
    this.gainNode.disconnect();
    this.analyserNode.disconnect();
  }
}
