import { EventBus } from '../core/EventBus';
import { ScoreStats } from '../systems/ScoringSystem';

export class Results {
  private element: HTMLDivElement;
  private eventBus: EventBus;

  // DOM elements
  private scoreEl!: HTMLSpanElement;
  private accEl!: HTMLSpanElement;
  private comboEl!: HTMLSpanElement;
  private perfEl!: HTMLSpanElement;
  private greatEl!: HTMLSpanElement;
  private goodEl!: HTMLSpanElement;
  private missEl!: HTMLSpanElement;

  constructor(parent: HTMLElement, eventBus: EventBus) {
    this.eventBus = eventBus;

    this.element = document.createElement('div');
    this.element.id = 'results-screen';
    this.element.className = 'glass-screen';

    this.createLayout();
    parent.appendChild(this.element);

    this.bindEvents();
    this.hide();
  }

  private createLayout(): void {
    this.element.innerHTML = `
      <style>
        .res-container {
          width: 100%;
          max-width: 340px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          height: 100%;
          justify-content: space-between;
        }

        .res-title {
          font-size: 2.2rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-align: center;
          background: linear-gradient(135deg, #00ffff, #ff00ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* ── Huge Scoreboard display ── */
        .res-scoreboard {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 1.5rem;
        }

        .res-score-val {
          font-size: 2.6rem;
          font-weight: 900;
          font-family: monospace;
          color: #fff;
          text-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
        }

        .res-acc-val {
          font-size: 1.6rem;
          font-weight: 800;
          color: #ff00ff;
          text-shadow: 0 0 8px rgba(255, 0, 255, 0.3);
        }

        .res-combo-val {
          font-size: 0.95rem;
          color: #8899aa;
        }

        /* ── Detailed stats rows ── */
        .res-stats-table {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .res-row {
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          padding-bottom: 0.4rem;
          font-size: 0.9rem;
        }

        .res-label {
          color: #8899aa;
          font-weight: 500;
        }

        .res-val {
          font-weight: 700;
          font-family: monospace;
        }

        .res-val.perfect { color: #00ffff; }
        .res-val.great { color: #00ff88; }
        .res-val.good { color: #ffcc00; }
        .res-val.miss { color: #ff2244; }

        /* ── Actions ── */
        .res-actions {
          display: flex;
          gap: 1rem;
          pointer-events: auto;
        }
      </style>

      <div class="res-container">
        <h2 class="res-title">Clear</h2>

        <div class="res-scoreboard">
          <span class="res-score-val" id="res-score-val">000000</span>
          <span class="res-acc-val" id="res-acc-val">100.00%</span>
          <span class="res-combo-val" id="res-max-combo">Max Combo: 0</span>
        </div>

        <div class="res-stats-table">
          <div class="res-row">
            <span class="res-label">Perfect</span>
            <span class="res-val perfect" id="res-perf-val">0</span>
          </div>
          <div class="res-row">
            <span class="res-label">Great</span>
            <span class="res-val great" id="res-great-val">0</span>
          </div>
          <div class="res-row">
            <span class="res-label">Good</span>
            <span class="res-val good" id="res-good-val">0</span>
          </div>
          <div class="res-row">
            <span class="res-label">Miss</span>
            <span class="res-val miss" id="res-miss-val">0</span>
          </div>
        </div>

        <div class="res-actions">
          <button class="cal-btn" id="res-menu-btn">Tracks</button>
          <button class="cal-btn cal-btn-primary" id="res-replay-btn">Replay</button>
        </div>
      </div>
    `;

    this.scoreEl = this.element.querySelector('#res-score-val') as HTMLSpanElement;
    this.accEl = this.element.querySelector('#res-acc-val') as HTMLSpanElement;
    this.comboEl = this.element.querySelector('#res-max-combo') as HTMLSpanElement;
    
    this.perfEl = this.element.querySelector('#res-perf-val') as HTMLSpanElement;
    this.greatEl = this.element.querySelector('#res-great-val') as HTMLSpanElement;
    this.goodEl = this.element.querySelector('#res-good-val') as HTMLSpanElement;
    this.missEl = this.element.querySelector('#res-miss-val') as HTMLSpanElement;
  }

  private bindEvents(): void {
    // Menu click
    const menuBtn = this.element.querySelector('#res-menu-btn') as HTMLButtonElement;
    menuBtn.addEventListener('click', () => {
      this.eventBus.emit('results:menu');
    });

    // Replay click
    const replayBtn = this.element.querySelector('#res-replay-btn') as HTMLButtonElement;
    replayBtn.addEventListener('click', () => {
      this.eventBus.emit('results:replay');
    });
  }

  /**
   * Set stats and show summary page.
   */
  setStats(stats: ScoreStats, songId: string, diff: string): void {
    this.scoreEl.innerText = String(stats.score).padStart(6, '0');
    this.comboEl.innerText = `Max Combo: ${stats.maxCombo}`;

    this.perfEl.innerText = String(stats.perfects);
    this.greatEl.innerText = String(stats.greats);
    this.goodEl.innerText = String(stats.goods);
    this.missEl.innerText = String(stats.misses);

    // Compute accuracy percentage
    const totalHits = stats.perfects + stats.greats + stats.goods + stats.misses;
    let accuracy = 100.0;
    
    if (totalHits > 0) {
      const weighted = stats.perfects * 1.0 + stats.greats * 0.75 + stats.goods * 0.5;
      accuracy = (weighted / totalHits) * 100.0;
    }

    this.accEl.innerText = `${accuracy.toFixed(2)}%`;

    // Save to Highscores locally if it beats personal record
    const key = `core-sync:score:${songId}:${diff}`;
    const saved = localStorage.getItem(key);
    const prevBest = saved ? parseInt(saved, 10) : 0;
    
    if (stats.score > prevBest) {
      localStorage.setItem(key, String(stats.score));
    }
  }

  show(): void {
    this.element.style.display = 'flex';
  }

  hide(): void {
    this.element.style.display = 'none';
  }
}
