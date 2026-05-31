import { EventBus } from '../core/EventBus';

export class Calibration {
  private element: HTMLDivElement;
  private eventBus: EventBus;
  private audioCtx: AudioContext;

  // State
  private active = false;
  private bpm = 120;
  private intervalId: any = null;
  private nextTickTime = 0;
  private tickIntervalS = 0.5; // 120 BPM => 0.5s per tick
  private tapTimes: number[] = [];
  private currentOffset = 0;

  // DOM Elements
  private offsetValEl!: HTMLSpanElement;
  private tapPadEl!: HTMLDivElement;

  constructor(parent: HTMLElement, eventBus: EventBus, audioCtx: AudioContext) {
    this.eventBus = eventBus;
    this.audioCtx = audioCtx;

    // Load saved offset
    const saved = localStorage.getItem('core-sync:calibration-offset');
    this.currentOffset = saved ? parseInt(saved, 10) : 0;

    this.element = document.createElement('div');
    this.element.id = 'calibration-screen';
    this.element.className = 'glass-screen';
    
    this.createLayout();
    parent.appendChild(this.element);

    this.bindEvents();
    this.hide();
  }

  private createLayout(): void {
    this.element.innerHTML = `
      <style>
        .glass-screen {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, #0a0b18 0%, #020308 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 3rem 1.5rem;
          font-family: 'Outfit', 'Inter', system-ui, sans-serif;
          color: #fff;
          z-index: 90;
          box-sizing: border-box;
          user-select: none;
        }

        .cal-title {
          font-size: 2.2rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          background: linear-gradient(135deg, #00ffff, #ff00ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 0.5rem;
        }

        .cal-desc {
          font-size: 0.9rem;
          color: #8899aa;
          text-align: center;
          max-width: 320px;
          line-height: 1.5;
        }

        /* ── Visual Target Metronome ── */
        .cal-metronome {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1.5rem;
          margin: 2rem 0;
        }

        .cal-dot {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: all 0.1s ease-out;
        }

        .cal-dot.pulse {
          background: #00ffff;
          box-shadow: 0 0 15px #00ffff;
          transform: scale(1.3);
        }

        /* ── Tap Pad ── */
        .cal-tap-pad {
          width: 240px;
          height: 240px;
          border-radius: 50%;
          border: 2px dashed rgba(0, 255, 255, 0.3);
          background: rgba(0, 255, 255, 0.02);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: inset 0 0 30px rgba(0, 255, 255, 0.02);
        }

        .cal-tap-pad:active {
          border-color: #00ffff;
          background: rgba(0, 255, 255, 0.1);
          box-shadow: inset 0 0 40px rgba(0, 255, 255, 0.2), 0 0 20px rgba(0, 255, 255, 0.2);
          transform: scale(0.96);
        }

        .cal-tap-text {
          font-size: 1.1rem;
          font-weight: 700;
          color: #00ffff;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        /* ── Offset value ── */
        .cal-offset-box {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 1rem 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
        }

        .cal-offset-val {
          font-size: 2.5rem;
          font-weight: 900;
          font-family: monospace;
          color: #ff00ff;
          text-shadow: 0 0 10px rgba(255, 0, 255, 0.5);
        }

        .cal-offset-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #8899aa;
        }

        /* ── Action Buttons ── */
        .cal-buttons {
          display: flex;
          gap: 1rem;
          width: 100%;
          max-width: 320px;
        }

        .cal-btn {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #fff;
          padding: 1rem;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cal-btn-primary {
          background: linear-gradient(135deg, #ff00ff, #00ffff);
          border: none;
        }

        .cal-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0, 255, 255, 0.2);
        }
      </style>

      <div>
        <h2 class="cal-title">Audio Calibration</h2>
        <p class="cal-desc">Tap the pad in sync with the beats. We will calculate your hardware's latency offset in milliseconds.</p>
      </div>

      <div class="cal-metronome" id="cal-metronome-dots">
        <div class="cal-dot"></div>
        <div class="cal-dot"></div>
        <div class="cal-dot"></div>
        <div class="cal-dot"></div>
      </div>

      <div class="cal-tap-pad" id="cal-tap-pad">
        <span class="cal-tap-text">Tap Beat</span>
      </div>

      <div class="cal-offset-box">
        <span class="cal-offset-val" id="cal-offset-value">${this.currentOffset > 0 ? '+' : ''}${this.currentOffset} ms</span>
        <span class="cal-offset-label">Latency Offset</span>
      </div>

      <div class="cal-buttons">
        <button class="cal-btn" id="cal-reset-btn">Reset</button>
        <button class="cal-btn cal-btn-primary" id="cal-save-btn">Save & Back</button>
      </div>
    `;

    this.offsetValEl = this.element.querySelector('#cal-offset-value') as HTMLSpanElement;
    this.tapPadEl = this.element.querySelector('#cal-tap-pad') as HTMLDivElement;
  }

  private bindEvents(): void {
    // Tap event calculation
    this.tapPadEl.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      
      const now = this.audioCtx.currentTime;
      
      // Calculate delta to the closest absolute beat target
      const closestBeatTime = Math.round(now / this.tickIntervalS) * this.tickIntervalS;
      const diffMs = (now - closestBeatTime) * 1000;
      
      // Filter outliers (outside of 200ms)
      if (Math.abs(diffMs) < 220) {
        this.tapTimes.push(diffMs);
        if (this.tapTimes.length > 8) this.tapTimes.shift(); // Keep last 8 taps
        
        // Compute average offset
        const sum = this.tapTimes.reduce((acc, v) => acc + v, 0);
        this.currentOffset = Math.round(sum / this.tapTimes.length);
        
        this.offsetValEl.innerText = `${this.currentOffset > 0 ? '+' : ''}${this.currentOffset} ms`;
      }
    });

    // Reset button
    const resetBtn = this.element.querySelector('#cal-reset-btn') as HTMLButtonElement;
    resetBtn.addEventListener('click', () => {
      this.tapTimes = [];
      this.currentOffset = 0;
      this.offsetValEl.innerText = '0 ms';
    });

    // Save & Exit button
    const saveBtn = this.element.querySelector('#cal-save-btn') as HTMLButtonElement;
    saveBtn.addEventListener('click', () => {
      localStorage.setItem('core-sync:calibration-offset', String(this.currentOffset));
      this.eventBus.emit('calibration:save', this.currentOffset);
      this.hide();
    });
  }

  /**
   * Start metronome beep loop.
   */
  show(): void {
    this.element.style.display = 'flex';
    this.active = true;
    this.tapTimes = [];
    this.nextTickTime = this.audioCtx.currentTime + 0.1;

    const dots = this.element.querySelectorAll('.cal-dot');
    let beatCounter = 0;

    // Standard clock polling oscillator triggers
    this.intervalId = setInterval(() => {
      const now = this.audioCtx.currentTime;
      if (now >= this.nextTickTime) {
        this.playBeep();
        
        // Pulse dots
        const activeDotIdx = beatCounter % 4;
        dots.forEach((d, idx) => {
          if (idx === activeDotIdx) d.classList.add('pulse');
          else d.classList.remove('pulse');
        });

        beatCounter++;
        this.nextTickTime += this.tickIntervalS;
      }
    }, 25);
  }

  private playBeep(): void {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    // Dynamic synth decay
    osc.frequency.setValueAtTime(440, this.audioCtx.currentTime); // A4 note
    gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.08);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.1);
  }

  hide(): void {
    this.active = false;
    this.element.style.display = 'none';
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  get offset(): number {
    return this.currentOffset;
  }
}
