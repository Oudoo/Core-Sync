/**
 * Game — top-level owner of the PixiJS application and the main update loop.
 *
 * Responsibilities:
 * 1. Create & configure the Pixi Application (WebGL renderer).
 * 2. Own the shared Clock and EventBus instances.
 * 3. Drive the update loop via Pixi's ticker (which uses rAF internally).
 *    The ticker only *triggers* a redraw — all position math reads from Clock.
 * 4. Handle resize to keep the canvas full-screen portrait.
 *
 * DECISION: WebGL renderer, not WebGPU — wider device support, revisit only
 * if a later phase proves we need compute shaders.
 */

import { Application, Text, TextStyle } from 'pixi.js';
import { Clock } from './Clock';
import { eventBus } from './EventBus';
import { Config } from './Config';

export class Game {
  readonly app: Application;
  readonly clock: Clock;
  private _audioContext: AudioContext | null = null;
  private fpsText!: Text;
  private fpsFrames: number = 0;
  private fpsAccum: number = 0;
  private lastFpsUpdate: number = 0;
  private _initialized: boolean = false;

  constructor() {
    this.app = new Application();
    this.clock = new Clock();
  }

  /**
   * Lazily create and resume the AudioContext. Must be called from a user
   * gesture handler (browser autoplay policy).
   */
  async ensureAudioContext(): Promise<AudioContext> {
    if (!this._audioContext) {
      this._audioContext = new AudioContext();
      this.clock.setAudioContext(this._audioContext);
    }
    if (this._audioContext.state === 'suspended') {
      await this._audioContext.resume();
    }
    return this._audioContext;
  }

  get audioContext(): AudioContext | null {
    return this._audioContext;
  }

  /**
   * Async initialization — must be awaited before the game is usable.
   * Pixi v8 requires async init.
   */
  async init(): Promise<void> {
    const container = document.getElementById('game-container');
    if (!container) {
      throw new Error('Missing #game-container element');
    }

    await this.app.init({
      background: Config.BG_COLOR,
      resizeTo: window,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2), // Cap at 2x to save GPU budget
      autoDensity: true,
      preferWebGLVersion: 2,
      powerPreference: 'high-performance',
    });

    container.appendChild(this.app.canvas as HTMLCanvasElement);

    // ── FPS Counter ──
    this.fpsText = new Text({
      text: 'FPS: --',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0x00ffcc,
        dropShadow: {
          alpha: 0.6,
          blur: 2,
          color: 0x000000,
          distance: 1,
        },
      }),
    });
    this.fpsText.position.set(8, 8);
    this.fpsText.zIndex = 99999;
    this.app.stage.addChild(this.fpsText);
    this.app.stage.sortableChildren = true;

    // ── Update Loop ──
    this.lastFpsUpdate = performance.now();
    this.app.ticker.add(this.update, this);

    // ── Resize Handler ──
    window.addEventListener('resize', this.onResize.bind(this));
    this.onResize();

    this._initialized = true;
    eventBus.emit('game:initialized');
  }

  /**
   * Main update tick — called every rAF by Pixi's ticker.
   * This only triggers redraws; all time-sensitive math reads Clock.
   */
  private update(): void {
    const now = performance.now();
    const dt = this.app.ticker.deltaMS;

    // ── FPS calculation (updated every 500ms for readability) ──
    this.fpsFrames++;
    this.fpsAccum += dt;
    if (now - this.lastFpsUpdate >= 500) {
      const avgFrameTime = this.fpsAccum / this.fpsFrames;
      const fps = Math.round(1000 / avgFrameTime);
      this.fpsText.text = `FPS: ${fps}`;
      eventBus.emit('fps:update', fps);
      this.fpsFrames = 0;
      this.fpsAccum = 0;
      this.lastFpsUpdate = now;
    }

    // Systems will register their own update hooks via eventBus or
    // by adding themselves to the ticker. The Game class doesn't
    // hard-code calls to systems it doesn't own yet.
    eventBus.emit('game:update', dt);
  }

  /**
   * Handle window resize — keep canvas filling the viewport.
   */
  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.app.renderer.resize(w, h);
    eventBus.emit('game:resize', w, h);
  }

  /**
   * The logical game width (for positioning calculations).
   */
  get width(): number {
    return this.app.renderer.width / this.app.renderer.resolution;
  }

  /**
   * The logical game height (for positioning calculations).
   */
  get height(): number {
    return this.app.renderer.height / this.app.renderer.resolution;
  }

  get initialized(): boolean {
    return this._initialized;
  }
}
