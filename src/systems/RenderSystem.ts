import { Container, Graphics } from 'pixi.js';
import { Game } from '../core/Game';
import { Chart } from '../chart/Chart';
import { Note, NoteType } from '../chart/Note';
import { NotePool, NoteEntity } from '../pool/NotePool';
import { DifficultyConfigs } from '../chart/DifficultyBuilder';
import { mapRange, clamp } from '../utils/Math';

const LANE_COLORS = [0x00aaff, 0xff00cc, 0x00ffcc, 0xffaa00] as const;

export class RenderSystem {
  private game: Game;
  private parentContainer: Container;

  // Visual pools
  private notePool: NotePool;
  private activeNoteEntities = new Map<string, NoteEntity>();

  // Drawing elements
  private bg: Graphics;
  private lanesContainer: Container;
  private dividers: Graphics;
  private hitTargets: Graphics[] = [];
  private hitsPulse: number[] = [0, 0, 0, 0];

  // Layout parameters
  private hitZoneY = 0;
  private spawnZoneY = 50;
  private laneWidth = 0;

  // Audio-reactive lane glow levels (0-1 per lane)
  private laneGlow: number[] = [0, 0, 0, 0];

  constructor(game: Game, parentContainer: Container) {
    this.game = game;
    this.parentContainer = parentContainer;

    // Background drawn first (bottommost)
    this.bg = new Graphics();
    this.parentContainer.addChild(this.bg);

    this.lanesContainer = new Container();
    this.parentContainer.addChild(this.lanesContainer);

    this.dividers = new Graphics();
    this.lanesContainer.addChild(this.dividers);

    this.notePool = new NotePool(this.parentContainer);

    this.calculateLayout();
    this.drawStaticLanes();
  }

  calculateLayout(): void {
    const w = this.game.width;
    const h = this.game.height;
    this.laneWidth = w / 4;
    this.hitZoneY = h * 0.82;
  }

  /**
   * Draw the background + lane columns.
   * Called once on init and when layout changes.
   */
  drawStaticLanes(): void {
    this.dividers.clear();
    const w = this.game.width;
    const h = this.game.height;

    // Dark base background
    this.bg.clear();
    this.bg.rect(0, 0, w, h);
    this.bg.fill({ color: 0x050510 });

    // Lane columns — subtle colored tint
    for (let i = 0; i < 4; i++) {
      const x = i * this.laneWidth;
      this.dividers.rect(x + 1, 0, this.laneWidth - 2, h);
      this.dividers.fill({ color: LANE_COLORS[i], alpha: 0.04 });
    }

    // Lane dividers (vertical lines)
    for (let i = 1; i < 4; i++) {
      const x = i * this.laneWidth;
      this.dividers.moveTo(x, 0);
      this.dividers.lineTo(x, h);
      this.dividers.stroke({ width: 1, color: 0x334466, alpha: 0.5 });
    }

    // Hit zone horizontal line
    this.dividers.moveTo(0, this.hitZoneY);
    this.dividers.lineTo(w, this.hitZoneY);
    this.dividers.stroke({ width: 1, color: 0x334466, alpha: 0.4 });

    // Hit target pads
    this.hitTargets.forEach((t) => t.destroy());
    this.hitTargets = [];
    for (let i = 0; i < 4; i++) {
      const pad = new Graphics();
      this.lanesContainer.addChild(pad);
      this.hitTargets.push(pad);
      this.updateHitPadDraw(i, 1.0);
    }
  }

  /**
   * Update audio-reactive lane glow levels.
   * Call each frame with normalized energy values (0–1).
   */
  setLaneGlow(low: number, mid: number, high: number): void {
    // Distribute energy across lanes
    this.laneGlow[0] = clamp(low * 0.8, 0, 1);
    this.laneGlow[1] = clamp(mid * 0.8, 0, 1);
    this.laneGlow[2] = clamp(mid * 0.8, 0, 1);
    this.laneGlow[3] = clamp(high * 0.8, 0, 1);

    const w = this.game.width;
    const h = this.game.height;
    this.bg.clear();
    this.bg.rect(0, 0, w, h);
    this.bg.fill({ color: 0x050510 });

    for (let i = 0; i < 4; i++) {
      const x = i * this.laneWidth;
      const alpha = 0.04 + this.laneGlow[i] * 0.12;
      this.bg.rect(x + 1, 0, this.laneWidth - 2, h);
      this.bg.fill({ color: LANE_COLORS[i], alpha });
    }
  }

