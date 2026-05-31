import { Container } from 'pixi.js';
import { Game } from './core/Game';
import { eventBus } from './core/EventBus';
import { SongLoader } from './audio/SongLoader';
import { AudioAnalyzer } from './audio/AudioAnalyzer';
import { ChartGenerator } from './audio/ChartGenerator';
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

  const splash = new Splash();
  const songSelect = new SongSelect(screenParent, eventBus);
  const processing = new ProcessingScreen();
  const missFlash = new MissFlash();

  let calibration: Calibration | null = null;
  let hud: HUD | null = null;
  let results: Results | null = null;

  let audioSystem: AudioSystem | null = null;
  let inputSystem: InputSystem | null = null;
  let scoringSystem: ScoringSystem | null = null;
  let renderSystem: RenderSystem | null = null;
  let particlePool: ParticlePool | null = null;

  const songsList: SelectedSong[] = [];
  let currentSong: SelectedSong | null = null;
  let currentDifficulty = 'normal';
  let activeChart: any = null;
  let isGameplayActive = false;

  // ── Upload flow ──
  // File is selected via native <label>+<input> in Splash — no .click() needed.
  // AudioContext is created synchronously here; the `change` event IS a user gesture on iOS.

  eventBus.on('splash:fileSelected', async (file: File) => {
    try {
      // 1. Create AudioContext synchronously from user gesture (file change event)
      const audioCtx = await game.ensureAudioContext();

      if (!calibration) {
        calibration = new Calibration(screenParent, eventBus, audioCtx);
      }

      splash.hide();
      processing.show();
      processing.setStatus('Analyzing audio spectrum...');

      const songData = await songLoader.loadFromFile(file, audioCtx);

      const featureMap = await analyzer.analyze(songData.audioBuffer, (p) => {
        processing.setProgress(p);
      });

      const tempChart = ChartGenerator.generate(
        songData.name,
        songData.rawBuffer,
        featureMap,
        songData.audioBuffer.sampleRate,
        'normal' as any,
      );

      const song: SelectedSong = {
        id: `song_${Date.now()}`,
        name: songData.name,
        bpm: tempChart.bpm,
        duration: songData.audioBuffer.duration,
        buffer: songData.audioBuffer,
      };

      (song.buffer as any).featureMap = featureMap;
      (song.buffer as any).fileBuffer = songData.rawBuffer;

      songsList.push(song);
      songSelect.setSongs(songsList);

      processing.hide();
      songSelect.show();
    } catch (err) {
      console.error('[CORE SYNC] Error loading song:', err);
      processing.hide();
      splash.show();
    }
  });

  // ── Settings & Calibration ──

  eventBus.on('songselect:calibration', async () => {
    const audioCtx = await game.ensureAudioContext();
    if (!calibration) {
      calibration = new Calibration(screenParent, eventBus, audioCtx);
    }
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

  // ── Gameplay start ──

  eventBus.on('songselect:play', async ({ song, difficulty }) => {
    currentSong = song;
    currentDifficulty = difficulty;
    songSelect.hide();
    await launchGameplay();
  });

  async function launchGameplay() {
    if (!currentSong) return;

    const audioCtx = await game.ensureAudioContext();

    const featureMap = (currentSong.buffer as any).featureMap;
    const fileBuffer = (currentSong.buffer as any).fileBuffer;

    activeChart = ChartGenerator.generate(
      currentSong.name,
      fileBuffer,
      featureMap,
      currentSong.buffer.sampleRate,
      currentDifficulty as any,
    );

    // Gameplay container — no stage-level filters (they black out everything on WebGL1)
    const gameplayContainer = new Container();
    game.app.stage.addChild(gameplayContainer);

    renderSystem = new RenderSystem(game, gameplayContainer);
    audioSystem = new AudioSystem(audioCtx, game.clock);
    audioSystem.setBuffer(currentSong.buffer);

    scoringSystem = new ScoringSystem(eventBus);
    scoringSystem.reset();

    inputSystem = new InputSystem(game.app.canvas as HTMLCanvasElement, eventBus);
    particlePool = new ParticlePool(gameplayContainer);

    if (!hud) {
      hud = new HUD(screenParent, eventBus);
    }
    hud.show();

    isGameplayActive = true;

    setTimeout(() => {
      if (audioSystem) audioSystem.play(0);
    }, 800);
  }

  // ── Note hit judgment ──

  eventBus.on('input:down', ({ lane, time: _time }) => {
    if (!isGameplayActive || !renderSystem || !scoringSystem || !audioSystem || !particlePool) return;

    const songTime = game.clock.songTime;
    const noteEntity = renderSystem.getClosestActiveNote(lane, songTime);

    if (noteEntity) {
      const note = noteEntity.noteData;

      if (note.type === NoteType.TAP) {
        const judgment = scoringSystem.judgeNote(note, songTime);
        noteEntity.isHit = true;
        if (judgment !== 'miss') {
          let color = 0x00ffff;
          if (judgment === 'great') color = 0x00ff88;
          else if (judgment === 'good') color = 0xffcc00;
          particlePool.spawnBurst(noteEntity.x, noteEntity.y, color, 18);
          renderSystem.pulseLane(lane);
        } else {
          triggerMiss();
        }
      } else if (note.type === NoteType.SPARK) {
        const diffMs = Math.abs(songTime - note.time) * 1000;
        if (diffMs <= 60) {
          scoringSystem.registerHit('perfect');
          noteEntity.isHit = true;
          particlePool.spawnBurst(noteEntity.x, noteEntity.y, 0xffcc00, 24);
          renderSystem.pulseLane(lane);
        } else {
          scoringSystem.registerMiss();
          noteEntity.isMissed = true;
          triggerMiss();
        }
      } else if (note.type === NoteType.HOLD) {
        const diffMs = Math.abs(songTime - note.time) * 1000;
        if (diffMs <= 150) {
          noteEntity.holdPressed = true;
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
        const activeHold = renderSystem.getClosestActiveNote(i, songTime);
        if (activeHold && activeHold.noteData.type === NoteType.HOLD && activeHold.holdPressed) {
          const note = activeHold.noteData;
          if (songTime >= note.time && songTime <= note.time + note.duration) {
            scoringSystem.registerHit('perfect');
            activeHold.holdProgress = (songTime - note.time) / note.duration;
            particlePool?.spawnBurst(activeHold.x, activeHold.y, 0xff00ff, 1);
          }
        }
      }
    }
  }

  function triggerMiss() {
    missFlash.trigger();
  }

  eventBus.on('score:judgment', ({ judgment }) => {
    if (judgment === 'miss') triggerMiss();
  });

  // ── Pause ──

  eventBus.on('gameplay:pause', () => {
    if (!isGameplayActive || !audioSystem) return;
    if (audioSystem.active) audioSystem.pause();
    else audioSystem.resume();
  });

  // ── Main game loop ──

  eventBus.on('game:update', (_dt) => {
    if (!isGameplayActive || !renderSystem || !audioSystem || !scoringSystem || !particlePool) return;

    scoringSystem.updateDecay();
    checkHoldSustains();

    renderSystem.update(activeChart, () => {
      scoringSystem!.registerMiss();
    });

    particlePool.update();

    // Audio-reactive lane glow (already 0-1)
    const energy = audioSystem.getRealtimeEnergy();
    renderSystem.setLaneGlow(energy.low, energy.mid, energy.high);

    if (audioSystem.currentTime >= audioSystem.duration && audioSystem.duration > 0) {
      concludeGameplay();
    }
  });

  // ── End of song ──

  function concludeGameplay() {
    isGameplayActive = false;
    if (hud) hud.hide();
    const stats = scoringSystem!.stats;
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

    // Remove all stage children except the permanent FPS text
    for (let i = game.app.stage.children.length - 1; i >= 0; i--) {
      const child = game.app.stage.children[i];
      if (child !== (game as any).fpsText) {
        game.app.stage.removeChild(child);
        child.destroy({ children: true });
      }
    }
  }

  eventBus.on('results:menu', () => {
    if (results) results.hide();
    songSelect.show();
  });

  eventBus.on('results:replay', async () => {
    if (results) results.hide();
    await launchGameplay();
  });
}

bootstrap();
