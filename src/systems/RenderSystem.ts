import { Container, Graphics } from 'pixi.js';
import { Game } from '../core/Game';
import { Chart } from '../chart/Chart';
import { Note, NoteType } from '../chart/Note';
import { NotePool, NoteEntity } from '../pool/NotePool';
import { DifficultyConfigs } from '../chart/DifficultyBuilder';
import { mapRange, clamp } from '../utils/Math';

export class RenderSystem {
  private game: Game;
  private parentContainer: Container;
  
  // Visual pools
  private notePool: NotePool;
  private activeNoteEntities = new Map<string, NoteEntity>(); // Keyed by note.id

  // Drawing elements
  private lanesContainer: Container;
  private dividers: Graphics;
  private hitTargets: Graphics[] = [];
  private hitsPulse: number[] = [0, 0, 0, 0]; // Visual scale trigger for hits

  // Layout parameters
  private hitZoneY = 0;
  private spawnZoneY = 50;
  private laneWidth = 0;

  constructor(game: Game, parentContainer: Container) {
    this.game = game;
    this.parentContainer = parentContainer;

    this.lanesContainer = new Container();
    this.parentContainer.addChild(this.lanesContainer);

    this.dividers = new Graphics();
    this.lanesContainer.addChild(this.dividers);

    this.notePool = new NotePool(this.parentContainer);

    this.calculateLayout();
    this.drawStaticLanes();
  }

  /**
   * Recalculate positions based on current screen dimensions.
   */
  calculateLayout(): void {
    const w = this.game.width;
    const h = this.game.height;

    this.laneWidth = w / 4;
    this.hitZoneY = h * 0.82; // Hit zone at 82% of screen height
  }

  /**
   * Draw structural vertical dividers and baseline hit pad glows.
   */
  drawStaticLanes(): void {
    this.dividers.clear();
    const w = this.game.width;
    const h = this.game.height;

    // Draw transparent background columns
    for (let i = 0; i < 4; i++) {
      const x = i * this.laneWidth;
      
      // Subtle background column shading
      this.dividers.rect(x, 0, this.laneWidth, h);
      this.dividers.fill({ color: 0x050510, alpha: 0.15 });

      if (i > 0) {
        // Lane dividers
        this.dividers.moveTo(x, 0);
        this.dividers.lineTo(x, h);
        this.dividers.stroke({ width: 1.5, color: 0x112244, alpha: 0.5 });
      }
    }

    // Clear previous hit target pads if any
    this.hitTargets.forEach((t) => t.destroy());
    this.hitTargets = [];

    // Draw Hit Zone baseline targets
    for (let i = 0; i < 4; i++) {
      const pad = new Graphics();
      const x = i * this.laneWidth + this.laneWidth / 2;

      this.lanesContainer.addChild(pad);
      this.hitTargets.push(pad);

      this.updateHitPadDraw(i, 1.0);
    }
  }

  /**
   * Updates visual shape and glow scaling of a lane hit-pad.
   */
  private updateHitPadDraw(lane: number, scale: number): void {
    const pad = this.hitTargets[lane];
    if (!pad) return;

    pad.clear();
    const x = lane * this.laneWidth + this.laneWidth / 2;

    // Static Cyan glowing ring
    pad.circle(x, this.hitZoneY, 24 * scale);
    pad.stroke({ width: 2, color: 0x00ffff, alpha: 0.45 });

    // Inner target core
    pad.circle(x, this.hitZoneY, 8);
    pad.fill({ color: 0x00ffff, alpha: 0.25 });
  }

  /**
   * Triggers visual hit pulse when user taps a lane.
   */
  pulseLane(lane: number): void {
    if (lane >= 0 && lane < 4) {
      this.hitsPulse[lane] = 1.35; // Target scale spike
    }
  }

