import { Graphics } from 'pixi.js';
import { NoteType } from '../chart/Note';

export class TrailRenderer {
  /**
   * Draw a glowing neon motion trail extending upwards from a note head.
   */
  static draw(graphics: Graphics, y: number, type: NoteType, isPressed: boolean = false): void {
    graphics.clear();

    const trailLength = type === NoteType.SPARK ? 60 : 120;
    let neonColor = 0x00ffff; // Tap

    if (type === NoteType.HOLD) {
      neonColor = 0xff00ff; // Hold
    } else if (type === NoteType.SPARK) {
      neonColor = 0xffcc00; // Spark
    }

    const alphaScale = isPressed ? 0.8 : 0.45;
    const width = type === NoteType.SPARK ? 4 : 8;

    // Draw fading segments representing a gradient trail
    for (let i = 0; i < 5; i++) {
      const segStart = y - (i * trailLength) / 5;
      const segEnd = y - ((i + 1) * trailLength) / 5;
      const segAlpha = alphaScale * (1.0 - i / 5);

      graphics.moveTo(0, segStart);
      graphics.lineTo(0, segEnd);
      graphics.stroke({
        width: width * (1.0 - i / 10),
        color: neonColor,
        alpha: segAlpha,
        cap: 'round',
      });
    }
  }
}
