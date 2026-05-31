import { EventBus } from '../core/EventBus';
import { Difficulty } from '../chart/Chart';

export interface SelectedSong {
  id: string;
  name: string;
  bpm: number;
  duration: number;
  buffer: AudioBuffer;
}

export class SongSelect {
  private element: HTMLDivElement;
  private eventBus: EventBus;

  private songsList: SelectedSong[] = [];
  private selectedSongIndex: number = -1;
  private selectedDifficulty: Difficulty = Difficulty.NORMAL;

  // DOM caches
  private tracksContainerEl!: HTMLDivElement;
  private diffButtonsEl!: HTMLDivElement;
  private highscoreValEl!: HTMLSpanElement;

  constructor(parent: HTMLElement, eventBus: EventBus) {
    this.eventBus = eventBus;

    this.element = document.createElement('div');
    this.element.id = 'song-select-screen';
    this.element.className = 'glass-screen';

    this.createLayout();
    parent.appendChild(this.element);

    this.bindEvents();
    this.hide();
  }

  private createLayout(): void {
    this.element.innerHTML = `
      <style>
        .song-select-container {
          width: 100%;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          height: 100%;
          justify-content: space-between;
        }

        .select-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .select-title {
          font-size: 1.8rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #00ffff;
          text-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
        }

        .tracks-list-scroll {
          flex-grow: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          max-height: 48vh;
          padding-right: 0.4rem;
        }

        /* Custom scrollbar */
        .tracks-list-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .tracks-list-scroll::-webkit-scrollbar-thumb {
          background: rgba(0, 255, 255, 0.3);
          border-radius: 99px;
        }

        .track-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s;
          pointer-events: auto;
        }

        .track-card:hover, .track-card.active {
          border-color: #00ffff;
          background: rgba(0, 255, 255, 0.05);
          box-shadow: 0 0 15px rgba(0, 255, 255, 0.1);
        }

        .track-info {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .track-name {
          font-weight: 700;
          font-size: 1rem;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
        }

        .track-meta {
          font-size: 0.75rem;
          color: #8899aa;
        }

        /* ── Difficulty row ── */
        .diff-selection {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .diff-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #8899aa;
        }

        .diff-row {
          display: flex;
          gap: 0.5rem;
          pointer-events: auto;
        }

        .diff-btn {
          flex: 1;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 0.6rem 0.2rem;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          cursor: pointer;
          color: #8899aa;
          transition: all 0.2s;
        }

        .diff-btn.active.easy { border-color: #00ff88; color: #00ff88; background: rgba(0, 255, 136, 0.1); }
        .diff-btn.active.normal { border-color: #00ffff; color: #00ffff; background: rgba(0, 255, 255, 0.1); }
        .diff-btn.active.hard { border-color: #ff8800; color: #ff8800; background: rgba(255, 136, 0, 0.1); }
        .diff-btn.active.extreme { border-color: #ff00ff; color: #ff00ff; background: rgba(255, 0, 255, 0.1); }

        /* ── Highscore display ── */
        .highscore-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .highscore-title {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #8899aa;
        }

        .highscore-val {
          font-size: 1.6rem;
          font-weight: 900;
          font-family: monospace;
          color: #ffcc00;
          text-shadow: 0 0 10px rgba(255, 204, 0, 0.4);
        }

        /* ── Actions ── */
        .select-actions {
          display: flex;
          gap: 1rem;
          pointer-events: auto;
        }
      </style>

      <div class="song-select-container">
        <div class="select-header">
          <h2 class="select-title">Tracks</h2>
          <button class="cal-btn" style="padding:0.4rem 0.8rem; font-size:0.75rem;" id="select-cal-btn">Latency</button>
        </div>

        <div class="tracks-list-scroll" id="select-tracks-container">
          <div style="color:#8899aa; text-align:center; padding:2rem; font-size:0.9rem;">
            No songs loaded. Please upload a song from the main page.
          </div>
        </div>

        <div class="diff-selection">
          <span class="diff-label">Select Difficulty</span>
          <div class="diff-row" id="select-diff-buttons">
            <button class="diff-btn easy" data-diff="easy">Easy</button>
            <button class="diff-btn normal active" data-diff="normal">Normal</button>
            <button class="diff-btn hard" data-diff="hard">Hard</button>
            <button class="diff-btn extreme" data-diff="extreme">Extreme</button>
          </div>
        </div>

        <div class="highscore-card">
          <span class="highscore-title">Personal Best</span>
          <span class="highscore-val" id="select-highscore-val">000000</span>
        </div>

        <div class="select-actions">
          <button class="cal-btn" id="select-back-btn">Back</button>
          <button class="cal-btn cal-btn-primary" id="select-play-btn">Launch</button>
        </div>
      </div>
    `;

    this.tracksContainerEl = this.element.querySelector('#select-tracks-container') as HTMLDivElement;
    this.diffButtonsEl = this.element.querySelector('#select-diff-buttons') as HTMLDivElement;
    this.highscoreValEl = this.element.querySelector('#select-highscore-val') as HTMLSpanElement;
  }

