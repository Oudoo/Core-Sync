import { EventBus } from '../core/EventBus';
import { Config } from '../core/Config';
import { Note, NoteType } from '../chart/Note';

export type JudgmentType = 'perfect' | 'great' | 'good' | 'miss';

export interface ScoreStats {
  score: number;
  combo: number;
  maxCombo: number;
  multiplier: number;
  energy: number;
  perfects: number;
  greats: number;
  goods: number;
  misses: number;
}

export class ScoringSystem {
  private eventBus: EventBus;

  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private multiplier = 1;
  private energy = 1.0; // Starts full

  // Counters
  private perfects = 0;
  private greats = 0;
  private goods = 0;
  private misses = 0;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Reset stats for a new playthrough.
   */
  reset(): void {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.multiplier = 1;
    this.energy = 1.0;

    this.perfects = 0;
    this.greats = 0;
    this.goods = 0;
    this.misses = 0;

    this.emitUpdate();
  }

  /**
   * Evaluate a tap gesture against an target note's scheduled timestamp.
   * Returns the accuracy judgment.
   */
  judgeNote(note: Note, hitTime: number): JudgmentType {
    const diffMs = Math.abs(hitTime - note.time) * 1000;

    if (diffMs <= Config.PERFECT_WINDOW_MS) {
      this.registerHit('perfect');
      return 'perfect';
    } else if (diffMs <= Config.GREAT_WINDOW_MS) {
      this.registerHit('great');
      return 'great';
    } else if (diffMs <= Config.GOOD_WINDOW_MS) {
      this.registerHit('good');
      return 'good';
    } else {
      this.registerMiss();
      return 'miss';
    }
  }

  /**
   * Process a passive miss (e.g. note sailed past the bottom zone without hit).
   */
  registerMiss(): void {
    this.combo = 0;
    this.multiplier = 1;
    this.energy = Math.max(0.0, this.energy - Config.ENERGY_MISS_PENALTY);
    this.misses++;

    this.eventBus.emit('score:judgment', { judgment: 'miss', combo: 0 });
    this.emitUpdate();
  }

  /**
   * Apply score gains and combo triggers on successful hits.
   */
  registerHit(judgment: 'perfect' | 'great' | 'good'): void {
    let baseScore: number = Config.PERFECT_SCORE;
    if (judgment === 'great') {
      baseScore = Config.GREAT_SCORE;
      this.greats++;
    } else if (judgment === 'good') {
      baseScore = Config.GOOD_SCORE;
      this.goods++;
    } else {
      this.perfects++;
    }

    this.combo++;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }

    // Dynamic Multiplier: increase every 10 combo, cap at 4x
    this.multiplier = Math.min(4, 1 + Math.floor(this.combo / 10));

    this.score += baseScore * this.multiplier;
    this.energy = Math.min(1.0, this.energy + Config.ENERGY_HIT_GAIN);

    this.eventBus.emit('score:judgment', { judgment, combo: this.combo });
    this.emitUpdate();
  }

  /**
   * Periodic passive decay of energy.
   */
  updateDecay(): void {
    if (this.energy > 0) {
      this.energy = Math.max(0.0, this.energy - Config.ENERGY_DECAY_RATE);
      this.emitUpdate();
    }
  }

  private emitUpdate(): void {
    this.eventBus.emit('score:update', this.stats);
  }

  get stats(): ScoreStats {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      multiplier: this.multiplier,
      energy: this.energy,
      perfects: this.perfects,
      greats: this.greats,
      goods: this.goods,
      misses: this.misses,
    };
  }

  get currentEnergy(): number {
    return this.energy;
  }
}
