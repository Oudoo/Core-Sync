import { Container } from 'pixi.js';
import { Game } from './core/Game';
import { eventBus } from './core/EventBus';
import { SongLoader } from './audio/SongLoader';
import { AudioAnalyzer } from './audio/AudioAnalyzer';
import { ChartGenerator } from './audio/ChartGenerator';
import { SongStore, SongMeta } from './storage/SongStore';
import { Splash } from './ui/Splash';
import { SongSelect, SelectedSong } from './ui/SongSelect';
import { ProcessingScreen } from './ui/ProcessingScreen';
import { Calibration } from './ui/Calibration';
import { HUD } from './ui/HUD';
import { Results } from './ui/Results';

import { AudioSystem } from './systems/AudioSystem';
import { InputSystem } from './systems/InputSystem';
import { ScoringSystem } from './systems/ScoringSystem';
import { RenderSystem } from './systems/RenderSystem';

import { MissFlash } from './render/PostProcessing';
import { ParticlePool } from './pool/ParticlePool';
import { NoteType } from './chart/Note';

async function bootstrap(): Promise<void> {
  // ── IndexedDB store (open before anything else) ──
  const store = new SongStore();
  try {
    await store.open();
  } catch (err) {
    console.warn('[CORE SYNC] IndexedDB unavailable — songs will not persist:', err);
  }

  // ── Pixi application ──
  const game = new Game();
  try {
    await game.init();
    console.log(
      `%c[CORE SYNC] Booted — ${game.width}×${game.height} @ ${window.devicePixelRatio}x`,
      'color: #0fc; font-weight: bold;',
    );
  } catch (err) {
    console.error('[CORE SYNC] Fatal init error:', err);
    return;
  }

  const screenParent = document.getElementById('game-container') || document.body;

  const songLoader = new SongLoader();
  const analyzer = new AudioAnalyzer();
  const missFlash = new MissFlash();

  const splash = new Splash();
  const songSelect = new SongSelect(screenParent, eventBus);
  const processing = new ProcessingScreen();

  let calibration: Calibration | null = null;
  let hud: HUD | null = null;
  let results: Results | null = null;

  let audioSystem: AudioSystem | null = null;
  let inputSystem: InputSystem | null = null;
  let scoringSystem: ScoringSystem | null = null;
  let renderSystem: RenderSystem | null = null;
  let particlePool: ParticlePool | null = null;

  // In-memory song list (populated from DB on start + new uploads)
  const songsList: SelectedSong[] = [];
  let currentSong: SelectedSong | null = null;
  let currentDifficulty = 'normal';
  let activeChart: any = null;
  let isGameplayActive = false;

  // ── Load library from IndexedDB on startup ──
  try {
    const metas = await store.listMeta();
    for (const meta of metas) {
      // Push a stub — AudioBuffer and featureMap loaded lazily on play
      songsList.push(metaToSelectedSong(meta));
    }
    if (songsList.length > 0) {
      songSelect.setSongs(songsList);
    }
    splash.setSavedCount(songsList.length);
  } catch (err) {
    console.warn('[CORE SYNC] Could not load library:', err);
  }

  /** Convert a stored meta into the in-memory SelectedSong shape. */
  function metaToSelectedSong(meta: SongMeta): SelectedSong {
    // AudioBuffer + featureMap are loaded lazily just before gameplay starts
    return {
      id: meta.id,
      name: meta.name,
      bpm: meta.bpm,
      duration: meta.duration,
      buffer: null as any, // populated on play
    } as SelectedSong & { _meta: SongMeta };
  }

  // ── Upload new song ──
  eventBus.on('splash:fileSelected', async (file: File) => {
    try {
      const audioCtx = await game.ensureAudioContext();
      if (!calibration) calibration = new Calibration(screenParent, eventBus, audioCtx);

      splash.hide();
      processing.show();
      processing.setStatus('Reading file...');

      const songData = await songLoader.loadFromFile(file, audioCtx);

      processing.setStatus('Analyzing audio spectrum...');
      const featureMap = await analyzer.analyze(songData.audioBuffer, (p) => {
        processing.setProgress(p);
      });

      processing.setStatus('Generating chart...');
      const tempChart = ChartGenerator.generate(
        songData.name, songData.rawBuffer, featureMap,
        songData.audioBuffer.sampleRate, 'normal' as any,
      );

      const id = `song_${Date.now()}`;
      const meta: SongMeta = {
        id,
        name: songData.name,
        bpm: tempChart.bpm,
        duration: songData.audioBuffer.duration,
        sampleRate: songData.audioBuffer.sampleRate,
        addedAt: Date.now(),
      };

      // Persist to IndexedDB
      processing.setStatus('Saving to library...');
      try {
        await store.save(meta, songData.rawBuffer, featureMap);
      } catch (err) {
        console.warn('[CORE SYNC] Could not save to IndexedDB:', err);
      }

      // Build in-memory entry with fully-loaded data attached
      const song: SelectedSong = {
        id,
        name: songData.name,
        bpm: tempChart.bpm,
        duration: songData.audioBuffer.duration,
        buffer: songData.audioBuffer,
      };
      (song as any)._featureMap = featureMap;
      (song as any)._rawBuffer = songData.rawBuffer;

      songsList.push(song);
      songSelect.setSongs(songsList);
      splash.setSavedCount(songsList.length);

      processing.hide();
      songSelect.show();
    } catch (err) {
      console.error('[CORE SYNC] Error loading song:', err);
      processing.hide();
      splash.show();
    }
  });

  // ── Open library from splash (songs already listed in songSelect) ──
  eventBus.on('splash:openLibrary', () => {
    splash.hide();
    songSelect.show();
  });

  // ── Delete a song from library ──
  eventBus.on('songselect:delete', async (id: string) => {
    const idx = songsList.findIndex((s) => s.id === id);
    if (idx === -1) return;
    songsList.splice(idx, 1);
    try { await store.remove(id); } catch { /* ignore */ }
    localStorage.removeItem(`core-sync:score:${id}:easy`);
    localStorage.removeItem(`core-sync:score:${id}:normal`);
    localStorage.removeItem(`core-sync:score:${id}:hard`);
    localStorage.removeItem(`core-sync:score:${id}:extreme`);
    songSelect.setSongs(songsList);
    splash.setSavedCount(songsList.length);
  });

  // ── Calibration ──
  eventBus.on('songselect:calibration', async () => {
    const audioCtx = await game.ensureAudioContext();
    if (!calibration) calibration = new Calibration(screenParent, eventBus, audioCtx);
    songSelect.hide();
    calibration.show();
  });

  eventBus.on('calibration:save', (offsetMs: number) => {
    game.clock.calibrationOffset = offsetMs;
    songSelect.show();
  });

  eventBus.on('songselect:back', () => {
    songSelect.hide();
    splash.show();
  });

  // ── Start gameplay ──
  eventBus.on('songselect:play', async ({ song, difficulty }) => {
    currentSong = song;
    currentDifficulty = difficulty;
    songSelect.hide();
    await launchGameplay();
  });

  /**
   * Ensure the song has a live AudioBuffer + featureMap.
   * Songs loaded from the library DB are stubs until this is called.
   */
  async function ensureSongLoaded(song: SelectedSong): Promise<void> {
    if (song.buffer) return; // already loaded
    processing.show();
    processing.setStatus('Loading song from library...');
    const audioCtx = await game.ensureAudioContext();
    const full = await store.loadFull(song.id);
    if (!full) throw new Error(`Song ${song.id} not found in store`);
    const audioBuffer = await audioCtx.decodeAudioData(full.rawBuffer.slice(0));
    song.buffer = audioBuffer;
    (song as any)._featureMap = full.featureMap;
    (song as any)._rawBuffer = full.rawBuffer;
    processing.hide();
  }

  async function launchGameplay() {
    if (!currentSong) return;

    try {
      await ensureSongLoaded(currentSong);
    } catch (err) {
      console.error('[CORE SYNC] Could not load song for play:', err);
      songSelect.show();
      return;
    }

    const audioCtx = await game.ensureAudioContext();
    const featureMap = (currentSong as any)._featureMap;
    const rawBuffer = (currentSong as any)._rawBuffer;

    activeChart = ChartGenerator.generate(
      currentSong.name, rawBuffer, featureMap,
      currentSong.buffer.sampleRate, currentDifficulty as any,
    );

    const gameplayContainer = new Container();
    game.app.stage.addChild(gameplayContainer);

    renderSystem = new RenderSystem(game, gameplayContainer);
    audioSystem = new AudioSystem(audioCtx, game.clock);
    audioSystem.setBuffer(currentSong.buffer);

    scoringSystem = new ScoringSystem(eventBus);
    scoringSystem.reset();

    inputSystem = new InputSystem(game.app.canvas as HTMLCanvasElement, eventBus);
    particlePool = new ParticlePool(gameplayContainer);

    if (!hud) hud = new HUD(screenParent, eventBus);
    hud.show();

    isGameplayActive = true;
    setTimeout(() => { if (audioSystem) audioSystem.play(0); }, 800);
  }

  // ── Input / judgment ──
  eventBus.on('input:down', ({ lane }) => {
    if (!isGameplayActive || !renderSystem || !scoringSystem || !audioSystem || !particlePool) return;
    const songTime = game.clock.songTime;
    const entity = renderSystem.getClosestActiveNote(lane, songTime);

    if (entity) {
      const note = entity.noteData;
      if (note.type === NoteType.TAP) {
        const j = scoringSystem.judgeNote(note, songTime);
        entity.isHit = true;
        if (j !== 'miss') {
          const color = j === 'perfect' ? 0x00ffff : j === 'great' ? 0x00ff88 : 0xffcc00;
          particlePool.spawnBurst(entity.x, entity.y, color, 18);
          renderSystem.pulseLane(lane);
        } else { missFlash.trigger(); }
      } else if (note.type === NoteType.SPARK) {
        if (Math.abs(songTime - note.time) * 1000 <= 60) {
          scoringSystem.registerHit('perfect');
          entity.isHit = true;
          particlePool.spawnBurst(entity.x, entity.y, 0xffcc00, 24);
          renderSystem.pulseLane(lane);
        } else {
          scoringSystem.registerMiss(); entity.isMissed = true; missFlash.trigger();
        }
      } else if (note.type === NoteType.HOLD) {
        if (Math.abs(songTime - note.time) * 1000 <= 150) {
          entity.holdPressed = true;
          scoringSystem.registerHit('perfect');
          renderSystem.pulseLane(lane);
        }
      }
    } else {
      renderSystem.pulseLane(lane);
    }
  });

  function checkHoldSustains() {
    if (!isGameplayActive || !inputSystem || !renderSystem || !scoringSystem) return;
    const songTime = game.clock.songTime;
    for (let i = 0; i < 4; i++) {
      if (inputSystem.isLaneHeld(i)) {
        const h = renderSystem.getClosestActiveNote(i, songTime);
        if (h && h.noteData.type === NoteType.HOLD && h.holdPressed) {
          const n = h.noteData;
          if (songTime >= n.time && songTime <= n.time + n.duration) {
            scoringSystem.registerHit('perfect');
            h.holdProgress = (songTime - n.time) / n.duration;
            particlePool?.spawnBurst(h.x, h.y, 0xff00ff, 1);
          }
        }
      }
    }
  }

  eventBus.on('score:judgment', ({ judgment }) => {
    if (judgment === 'miss') missFlash.trigger();
  });

  eventBus.on('gameplay:pause', () => {
    if (!isGameplayActive || !audioSystem) return;
    if (audioSystem.active) audioSystem.pause(); else audioSystem.resume();
  });

  // ── Game loop ──
  eventBus.on('game:update', (_dt) => {
    if (!isGameplayActive || !renderSystem || !audioSystem || !scoringSystem || !particlePool) return;

    scoringSystem.updateDecay();
    checkHoldSustains();
    renderSystem.update(activeChart, () => { scoringSystem!.registerMiss(); });
    particlePool.update();

    const e = audioSystem.getRealtimeEnergy();
    renderSystem.setLaneGlow(e.low, e.mid, e.high);

    if (audioSystem.currentTime >= audioSystem.duration && audioSystem.duration > 0) {
      concludeGameplay();
    }
  });

  // ── End of song ──
  function concludeGameplay() {
    isGameplayActive = false;
    if (hud) hud.hide();
    const stats = scoringSystem!.stats;

    // Persist high score
    if (currentSong) {
      const key = `core-sync:score:${currentSong.id}:${currentDifficulty}`;
      const prev = parseInt(localStorage.getItem(key) || '0', 10);
      if (stats.score > prev) localStorage.setItem(key, String(stats.score));
    }

    cleanGameplayLayers();
    if (!results) results = new Results(screenParent, eventBus);
    results.setStats(stats, currentSong!.id, currentDifficulty);
    results.show();
  }

  function cleanGameplayLayers() {
    isGameplayActive = false;
    if (audioSystem) { audioSystem.stop(); audioSystem.destroy(); audioSystem = null; }
    if (inputSystem) { inputSystem.destroy(); inputSystem = null; }
    if (renderSystem) { renderSystem.destroy(); renderSystem = null; }
    if (particlePool) { particlePool.destroy(); particlePool = null; }
    for (let i = game.app.stage.children.length - 1; i >= 0; i--) {
      const child = game.app.stage.children[i];
      if (child !== (game as any).fpsText) {
        game.app.stage.removeChild(child);
        child.destroy({ children: true });
      }
    }
  }

  eventBus.on('results:menu', () => { if (results) results.hide(); songSelect.show(); });
  eventBus.on('results:replay', async () => { if (results) results.hide(); await launchGameplay(); });
}

bootstrap();
