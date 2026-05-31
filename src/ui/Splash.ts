/**
 * Splash — title screen.
 *
 * Upload button: a <label> tied to a real <input type="file"> so iOS Safari
 * opens the native file picker directly without any programmatic .click().
 * The file input is visually hidden using the WCAG clip pattern (NOT
 * display:none which blocks iOS) so the label activates it correctly.
 *
 * Library button: shown when savedCount > 0. Opens the song list directly
 * without re-uploading — songs persist in IndexedDB across sessions.
 */

import { eventBus } from '../core/EventBus';
import { ACCEPTED_EXTENSIONS } from '../audio/SongLoader';

export class Splash {
  private overlay: HTMLDivElement;
  private fileInput: HTMLInputElement;
  private libraryBtn!: HTMLButtonElement;
  private libraryCount!: HTMLSpanElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'splash-overlay';

    // Visually-hidden file input — works on iOS Safari; NOT display:none
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.id = 'splash-file-input';
    this.fileInput.accept = ACCEPTED_EXTENSIONS;
    this.fileInput.setAttribute('aria-hidden', 'true');
    Object.assign(this.fileInput.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0,0,0,0)',
      whiteSpace: 'nowrap',
      borderWidth: '0',
    });

    this.overlay.innerHTML = `
      <div class="splash-card">
        <div class="splash-logo">
          <div class="splash-ring"></div>
          <h1 class="splash-title">CORE<span class="accent">SYNC</span></h1>
        </div>
        <p class="splash-subtitle">FLUID RESONANCE</p>
        <div class="splash-divider"></div>

        <label for="splash-file-input" class="splash-btn splash-btn-primary">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" class="splash-btn-icon">
            <path d="M10 3v10M10 3l4 4M10 3L6 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          UPLOAD SONG
        </label>

        <button id="splash-library-btn" class="splash-btn splash-btn-library" style="display:none">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" class="splash-btn-icon">
            <rect x="2" y="3" width="16" height="3" rx="1" stroke="currentColor" stroke-width="1.4"/>
            <rect x="2" y="8.5" width="16" height="3" rx="1" stroke="currentColor" stroke-width="1.4"/>
            <rect x="2" y="14" width="16" height="3" rx="1" stroke="currentColor" stroke-width="1.4"/>
          </svg>
          MY LIBRARY
          <span id="splash-library-count" class="splash-count">0</span>
        </button>

        <p class="splash-formats">mp3 · wav · ogg · m4a</p>
      </div>
    `;

    this.applyStyles();
    document.body.appendChild(this.overlay);
    this.overlay.appendChild(this.fileInput);

    this.libraryBtn = this.overlay.querySelector('#splash-library-btn') as HTMLButtonElement;
    this.libraryCount = this.overlay.querySelector('#splash-library-count') as HTMLSpanElement;

    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) eventBus.emit('splash:fileSelected', file);
    });

    this.libraryBtn.addEventListener('click', () => {
      eventBus.emit('splash:openLibrary');
    });
  }

  /** Call after loading the IndexedDB count on startup. */
  setSavedCount(count: number): void {
    if (count > 0) {
      this.libraryCount.textContent = String(count);
      this.libraryBtn.style.display = 'flex';
    } else {
      this.libraryBtn.style.display = 'none';
    }
  }

  private applyStyles(): void {
    const style = document.createElement('style');
    style.id = 'splash-styles';
    style.textContent = `
      #splash-overlay {
        position: fixed; inset: 0; z-index: 1000;
        display: flex; align-items: center; justify-content: center;
        background: radial-gradient(ellipse at 50% 40%, rgba(0,40,60,.5) 0%, rgba(0,0,0,.95) 70%);
        animation: splashFadeIn .6s ease-out;
      }
      @keyframes splashFadeIn { from { opacity:0 } to { opacity:1 } }

      .splash-card {
        display: flex; flex-direction: column; align-items: center;
        padding: 3rem 2.5rem; gap: 0;
        background: rgba(10,20,30,.6);
        backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(0,255,200,.12); border-radius: 24px;
        box-shadow: 0 0 60px rgba(0,255,200,.06), inset 0 1px 0 rgba(255,255,255,.05);
        max-width: 360px; width: 85vw;
      }

      .splash-logo { position: relative; margin-bottom: .5rem; }
      .splash-ring {
        position: absolute; top: 50%; left: 50%;
        width: 120px; height: 120px;
        transform: translate(-50%,-50%);
        border: 1px solid rgba(0,255,200,.15); border-radius: 50%;
        animation: ringPulse 3s ease-in-out infinite;
      }
      @keyframes ringPulse {
        0%,100%{ transform:translate(-50%,-50%) scale(1); opacity:.3 }
        50%    { transform:translate(-50%,-50%) scale(1.15); opacity:.08 }
      }
      .splash-title {
        font-family: 'Inter','SF Pro Display',system-ui,sans-serif;
        font-size: 2.4rem; font-weight: 200; letter-spacing: .35em;
        color: #e0f0ff; margin: 0; position: relative;
        text-shadow: 0 0 20px rgba(0,255,200,.3);
      }
      .splash-title .accent { font-weight: 600; color: #0fCCA0; }
      .splash-subtitle {
        font-size: .7rem; letter-spacing: .5em;
        color: rgba(0,255,200,.4); margin: .2rem 0 0; text-transform: uppercase;
        font-family: 'Inter',system-ui,sans-serif;
      }
      .splash-divider {
        width: 60px; height: 1px;
        background: linear-gradient(90deg,transparent,rgba(0,255,200,.3),transparent);
        margin: 2rem 0 1.2rem;
      }

      .splash-btn {
        display: flex; align-items: center; gap: 10px;
        padding: 14px 28px; border-radius: 12px;
        font-family: 'Inter',system-ui,sans-serif;
        font-size: .82rem; font-weight: 500; letter-spacing: .15em;
        cursor: pointer; transition: all .25s ease;
        -webkit-tap-highlight-color: transparent;
        user-select: none; -webkit-user-select: none;
        text-decoration: none; width: 100%; box-sizing: border-box;
        justify-content: center; margin-bottom: .75rem;
      }
      .splash-btn-primary {
        background: rgba(0,255,200,.07);
        border: 1px solid rgba(0,255,200,.3);
        color: #0fCCA0;
      }
      .splash-btn-primary:hover, .splash-btn-primary:active {
        background: rgba(0,255,200,.14);
        border-color: rgba(0,255,200,.5);
        box-shadow: 0 0 24px rgba(0,255,200,.15);
      }
      .splash-btn-library {
        background: rgba(100,100,255,.06);
        border: 1px solid rgba(100,100,255,.25);
        color: #aaccff;
      }
      .splash-btn-library:hover, .splash-btn-library:active {
        background: rgba(100,100,255,.14);
        border-color: rgba(100,100,255,.45);
      }
      .splash-count {
        background: rgba(0,255,200,.15);
        color: #0fCCA0; border-radius: 99px;
        padding: 1px 8px; font-size: .72rem; font-weight: 700;
        min-width: 20px; text-align: center;
      }
      .splash-btn-icon { flex-shrink: 0; }
      .splash-formats {
        font-size: .63rem; color: rgba(255,255,255,.2);
        letter-spacing: .1em; margin-top: .25rem;
        font-family: 'Inter',system-ui,sans-serif;
      }
    `;
    document.head.appendChild(style);
  }

  show(): void { this.overlay.style.display = 'flex'; }
  hide(): void { this.overlay.style.display = 'none'; }

  destroy(): void {
    this.overlay.remove();
    document.getElementById('splash-styles')?.remove();
  }
}
