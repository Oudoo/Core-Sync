import { Container, Graphics } from 'pixi.js';
import { Note, NoteType } from '../chart/Note';
import { ObjectPool } from './ObjectPool';

export class NoteEntity extends Container {
  public noteData!: Note;
  public isHit = false;
  public isMissed = false;
  public holdPressed = false;
  public holdProgress = 0; // 0.0 to 1.0 for Hold notes

  readonly body: Graphics;
  readonly glow: Graphics;
  readonly holdTail?: Graphics; // Render holds as long neon tails

  constructor() {
    super();

    // Setup visual components
    this.glow = new Graphics();
    this.body = new Graphics();
    this.holdTail = new Graphics();

    this.addChild(this.holdTail);
    this.addChild(this.glow);
    this.addChild(this.body);

    this.visible = false;
  }

  /**
   * Initialize or recycle this note visual entity with a note model.
   */
  init(note: Note): void {
    this.noteData = note;
    this.isHit = false;
    this.isMissed = false;
    this.holdPressed = false;
    this.holdProgress = 0;
    this.alpha = 1.0;
    this.scale.set(1.0);
    this.visible = true;

    this.redraw();
  }

  /**
   * Perform drawing of note shape based on type.
   */
  redraw(): void {
    this.body.clear();
    this.glow.clear();
    this.holdTail!.clear();

    const size = this.noteData.type === NoteType.SPARK ? 10 : 16;
    let neonColor = 0x00ffff; // TAP = Cyan neon

    if (this.noteData.type === NoteType.HOLD) {
      neonColor = 0xff00ff; // HOLD = Magenta neon
    } else if (this.noteData.type === NoteType.SPARK) {
      neonColor = 0xffcc00; // SPARK = Gold neon
    }

    // 1. Draw Glow Aura (smaller — 1.5x not 2.2x to avoid lane bleed)
    this.glow.circle(0, 0, size * 1.5);
    this.glow.fill({ color: neonColor, alpha: 0.18 });

    // 2. Draw Core Orb
    this.body.circle(0, 0, size);
    this.body.fill({ color: 0xffffff });
    this.body.stroke({ width: 3, color: neonColor });

    // Inner bright core
    this.body.circle(0, 0, size * 0.42);
    this.body.fill({ color: neonColor, alpha: 0.85 });

    // 3. Draw Hold Tail
    if (this.noteData.type === NoteType.HOLD && this.noteData.duration > 0) {
      // Tail is rendered downwards/upwards during approach.
      // We will clear and update tail dynamically in RenderSystem since its scale/length
      // depends on approach/zoom speeds.
    }
  }

  /**
   * Reset entity back to default state upon return to pool.
   */
  reset(): void {
    this.visible = false;
    this.alpha = 1.0;
    this.scale.set(1.0);
    this.isHit = false;
    this.isMissed = false;
    this.holdPressed = false;
    this.holdProgress = 0;
    this.body.clear();
    this.glow.clear();
    this.holdTail!.clear();
  }
}

export class NotePool {
  private pool: ObjectPool<NoteEntity>;

  constructor(parentContainer: Container) {
    this.pool = new ObjectPool<NoteEntity>(
      () => {
        const entity = new NoteEntity();
        parentContainer.addChild(entity);
        return entity;
      },
      (entity) => {
        entity.reset();
      },
      30 // Prefill size
    );
  }

  obtain(note: Note): NoteEntity {
    const entity = this.pool.obtain();
    entity.init(note);
    return entity;
  }

  release(entity: NoteEntity): void {
    this.pool.release(entity);
  }

  clear(): void {
    this.pool.clear();
  }
}
