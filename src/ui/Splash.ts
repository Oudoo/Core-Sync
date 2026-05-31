/**
 * Splash — title screen with upload button.
 * Cyber-minimalist, glassmorphism, dark theme, neon accents.
 * Pure DOM overlay on top of the Pixi canvas.
 */

import { eventBus } from '../core/EventBus';

export class Splash {
  private overlay: HTMLDivElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'splash-overlay';
    this.overlay.innerHTML = `
      <div class="splash-card">
        <div class="splash-logo">
          <div class="splash-ring"></div>
          <h1 class="splash-title">CORE<span class="accent">SYNC</span></h1>
        </div>
        <p class="splash-subtitle">FLUID RESONANCE</p>
        <div class="splash-divider"></div>
        <button id="splash-upload-btn" class="splash-btn">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" class="splash-btn-icon">
            <path d="M10 3v10M10 3l4 4M10 3L6 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          UPLOAD SONG
        </button>
        <p class="splash-formats">mp3 · wav · ogg · m4a</p>
      </div>
    `;

    this.applyStyles();
    document.body.appendChild(this.overlay);

    // Wire upload button
    const btn = this.overlay.querySelector('#splash-upload-btn') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      eventBus.emit('splash:upload');
    });
  }

  private applyStyles(): void {
    const style = document.createElement('style');
    style.id = 'splash-styles';
    style.textContent = `
      #splash-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(ellipse at 50% 40%, rgba(0,40,60,0.5) 0%, rgba(0,0,0,0.95) 70%);
        animation: splashFadeIn 0.6s ease-out;
      }

      @keyframes splashFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .splash-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 3rem 2.5rem;
        background: rgba(10, 20, 30, 0.6);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(0, 255, 200, 0.12);
        border-radius: 24px;
        box-shadow:
          0 0 60px rgba(0, 255, 200, 0.06),
          0 0 120px rgba(0, 180, 255, 0.03),
          inset 0 1px 0 rgba(255,255,255,0.05);
        max-width: 360px;
        width: 85vw;
      }

      .splash-logo {
        position: relative;
        margin-bottom: 0.5rem;
      }

      .splash-ring {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 120px;
        height: 120px;
        transform: translate(-50%, -50%);
        border: 1px solid rgba(0, 255, 200, 0.15);
        border-radius: 50%;
        animation: ringPulse 3s ease-in-out infinite;
      }

      @keyframes ringPulse {
        0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; }
        50% { transform: translate(-50%, -50%) scale(1.15); opacity: 0.08; }
      }

      .splash-title {
        font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif;
        font-size: 2.4rem;
        font-weight: 200;
        letter-spacing: 0.35em;
        color: #e0f0ff;
        text-shadow:
          0 0 20px rgba(0, 255, 200, 0.3),
          0 0 60px rgba(0, 255, 200, 0.1);
        margin: 0;
        position: relative;
      }

      .splash-title .accent {
        font-weight: 600;
        color: #0fCCA0;
        text-shadow:
          0 0 20px rgba(0, 255, 200, 0.5),
          0 0 60px rgba(0, 255, 200, 0.2);
      }

      .splash-subtitle {
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 0.7rem;
        font-weight: 400;
        letter-spacing: 0.5em;
        color: rgba(0, 255, 200, 0.4);
        margin: 0.2rem 0 0;
        text-transform: uppercase;
      }

      .splash-divider {
        width: 60px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(0,255,200,0.3), transparent);
        margin: 2rem 0;
      }

      .splash-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 32px;
        background: rgba(0, 255, 200, 0.06);
        border: 1px solid rgba(0, 255, 200, 0.25);
        border-radius: 12px;
        color: #0fCCA0;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 0.85rem;
        font-weight: 500;
        letter-spacing: 0.15em;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      .splash-btn::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(0,255,200,0.1) 0%, transparent 50%);
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .splash-btn:hover {
        background: rgba(0, 255, 200, 0.12);
        border-color: rgba(0, 255, 200, 0.4);
        box-shadow: 0 0 30px rgba(0, 255, 200, 0.15);
        transform: translateY(-1px);
      }

      .splash-btn:hover::before {
        opacity: 1;
      }

      .splash-btn:active {
        transform: translateY(0);
        background: rgba(0, 255, 200, 0.18);
      }

      .splash-btn-icon {
        flex-shrink: 0;
      }

      .splash-formats {
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 0.65rem;
        color: rgba(255, 255, 255, 0.2);
        letter-spacing: 0.1em;
        margin-top: 1rem;
      }
    `;
    document.head.appendChild(style);
  }

  show(): void {
    this.overlay.style.display = 'flex';
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }

  destroy(): void {
    this.overlay.remove();
    document.getElementById('splash-styles')?.remove();
  }
}