  private bindEvents(): void {
    // Latency calibration click
    const calBtn = this.element.querySelector('#select-cal-btn') as HTMLButtonElement;
    calBtn.addEventListener('click', () => {
      this.eventBus.emit('songselect:calibration');
    });

    // Back click
    const backBtn = this.element.querySelector('#select-back-btn') as HTMLButtonElement;
    backBtn.addEventListener('click', () => {
      this.eventBus.emit('songselect:back');
    });

    // Launch click
    const playBtn = this.element.querySelector('#select-play-btn') as HTMLButtonElement;
    playBtn.addEventListener('click', () => {
      if (this.selectedSongIndex >= 0 && this.selectedSongIndex < this.songsList.length) {
        this.eventBus.emit('songselect:play', {
          song: this.songsList[this.selectedSongIndex],
          difficulty: this.selectedDifficulty,
        });
      }
    });

    // Difficulty buttons click
    const diffButtons = this.diffButtonsEl.querySelectorAll('.diff-btn');
    diffButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const diff = target.getAttribute('data-diff') as Difficulty;
        
        diffButtons.forEach((b) => b.classList.remove('active'));
        target.classList.add('active');

        this.selectedDifficulty = diff;
        this.updateHighscoreDisplay();
      });
    });
  }

  /**
   * Set songs inside the select menu.
   */
  setSongs(songs: SelectedSong[]): void {
    this.songsList = songs;
    
    if (this.songsList.length > 0 && this.selectedSongIndex === -1) {
      this.selectedSongIndex = 0;
    }

    this.renderTracks();
    this.updateHighscoreDisplay();
  }

  private renderTracks(): void {
    if (this.songsList.length === 0) {
      this.tracksContainerEl.innerHTML = `
        <div style="color:#8899aa; text-align:center; padding:2rem; font-size:0.9rem;">
          No songs loaded. Upload a song to start.
        </div>
      `;
      return;
    }

    this.tracksContainerEl.innerHTML = '';

    this.songsList.forEach((song, idx) => {
      const activeClass = idx === this.selectedSongIndex ? 'active' : '';
      const min = Math.floor(song.duration / 60);
      const sec = Math.floor(song.duration % 60).toString().padStart(2, '0');

      const card = document.createElement('div');
      card.className = `track-card ${activeClass}`;
      card.innerHTML = `
        <div class="track-info">
          <span class="track-name">${song.name}</span>
          <span class="track-meta">${min}:${sec} · ${song.bpm} BPM</span>
        </div>
        <button class="track-delete-btn" title="Remove song" data-id="${song.id}">✕</button>
      `;

      // Add style for delete button if not already present
      if (!document.getElementById('track-delete-style')) {
        const s = document.createElement('style');
        s.id = 'track-delete-style';
        s.textContent = `
          .track-card { position: relative; }
          .track-delete-btn {
            background: rgba(255,50,50,.08); border: 1px solid rgba(255,50,50,.2);
            color: rgba(255,100,100,.6); border-radius: 6px;
            width: 28px; height: 28px; font-size: .75rem; cursor: pointer;
            flex-shrink: 0; display: flex; align-items: center; justify-content: center;
            transition: all .2s;
          }
          .track-delete-btn:hover { background:rgba(255,50,50,.2); color:#ff4444; }
        `;
        document.head.appendChild(s);
      }

      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.track-delete-btn')) return;
        const cards = this.tracksContainerEl.querySelectorAll('.track-card');
        cards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedSongIndex = idx;
        this.updateHighscoreDisplay();
      });

      const delBtn = card.querySelector('.track-delete-btn') as HTMLButtonElement;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.eventBus.emit('songselect:delete', song.id);
      });

      this.tracksContainerEl.appendChild(card);
    });
  }

  private updateHighscoreDisplay(): void {
    if (this.selectedSongIndex < 0 || this.selectedSongIndex >= this.songsList.length) {
      this.highscoreValEl.innerText = '000000';
      return;
    }

    const song = this.songsList[this.selectedSongIndex];
    const key = `core-sync:score:${song.id}:${this.selectedDifficulty}`;
    const best = localStorage.getItem(key);
    
    this.highscoreValEl.innerText = best ? String(best).padStart(6, '0') : '000000';
  }

  show(): void {
    this.element.style.display = 'flex';
    this.renderTracks();
    this.updateHighscoreDisplay();
  }

  hide(): void {
    this.element.style.display = 'none';
  }
}
