/**
 * DebugVisualizer — TEMPORARY throwaway scaffolding for Phase 1.
 *
 * Draws the three band-energy curves (low/mid/high) and onset markers
 * across the screen so we can eyeball whether the analysis is sane.
 * Also provides basic audio playback with a seek cursor for scrubbing.
 *
 * Delete this in Phase 5.
 */

import { Graphics, Text, TextStyle, Container } from 'pixi.js';
import type { FeatureMap } from '../audio/FeatureMap';
import type { Game } from '../core/Game';
import { formatTime } from '../utils/Math';

/** Colors for the three bands. */
const LOW_COLOR = 0xff3366;   // Warm red-pink for bass
const MID_COLOR = 0x33ff99;   // Green for mids
const HIGH_COLOR = 0x3399ff;  // Blue for highs
const ONSET_COLOR = 0xffffff; // White ticks for onsets
const CURSOR_COLOR = 0x0fCCA0; // Neon green cursor

const CURVE_HEIGHT = 0.2; // Each curve uses 20% of screen height
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 80;

export class DebugVisualizer {
  private game: Game;
  private featureMap: FeatureMap;
  private audioBuffer: AudioBuffer;
  private audioContext: AudioContext;

  private container: Container;
  private lowCurve: Graphics;
  private midCurve: Graphics;
  private highCurve: Graphics;
  private onsetMarkers: Graphics;
  private cursorLine: Graphics;
  private timeText: Text;
  private infoText: Text;

  // Audio playback state
  private source: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;
  private playStartCtxTime: number = 0;
  private playStartSongTime: number = 0;
  private currentSongTime: number = 0;

  // DOM controls
  private controlsEl: HTMLDivElement;
  private animFrameId: number = 0;

