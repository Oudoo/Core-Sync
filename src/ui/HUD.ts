import { EventBus } from '../core/EventBus';
import { ScoreStats } from '../systems/ScoringSystem';

export class HUD {
  private element: HTMLDivElement;
  private eventBus: EventBus;

  // Dom caches
  private scoreEl!: HTMLDivElement;
  private comboEl!: HTMLDivElement;
  private comboValEl!: HTMLSpanElement;
  private multEl!: HTMLDivElement;
  private energyFillEl!: HTMLDivElement;
  private fpsEl!: HTMLDivElement;

  private unsubscribes: (() => void)[] = [];

  constructor(parent: HTMLElement, eventBus: EventBus) {
    this.eventBus = eventBus;

    this.element = document.createElement('div');
    this.element.id = 'gameplay-hud';
    this.element.className = 'hud-overlay';
    
    this.createLayout();
    parent.appendChild(this.element);

    this.bindEvents();
    this.hide();
  }

  private createLayout(): void {
    this.element.innerHTML = `
      <style>
        .hud-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 2rem 1.5rem;
          font-family: 'Inter', system-ui, sans-serif;
          color: #fff;
          z-index: 100;
          box-sizing: border-box;
          user-select: none;
        }

        /* ── Top Bar (Score & Multiplier) ── */
        .hud-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .hud-score {
          font-size: 2.2rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-shadow: 0 0 10px rgba(0, 255, 255, 0.4);
          font-family: monospace;
        }

        .hud-multiplier-container {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 0.4rem 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.02);
        }

        .hud-multiplier-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #8899aa;
        }

        .hud-multiplier-val {
          font-size: 1.4rem;
          font-weight: 900;
          color: #ffcc00;
          text-shadow: 0 0 8px rgba(255, 204, 0, 0.5);
        }

        /* ── Center Area (Combo Pulse) ── */
        .hud-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex-grow: 1;
        }

        .hud-combo {
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: scale(1.0);
          transition: transform 0.08s ease-out;
          opacity: 0;
        }

        .hud-combo.active {
          opacity: 1;
        }

        .hud-combo.pulse {
          transform: scale(1.22);
        }

        .hud-combo-val {
          font-size: 4rem;
          font-weight: 900;
          letter-spacing: -0.02em;
          color: #ffffff;
          line-height: 1;
          text-shadow: 0 0 15px rgba(0, 255, 255, 0.6);
        }

        .hud-combo-label {
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.25em;
          color: #00ffff;
          margin-top: 0.2rem;
          text-shadow: 0 0 8px rgba(0, 255, 255, 0.4);
        }

        /* ── Bottom Bar (Energy & Controls) ── */
        .hud-bottom {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
        }

        .hud-energy-container {
          width: 100%;
          height: 14px;
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 9999px;
          overflow: hidden;
          padding: 2px;
          box-sizing: border-box;
          box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.8);
        }

        .hud-energy-fill {
          height: 100%;
          width: 100%;
          background: linear-gradient(90deg, #ff00ff, #00ffff);
          border-radius: 9999px;
          box-shadow: 0 0 12px #ff00ff;
          transition: width 0.15s ease-out;
        }

        .hud-controls-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          pointer-events: auto;
        }

        .hud-button {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #8899aa;
          padding: 0.6rem 1.2rem;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .hud-button:hover {
          color: #fff;
          border-color: #00ffff;
          background: rgba(0, 255, 255, 0.1);
          box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
        }

        .hud-fps {
          font-size: 0.75rem;
          font-family: monospace;
          color: #00ffcc;
          opacity: 0.6;
        }
      </style>

      <div class="hud-top">
        <div class="hud-score" id="hud-score-val">000000</div>
        <div class="hud-multiplier-container">
          <span class="hud-multiplier-label">Mult</span>
          <span class="hud-multiplier-val" id="hud-mult-val">1x</span>
        </div>
      </div>

      <div class="hud-center">
        <div class="hud-combo" id="hud-combo-container">
          <span class="hud-combo-val" id="hud-combo-val">0</span>
          <span class="hud-combo-label">Combo</span>
        </div>
      </div>

      <div class="hud-bottom">
        <div class="hud-energy-container">
          <div class="hud-energy-fill" id="hud-energy-fill"></div>
        </div>
        
        <div class="hud-controls-row">
          <button class="hud-button" id="hud-pause-btn">Pause</button>
          <div class="hud-fps" id="hud-fps-val">60 FPS</div>
        </div>
      </div>
    `;

    // Cache elements
    this.scoreEl = this.element.querySelector('#hud-score-val') as HTMLDivElement;
    this.comboEl = this.element.querySelector('#hud-combo-container') as HTMLDivElement;
    this.comboValEl = this.element.querySelector('#hud-combo-val') as HTMLSpanElement;
    this.multEl = this.element.querySelector('#hud-mult-val') as HTMLDivElement;
    this.energyFillEl = this.element.querySelector('#hud-energy-fill') as HTMLDivElement;
    this.fpsEl = this.element.querySelector('#hud-fps-val') as HTMLDivElement;

    // Hook pause button
    const pauseBtn = this.element.querySelector('#hud-pause-btn') as HTMLButtonElement;
    pauseBtn.addEventListener('click', () => {
      this.eventBus.emit('gameplay:pause');
    });
  }

  private bindEvents(): void {
    // 1. Scoring stats update
    const sub1 = this.eventBus.on('score:update', (stats: ScoreStats) => {
      this.scoreEl.innerText = String(stats.score).padStart(6, '0');
      this.multEl.innerText = `${stats.multiplier}x`;
      
      // Energy fill width
      this.energyFillEl.style.width = `${stats.energy * 100}%`;
      
      // Color shifts based on energy level
      if (stats.energy > 0.45) {
        this.energyFillEl.style.background = 'linear-gradient(90deg, #ff00ff, #00ffff)';
        this.energyFillEl.style.boxShadow = '0 0 12px #ff00ff';
      } else if (stats.energy > 0.18) {
        this.energyFillEl.style.background = 'linear-gradient(90deg, #ff8800, #ffcc00)';
        this.energyFillEl.style.boxShadow = '0 0 12px #ff8800';
      } else {
        this.energyFillEl.style.background = '#ff2244';
        this.energyFillEl.style.boxShadow = '0 0 12px #ff2244';
      }
    });

    // 2. Pulse combo on judgments
    const sub2 = this.eventBus.on('score:judgment', ({ judgment, combo }) => {
      if (combo > 0) {
        this.comboEl.classList.add('active');
        this.comboValEl.innerText = String(combo);
        
        // Trigger pulse classes
        this.comboEl.classList.remove('pulse');
        void this.comboEl.offsetWidth; // Force reflow
        this.comboEl.classList.add('pulse');
        
        setTimeout(() => {
          this.comboEl.classList.remove('pulse');
        }, 80);
      } else {
        this.comboEl.classList.remove('active');
      }
    });

    // 3. FPS ticker
    const sub3 = this.eventBus.on('fps:update', (fps: number) => {
      this.fpsEl.innerText = `${fps} FPS`;
    });

    this.unsubscribes.push(sub1, sub2, sub3);
  }

  show(): void {
    this.element.style.display = 'flex';
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  destroy(): void {
    this.unsubscribes.forEach((u) => u());
    this.element.remove();
  }
}
