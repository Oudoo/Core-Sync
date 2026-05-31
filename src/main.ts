import { Sprite, Texture, Container } from 'pixi.js';
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

// Systems
import { AudioSystem } from './systems/AudioSystem';
import { InputSystem } from './systems/InputSystem';
import { ScoringSystem } from './systems/ScoringSystem';
import { RenderSystem } from './systems/RenderSystem';

// Visuals
import { FluidBackgroundFilter, ChromaticAberrationFilter } from './render/PostProcessing';
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

  // ── Global screens parent element ──
  const screenParent = document.getElementById('game-container') || document.body;

  // ── Instantiations ──
  const songLoader = new SongLoader();
  const analyzer = new AudioAnalyzer();

  // Screens
  const splash = new Splash();
  const songSelect = new SongSelect(screenParent, eventBus);
  const processing = new ProcessingScreen();
  
  let calibration: Calibration | null = null;
  let hud: HUD | null = null;
  let results: Results | null = null;

  // Game Engine Systems (initialized dynamically on play)
  let audioSystem: AudioSystem | null = null;
  let inputSystem: InputSystem | null = null;
  let scoringSystem: ScoringSystem | null = null;
  let renderSystem: RenderSystem | null = null;

  // Shaders & Visuals
  let bgMesh: Sprite | null = null;
  let fluidFilter: FluidBackgroundFilter | null = null;
  let chromaticFilter: ChromaticAberrationFilter | null = null;
  let particlePool: ParticlePool | null = null;

  // State
  const songsList: SelectedSong[] = [];
  let currentSong: SelectedSong | null = null;
  let currentDifficulty = 'normal';
  let activeChart: any = null;
  let isGameplayActive = false;
  let missIntensity = 0.0; // Chromatic aberration controller

  // ── Flow: Splash Screen ──

  eventBus.on('splash:upload', async () => {
    try {
      const audioCtx = await game.ensureAudioContext();
      
      // Initialize Calibration screen lazily once AudioContext is active
      if (!calibration) {
        calibration = new Calibration(screenParent, eventBus, audioCtx);
      }

      // Pick song file
      const songData = await songLoader.load(audioCtx);
      
      splash.hide();
      processing.show();
      processing.setStatus('Analyzing audio spectrum...');

      // Process song
      const featureMap = await analyzer.analyze(songData.audioBuffer, (p) => {
        processing.setProgress(p);
      });

      // Deterministic generation for Normal to extract default BPM
      const tempChart = ChartGenerator.generate(
        songData.name,
        songData.rawBuffer,
        featureMap,
        songData.audioBuffer.sampleRate,
        'normal' as any
      );

      const song: SelectedSong = {
        id: `song_${Date.now()}`,
        name: songData.name,
        bpm: tempChart.bpm,
        duration: songData.audioBuffer.duration,
        buffer: songData.audioBuffer,
      };

      // Store features on buffer for deterministic regeneration on difficulties
      (song.buffer as any).featureMap = featureMap;
      (song.buffer as any).fileBuffer = songData.rawBuffer;

      songsList.push(song);
      songSelect.setSongs(songsList);

      processing.hide();
      songSelect.show();

    } catch (err) {
      console.error('[CORE SYNC] Error uploading song:', err);
      processing.hide();
      splash.show();
    }
  });

  // ── Flow: Settings & Calibration ──

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

  // ── Flow: Gameplay Triggers ──

  eventBus.on('songselect:play', async ({ song, difficulty }) => {
    currentSong = song;
    currentDifficulty = difficulty;

    songSelect.hide();
    await launchGameplay();
  });

  async function launchGameplay() {
    if (!currentSong) return;

    const audioCtx = await game.ensureAudioContext();

    // 1. Generate specific difficulty Chart
    const featureMap = (currentSong.buffer as any).featureMap;
    const fileBuffer = (currentSong.buffer as any).fileBuffer;
    
    activeChart = ChartGenerator.generate(
      currentSong.name,
      fileBuffer,
      featureMap,
      currentSong.buffer.sampleRate,
      currentDifficulty as any
    );

    // 2. Setup visual shader layers
    bgMesh = new Sprite(Texture.WHITE);
    bgMesh.width = game.width;
    bgMesh.height = game.height;
    bgMesh.tint = 0x050510;
    
    fluidFilter = new FluidBackgroundFilter();
    bgMesh.filters = [fluidFilter];
    
    // Add background as bottom layer of stage
    game.app.stage.addChildAt(bgMesh, 0);

    // Dynamic Chromatic aberration applied on main stage
    chromaticFilter = new ChromaticAberrationFilter();
    game.app.stage.filters = [chromaticFilter];

    // 3. Setup Gameplay Engine systems
    audioSystem = new AudioSystem(audioCtx, game.clock);
    audioSystem.setBuffer(currentSong.buffer);

    scoringSystem = new ScoringSystem(eventBus);
    scoringSystem.reset();

    // Notes layer
    const gameplayContainer = new Container();
    game.app.stage.addChild(gameplayContainer);
    
    renderSystem = new RenderSystem(game, gameplayContainer);
    inputSystem = new InputSystem(game.app.canvas as HTMLCanvasElement, eventBus);
    particlePool = new ParticlePool(gameplayContainer);

    // Init HUD
    if (!hud) {
      hud = new HUD(screenParent, eventBus);
    }
    hud.show();

    // 4. Start playback
    isGameplayActive = true;
    missIntensity = 0.0;
    
    // Tiny delay before audio starts so player can focus
    setTimeout(() => {
      if (audioSystem) {
        audioSystem.play(0);
      }
    }, 800);
  }

  // ── Input Hooks & Timing Judgment ──

  eventBus.on('input:down', ({ lane, time }) => {
    if (!isGameplayActive || !renderSystem || !scoringSystem || !audioSystem || !particlePool) return;

    const songTime = game.clock.songTime;
    const noteEntity = renderSystem.getClosestActiveNote(lane, songTime);

    if (noteEntity) {
      const note = noteEntity.noteData;

      if (note.type === NoteType.TAP) {
        const judgment = scoringSystem.judgeNote(note, songTime);
        noteEntity.isHit = true;
        
        if (judgment !== 'miss') {
          // Color coding: perfect=cyan, great=green, good=gold
          let color = 0x00ffff;
          if (judgment === 'great') color = 0x00ff88;
          else if (judgment === 'good') color = 0xffcc00;

          particlePool.spawnBurst(noteEntity.x, noteEntity.y, color, 18);
          renderSystem.pulseLane(lane);
        } else {
          triggerMissFeedback();
        }
      } else if (note.type === NoteType.SPARK) {
        // Sparks require extremely rapid hits
        const diffMs = Math.abs(songTime - note.time) * 1000;
        if (diffMs <= 60) { // Sparkling tight target
          scoringSystem.registerHit('perfect');
          noteEntity.isHit = true;
          particlePool.spawnBurst(noteEntity.x, noteEntity.y, 0xffcc00, 24);
          renderSystem.pulseLane(lane);
        } else {
          scoringSystem.registerMiss();
          noteEntity.isMissed = true;
          triggerMissFeedback();
        }
      } else if (note.type === NoteType.HOLD) {
        // Player tapped hold start
        const diffMs = Math.abs(songTime - note.time) * 1000;
        if (diffMs <= 150) {
          noteEntity.holdPressed = true;
          scoringSystem.registerHit('perfect');
          renderSystem.pulseLane(lane);
        }
      }
    } else {
      // Empty tap pulse feedback
      renderSystem.pulseLane(lane);
    }
  });

  // Track active holds in game loop
  function checkHoldSustains() {
    if (!isGameplayActive || !inputSystem || !renderSystem || !scoringSystem) return;

    const songTime = game.clock.songTime;

    for (let i = 0; i < 4; i++) {
      if (inputSystem.isLaneHeld(i)) {
        const activeHold = renderSystem.getClosestActiveNote(i, songTime);
        if (activeHold && activeHold.noteData.type === NoteType.HOLD && activeHold.holdPressed) {
          const note = activeHold.noteData;
          if (songTime >= note.time && songTime <= note.time + note.duration) {
            // Tick score continuously
            scoringSystem.registerHit('perfect');
            activeHold.holdProgress = (songTime - note.time) / note.duration;
            particlePool?.spawnBurst(activeHold.x, activeHold.y, 0xff00ff, 1);
          }
        }
      }
    }
  }

  function triggerMissFeedback() {
    missIntensity = 1.0;
  }

  eventBus.on('score:judgment', ({ judgment }) => {
    if (judgment === 'miss') {
      triggerMissFeedback();
    }
  });

  // ── Gameplay pause controller ──

  eventBus.on('gameplay:pause', () => {
    if (!isGameplayActive || !audioSystem) return;

    if (audioSystem.active) {
      audioSystem.pause();
    } else {
      audioSystem.resume();
    }
  });

  // ── Main gameplay frames processor ──

  eventBus.on('game:update', (dt) => {
    if (!isGameplayActive || !renderSystem || !audioSystem || !scoringSystem || !particlePool) return;

    const songTime = game.clock.songTime;

    // Decay visual miss aberration
    if (missIntensity > 0.0) {
      missIntensity -= 0.06;
      if (chromaticFilter) chromaticFilter.setIntensity(missIntensity);
    }

    // Passive decay scoring energy
    scoringSystem.updateDecay();

    // Check hold tracks
    checkHoldSustains();

    // Render active notes approach
    renderSystem.update(activeChart, (note) => {
      // Miss callback from render
      scoringSystem!.registerMiss();
    });

    // Animate vector particles
    particlePool.update();

    // Update real-time fluid backgrounds
    if (fluidFilter) {
      const realTimeEnergy = audioSystem.getRealtimeEnergy();
      fluidFilter.update(
        songTime,
        realTimeEnergy.low,
        realTimeEnergy.mid,
        realTimeEnergy.high,
        scoringSystem.currentEnergy
      );
    }

    // Check song completion
    if (audioSystem.currentTime >= audioSystem.duration && audioSystem.duration > 0) {
      concludeGameplay();
    }
  });

  // ── Conclude gameplay scoreboard ──

  function concludeGameplay() {
    isGameplayActive = false;

    // Hide HUD, clean stages
    if (hud) hud.hide();
    
    // Save final stats
    const stats = scoringSystem!.stats;

    // Destroy systems
    cleanGameplayLayers();

    // Load results screen
    if (!results) {
      results = new Results(screenParent, eventBus);
    }
    
    results.setStats(stats, currentSong!.id, currentDifficulty);
    results.show();
  }

  function cleanGameplayLayers() {
    isGameplayActive = false;
    
    if (audioSystem) {
      audioSystem.stop();
      audioSystem.destroy();
      audioSystem = null;
    }
    if (inputSystem) {
      inputSystem.destroy();
      inputSystem = null;
    }
    if (renderSystem) {
      renderSystem.destroy();
      renderSystem = null;
    }
    if (particlePool) {
      particlePool.destroy();
      particlePool = null;
    }
    if (bgMesh) {
      bgMesh.destroy({ children: true });
      bgMesh = null;
    }
    
    // Wipe filters from stage
    game.app.stage.filters = [];
    
    // Remove everything except FPS counter
    for (let i = game.app.stage.children.length - 1; i >= 0; i--) {
      const child = game.app.stage.children[i];
      if (child !== (game as any).fpsText) {
        game.app.stage.removeChild(child);
        child.destroy();
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