  constructor(
    game: Game,
    featureMap: FeatureMap,
    audioBuffer: AudioBuffer,
    audioContext: AudioContext,
  ) {
    this.game = game;
    this.featureMap = featureMap;
    this.audioBuffer = audioBuffer;
    this.audioContext = audioContext;

    // ── Pixi containers ──
    this.container = new Container();
    this.container.zIndex = 100;

    this.lowCurve = new Graphics();
    this.midCurve = new Graphics();
    this.highCurve = new Graphics();
    this.onsetMarkers = new Graphics();
    this.cursorLine = new Graphics();

    this.timeText = new Text({
      text: '0:00 / 0:00',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 13,
        fill: 0x0fCCA0,
      }),
    });
    this.timeText.position.set(10, this.game.height - 30);

    // Info text showing analysis stats
    const onsetCount = featureMap.frames.filter(f => f.isOnset).length;
    const fps = Math.round(featureMap.sampleRate / featureMap.hopSize);
    this.infoText = new Text({
      text: [
        `${featureMap.frameCount} frames @ ${fps} fps`,
        `${onsetCount} onsets detected`,
        `Duration: ${formatTime(featureMap.duration)}`,
        `Sample rate: ${featureMap.sampleRate} Hz`,
      ].join('  |  '),
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 10,
        fill: 0x666666,
      }),
    });
    this.infoText.position.set(10, this.game.height - 50);

    this.container.addChild(
      this.lowCurve,
      this.midCurve,
      this.highCurve,
      this.onsetMarkers,
      this.cursorLine,
      this.timeText,
      this.infoText,
    );

    this.game.app.stage.addChild(this.container);

    // ── Draw static curves ──
    this.drawCurves();

    // ── DOM controls ──
    this.controlsEl = document.createElement('div');
    this.controlsEl.id = 'debug-controls';
    this.controlsEl.innerHTML = `
      <button id="debug-play-btn" class="debug-btn">▶ PLAY</button>
      <button id="debug-back-btn" class="debug-btn">BACK</button>
      <div class="debug-legend">
        <span style="color:#ff3366">■ LOW</span>
        <span style="color:#33ff99">■ MID</span>
        <span style="color:#3399ff">■ HIGH</span>
        <span style="color:#fff">│ ONSET</span>
      </div>
    `;
    this.applyControlStyles();
    document.body.appendChild(this.controlsEl);

    // Wire buttons
    const playBtn = this.controlsEl.querySelector('#debug-play-btn') as HTMLButtonElement;
    const backBtn = this.controlsEl.querySelector('#debug-back-btn') as HTMLButtonElement;

    playBtn.addEventListener('click', () => {
      if (this.isPlaying) {
        this.stopPlayback();
        playBtn.textContent = '▶ PLAY';
      } else {
        this.startPlayback(this.currentSongTime);
        playBtn.textContent = '⏸ PAUSE';
      }
    });

    backBtn.addEventListener('click', () => {
      this.stopPlayback();
      playBtn.textContent = '▶ PLAY';
      this.destroy();
      // Signal back to main to show splash
      import('../core/EventBus').then(m => m.eventBus.emit('debug:back'));
    });

    // ── Canvas click = seek ──
    const canvas = this.game.app.canvas as HTMLCanvasElement;
    this.onCanvasClick = this.onCanvasClick.bind(this);
    canvas.addEventListener('pointerdown', this.onCanvasClick);

    // ── Start render loop for cursor ──
    this.tick = this.tick.bind(this);
    this.animFrameId = requestAnimationFrame(this.tick);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Drawing
  // ──────────────────────────────────────────────────────────────────────────

  private drawCurves(): void {
    const w = this.game.width;
    const h = this.game.height - MARGIN_TOP - MARGIN_BOTTOM;
    const frames = this.featureMap.frames;
    const peaks = this.featureMap.peaks;
    const n = frames.length;

    if (n === 0) return;

    // Y regions: low on top, mid in middle, high on bottom
    const bandH = h * CURVE_HEIGHT;
    const lowY = MARGIN_TOP;
    const midY = MARGIN_TOP + h * 0.35;
    const highY = MARGIN_TOP + h * 0.65;

    // Draw each curve
    this.drawBandCurve(this.lowCurve, frames, 'lowEnergy', peaks.lowEnergy, w, bandH, lowY, LOW_COLOR);
    this.drawBandCurve(this.midCurve, frames, 'midEnergy', peaks.midEnergy, w, bandH, midY, MID_COLOR);
    this.drawBandCurve(this.highCurve, frames, 'highEnergy', peaks.highEnergy, w, bandH, highY, HIGH_COLOR);

    // Draw onset markers
    this.onsetMarkers.clear();
    for (let i = 0; i < n; i++) {
      if (frames[i].isOnset) {
        const x = (i / n) * w;
        this.onsetMarkers
          .moveTo(x, MARGIN_TOP)
          .lineTo(x, MARGIN_TOP + h)
          .stroke({ width: 0.5, color: ONSET_COLOR, alpha: 0.15 });
      }
    }
  }

  private drawBandCurve(
    gfx: Graphics,
    frames: FeatureMap['frames'],
    key: 'lowEnergy' | 'midEnergy' | 'highEnergy',
    peak: number,
    width: number,
    height: number,
    yOffset: number,
    color: number,
  ): void {
    gfx.clear();
    const n = frames.length;
    if (n === 0 || peak === 0) return;

    // Downsample to screen pixels for performance
    const step = Math.max(1, Math.floor(n / width));

    gfx.moveTo(0, yOffset + height);
    for (let i = 0; i < n; i += step) {
      const x = (i / n) * width;
      const val = frames[i][key] / peak; // Normalized 0..1
      const y = yOffset + height - val * height;
      gfx.lineTo(x, y);
    }
    gfx.stroke({ width: 1.2, color, alpha: 0.7 });

    // Fill (very subtle)
    gfx.moveTo(0, yOffset + height);
    for (let i = 0; i < n; i += step) {
      const x = (i / n) * width;
      const val = frames[i][key] / peak;
      const y = yOffset + height - val * height;
      gfx.lineTo(x, y);
    }
    gfx.lineTo(width, yOffset + height);
    gfx.closePath();
    gfx.fill({ color, alpha: 0.08 });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cursor & Tick
  // ──────────────────────────────────────────────────────────────────────────

  private tick(): void {
    if (this.isPlaying) {
      this.currentSongTime =
        this.playStartSongTime +
        (this.audioContext.currentTime - this.playStartCtxTime);

      // Stop at end of song
      if (this.currentSongTime >= this.featureMap.duration) {
        this.stopPlayback();
        this.currentSongTime = 0;
        const btn = this.controlsEl.querySelector('#debug-play-btn') as HTMLButtonElement;
        if (btn) btn.textContent = '▶ PLAY';
      }
    }

    this.drawCursor();
    this.updateTimeText();
    this.animFrameId = requestAnimationFrame(this.tick);
  }

  private drawCursor(): void {
    const w = this.game.width;
    const h = this.game.height - MARGIN_BOTTOM;
    const x = (this.currentSongTime / this.featureMap.duration) * w;

    this.cursorLine.clear();
    this.cursorLine
      .moveTo(x, MARGIN_TOP)
      .lineTo(x, h)
      .stroke({ width: 1.5, color: CURSOR_COLOR, alpha: 0.8 });
  }

  private updateTimeText(): void {
    this.timeText.text = `${formatTime(this.currentSongTime)} / ${formatTime(this.featureMap.duration)}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Audio playback
  // ──────────────────────────────────────────────────────────────────────────

  private startPlayback(fromTime: number): void {
    this.stopSource();

    this.source = this.audioContext.createBufferSource();
    this.source.buffer = this.audioBuffer;
    this.source.connect(this.audioContext.destination);
    this.source.start(0, fromTime);

    this.playStartCtxTime = this.audioContext.currentTime;
    this.playStartSongTime = fromTime;
    this.isPlaying = true;

    this.source.onended = () => {
      this.isPlaying = false;
    };
  }

  private stopPlayback(): void {
    if (this.isPlaying) {
      this.currentSongTime =
        this.playStartSongTime +
        (this.audioContext.currentTime - this.playStartCtxTime);
    }
    this.stopSource();
    this.isPlaying = false;
  }

  private stopSource(): void {
    if (this.source) {
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Interaction
  // ──────────────────────────────────────────────────────────────────────────

  private onCanvasClick(e: PointerEvent): void {
    const rect = (this.game.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = x / rect.width;
    const seekTime = fraction * this.featureMap.duration;

    this.currentSongTime = Math.max(0, Math.min(seekTime, this.featureMap.duration));

    if (this.isPlaying) {
      this.startPlayback(this.currentSongTime);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Styles
  // ──────────────────────────────────────────────────────────────────────────

  private applyControlStyles(): void {
    const style = document.createElement('style');
    style.id = 'debug-styles';
    style.textContent = `
      #debug-controls {
        position: fixed;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1001;
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 8px 16px;
        background: rgba(10, 20, 30, 0.8);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(0, 255, 200, 0.1);
        border-radius: 12px;
      }

      .debug-btn {
        padding: 6px 16px;
        background: rgba(0, 255, 200, 0.08);
        border: 1px solid rgba(0, 255, 200, 0.2);
        border-radius: 6px;
        color: #0fCCA0;
        font-family: monospace;
        font-size: 0.7rem;
        letter-spacing: 0.1em;
        cursor: pointer;
        transition: all 0.2s;
      }

      .debug-btn:hover {
        background: rgba(0, 255, 200, 0.15);
        border-color: rgba(0, 255, 200, 0.4);
      }

      .debug-legend {
        display: flex;
        gap: 12px;
        font-family: monospace;
        font-size: 0.6rem;
        letter-spacing: 0.05em;
        opacity: 0.6;
      }
    `;
    document.head.appendChild(style);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ──────────────────────────────────────────────────────────────────────────

  destroy(): void {
    this.stopPlayback();
    cancelAnimationFrame(this.animFrameId);
    this.container.destroy({ children: true });

    const canvas = this.game.app.canvas as HTMLCanvasElement;
    canvas.removeEventListener('pointerdown', this.onCanvasClick);

    this.controlsEl.remove();
    document.getElementById('debug-styles')?.remove();
  }
}