  private updateHitPadDraw(lane: number, scale: number): void {
    const pad = this.hitTargets[lane];
    if (!pad) return;
    pad.clear();
    const x = lane * this.laneWidth + this.laneWidth / 2;
    const color = LANE_COLORS[lane];

    // Outer ring glow
    pad.circle(x, this.hitZoneY, 28 * scale);
    pad.stroke({ width: 2, color, alpha: 0.55 });

    // Inner pad
    pad.circle(x, this.hitZoneY, 18 * scale);
    pad.fill({ color, alpha: 0.15 });

    // Bright center dot
    pad.circle(x, this.hitZoneY, 5);
    pad.fill({ color, alpha: 0.8 });
  }

  pulseLane(lane: number): void {
    if (lane >= 0 && lane < 4) {
      this.hitsPulse[lane] = 1.4;
    }
  }

  update(chart: Chart, onMiss: (note: Note) => void): void {
    const songTime = this.game.clock.songTime;
    const config = DifficultyConfigs[chart.difficulty];

    // Animate hit pad pulses
    for (let i = 0; i < 4; i++) {
      if (this.hitsPulse[i] > 1.0) {
        this.hitsPulse[i] -= 0.05;
        this.updateHitPadDraw(i, this.hitsPulse[i]);
      } else {
        this.hitsPulse[i] = 1.0;
        this.updateHitPadDraw(i, 1.0);
      }
    }

    // Spawn notes inside lookahead window
    for (let i = 0; i < chart.notes.length; i++) {
      const note = chart.notes[i];
      if (note.time - config.lookaheadS > songTime) break;

      if (note.time + config.lookaheadS < songTime) {
        if (!this.activeNoteEntities.has(note.id) && note.time + 0.15 < songTime && !note.id.startsWith('passed_')) {
          onMiss(note);
          (note as any).id = 'passed_' + note.id;
        }
        continue;
      }

      if (!this.activeNoteEntities.has(note.id) && !note.id.startsWith('passed_')) {
        const entity = this.notePool.obtain(note);
        this.activeNoteEntities.set(note.id, entity);
      }
    }

    // Update active note positions
    for (const [id, entity] of this.activeNoteEntities.entries()) {
      const note = entity.noteData;

      if (entity.isHit || entity.isMissed) {
        this.notePool.release(entity);
        this.activeNoteEntities.delete(id);
        continue;
      }

      const noteThreshold = note.type === NoteType.HOLD
        ? note.time + note.duration + 0.15
        : note.time + 0.15;

      if (songTime > noteThreshold) {
        entity.isMissed = true;
        onMiss(note);
        this.notePool.release(entity);
        this.activeNoteEntities.delete(id);
        continue;
      }

      const laneX = note.lane * this.laneWidth + this.laneWidth / 2;
      const spawnTime = note.time - config.scrollSpeedS;
      const progress = clamp(mapRange(songTime, spawnTime, note.time, 0.0, 1.0), 0.0, 2.0);
      const currentY = this.spawnZoneY + progress * (this.hitZoneY - this.spawnZoneY);

      entity.position.set(laneX, currentY);

      if (note.type === NoteType.HOLD && note.duration > 0) {
        const tail = entity.holdTail!;
        tail.clear();

        const tailEndTime = note.time + note.duration;
        const tailProgress = clamp(mapRange(songTime, spawnTime, tailEndTime, 0.0, 1.0), 0.0, 2.0);
        const tailEndY = this.spawnZoneY + tailProgress * (this.hitZoneY - this.spawnZoneY);
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
    this.bg.destroy();
  }
}
