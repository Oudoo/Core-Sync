/**
 * ProcessingScreen — shows analysis progress with a real progress bar.
 * Driven by the AudioAnalyzer's progress callback (0..1).
 */

export class ProcessingScreen {
  private overlay: HTMLDivElement;
  private progressFill: HTMLDivElement;
  private percentText: HTMLSpanElement;
  private statusText: HTMLParagraphElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'processing-overlay';
    this.overlay.innerHTML = `
      <div class="proc-card">
        <div class="proc-wave">
          <div class="proc-wave-bar" style="--i:0"></div>
          <div class="proc-wave-bar" style="--i:1"></div>
          <div class="proc-wave-bar" style="--i:2"></div>
          <div class="proc-wave-bar" style="--i:3"></div>
          <div class="proc-wave-bar" style="--i:4"></div>
        </div>
        <p class="proc-title">ANALYZING</p>
        <p id="proc-status" class="proc-status">Decoding audio...</p>
        <div class="proc-bar-track">
          <div id="proc-bar-fill" class="proc-bar-fill"></div>
        </div>
        <span id="proc-percent" class="proc-percent">0%</span>
      </div>
    `;

    this.applyStyles();
    document.body.appendChild(this.overlay);

    this.progressFill = this.overlay.querySelector('#proc-bar-fill') as HTMLDivElement;
    this.percentText = this.overlay.querySelector('#proc-percent') as HTMLSpanElement;
    this.statusText = this.overlay.querySelector('#proc-status') as HTMLParagraphElement;

    this.overlay.style.display = 'none';
  }

  private applyStyles(): void {
    const style = document.createElement('style');
    style.id = 'processing-styles';
    style.textContent = `
      #processing-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.92);
        animation: procFadeIn 0.4s ease;
      }

      @keyframes procFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .proc-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 2.5rem 2rem;
        background: rgba(10, 20, 30, 0.5);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(0, 255, 200, 0.08);
        border-radius: 20px;
        min-width: 280px;
      }

      .proc-wave {
        display: flex;
        gap: 4px;
        margin-bottom: 1.5rem;
        height: 32px;
        align-items: center;
      }

      .proc-wave-bar {
        width: 3px;
        height: 8px;
        background: #0fCCA0;
        border-radius: 2px;
        animation: waveAnim 1.2s ease-in-out infinite;
        animation-delay: calc(var(--i) * 0.15s);
      }

      @keyframes waveAnim {
        0%, 100% { height: 8px; opacity: 0.4; }
        50% { height: 28px; opacity: 1; }
      }

      .proc-title {
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.4em;
        color: rgba(0, 255, 200, 0.6);
        margin: 0 0 0.3rem;
      }

      .proc-status {
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.35);
        margin: 0 0 1.5rem;
        letter-spacing: 0.05em;
      }

      .proc-bar-track {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 2px;
        overflow: hidden;
      }

      .proc-bar-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #0fCCA0, #0af0e0);
        border-radius: 2px;
        transition: width 0.15s ease-out;
        box-shadow: 0 0 12px rgba(0, 255, 200, 0.4);
      }

      .proc-percent {
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 500;
        color: rgba(0, 255, 200, 0.5);
        margin-top: 0.75rem;
        letter-spacing: 0.1em;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update the progress bar and percentage.
   * @param progress 0..1
   */
  setProgress(progress: number): void {
    const pct = Math.round(progress * 100);
    this.progressFill.style.width = `${pct}%`;
    this.percentText.textContent = `${pct}%`;
  }

  /**
   * Update the status label (e.g. "Decoding audio...", "Extracting features...").
   */
  setStatus(text: string): void {
    this.statusText.textContent = text;
  }

  show(): void {
    this.overlay.style.display = 'flex';
    this.setProgress(0);
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }

  destroy(): void {
    this.overlay.remove();
    document.getElementById('processing-styles')?.remove();
  }
}