  /**
   * Frame tick updating positions of active notes.
   */
  update(chart: Chart, onMiss: (note: Note) => void): void {
    const songTime = this.game.clock.songTime;
    const config = DifficultyConfigs[chart.difficulty];

    // Shrink hit pad pulse animations
    for (let i = 0; i < 4; i++) {
      if (this.hitsPulse[i] > 1.0) {
        this.hitsPulse[i] -= 0.05;
        this.updateHitPadDraw(i, this.hitsPulse[i]);
      } else {
        this.updateHitPadDraw(i, 1.0);
      }
    }

    // 1. Spawning Check: Identify notes inside the lookahead window
    for (let i = 0; i < chart.notes.length; i++) {
      const note = chart.notes[i];

      // Note has not spawned yet
      if (note.time - config.lookaheadS > songTime) {
        break; // Notes are sorted by time, so we can stop searching early
      }

      // Check if note entity already spawned
      if (note.time + config.lookaheadS < songTime) {
        // Past lookahead range — handle passive miss if not hit yet
        if (!this.activeNoteEntities.has(note.id) && note.time + 0.15 < songTime && !note.id.startsWith('passed_')) {
          onMiss(note);
          // Mark note model to prevent repeated triggers
          (note as any).id = 'passed_' + note.id;
        }
        continue;
      }

      if (!this.activeNoteEntities.has(note.id) && !note.id.startsWith('passed_')) {
        const entity = this.notePool.obtain(note);
        this.activeNoteEntities.set(note.id, entity);
      }
    }

    // 2. Position updates for active entities
    for (const [id, entity] of this.activeNoteEntities.entries()) {
      const note = entity.noteData;

      // Note has been processed and can be returned
      if (entity.isHit || entity.isMissed) {
        this.notePool.release(entity);
        this.activeNoteEntities.delete(id);
        continue;
      }

      // If note sails past the miss threshold, trigger miss
      const noteThreshold = note.type === NoteType.HOLD ? note.time + note.duration + 0.15 : note.time + 0.15;
      if (songTime > noteThreshold) {
        entity.isMissed = true;
        onMiss(note);
        this.notePool.release(entity);
        this.activeNoteEntities.delete(id);
        continue;
      }

      // Calculate current travel Y position
      // Notes move from spawnZoneY down to hitZoneY
      const laneX = note.lane * this.laneWidth + this.laneWidth / 2;
      
      const spawnTime = note.time - config.scrollSpeedS;
      const progress = clamp(mapRange(songTime, spawnTime, note.time, 0.0, 1.0), 0.0, 2.0);
      const currentY = this.spawnZoneY + progress * (this.hitZoneY - this.spawnZoneY);

      entity.position.set(laneX, currentY);

      // Render Hold tails specifically
      if (note.type === NoteType.HOLD && note.duration > 0) {
        const tail = entity.holdTail!;
        tail.clear();

        // Calculate tail endpoints
        const tailEndTime = note.time + note.duration;
        const tailProgress = clamp(mapRange(songTime, spawnTime, tailEndTime, 0.0, 1.0), 0.0, 2.0);
        const tailEndY = this.spawnZoneY + tailProgress * (this.hitZoneY - this.spawnZoneY);

        // Tail starts from note head and extends upwards (towards spawn)
        const tailHeight = currentY - tailEndY;

        if (tailHeight > 0) {
          const color = entity.holdPressed ? 0xff00ff : 0x880088;
          tail.rect(-6, -tailHeight, 12, tailHeight);
          tail.fill({ color, alpha: entity.holdPressed ? 0.6 : 0.3 });
          tail.stroke({ width: 2, color: 0xff00ff, alpha: entity.holdPressed ? 0.8 : 0.4 });
        }
      }
    }
  }

  /**
   * Find the closest note in a lane to check hits against.
   */
  getClosestActiveNote(lane: number, time: number): NoteEntity | null {
    let closestEntity: NoteEntity | null = null;
    let minDiff = Infinity;

    for (const entity of this.activeNoteEntities.values()) {
      if (entity.noteData.lane === lane && !entity.isHit && !entity.isMissed) {
        const diff = Math.abs(time - entity.noteData.time);
        if (diff < minDiff) {
          minDiff = diff;
          closestEntity = entity;
        }
      }
    }

    return closestEntity;
  }

  /**
   * Clean all active note entities.
   */
  clear(): void {
    for (const entity of this.activeNoteEntities.values()) {
      this.notePool.release(entity);
    }
    this.activeNoteEntities.clear();
    this.notePool.clear();
  }

  destroy(): void {
    this.clear();
    this.lanesContainer.destroy({ children: true });
  }
}
