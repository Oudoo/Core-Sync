import { EventBus } from '../core/EventBus';
import { Config } from '../core/Config';

export interface TouchInfo {
  pointerId: number;
  lane: number;
  startX: number;
  startY: number;
}

export class InputSystem {
  private canvas: HTMLCanvasElement;
  private eventBus: EventBus;

  // Track active pointer IDs to lanes mapping
  private activePointers = new Map<number, number>(); // pointerId => lane
  private laneHoldState = new Array<boolean>(Config.LANE_COUNT).fill(false);

  constructor(canvas: HTMLCanvasElement, eventBus: EventBus) {
    this.canvas = canvas;
    this.eventBus = eventBus;

    this.bindEvents();
  }

  private bindEvents(): void {
    // We bind pointer events to enable multi-touch on mobile & click on desktop
    this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
    this.canvas.addEventListener('pointercancel', this.onPointerUp.bind(this));
  }

  private onPointerDown(e: PointerEvent): void {
    e.preventDefault();

    const lane = this.getLaneFromX(e.clientX);
    if (lane < 0 || lane >= Config.LANE_COUNT) return;

    this.activePointers.set(e.pointerId, lane);
    this.updateLaneHoldState();

    this.eventBus.emit('input:down', {
      lane,
      pointerId: e.pointerId,
      time: performance.now(),
    });
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.activePointers.has(e.pointerId)) return;

    const previousLane = this.activePointers.get(e.pointerId)!;
    const currentLane = this.getLaneFromX(e.clientX);

    if (currentLane !== previousLane && currentLane >= 0 && currentLane < Config.LANE_COUNT) {
      // Finger slid to a different lane
      this.activePointers.set(e.pointerId, currentLane);
      this.updateLaneHoldState();

      this.eventBus.emit('input:up', {
        lane: previousLane,
        pointerId: e.pointerId,
        time: performance.now(),
      });

      this.eventBus.emit('input:down', {
        lane: currentLane,
        pointerId: e.pointerId,
        time: performance.now(),
      });
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.activePointers.has(e.pointerId)) return;

    const lane = this.activePointers.get(e.pointerId)!;
    this.activePointers.delete(e.pointerId);
    this.updateLaneHoldState();

    this.eventBus.emit('input:up', {
      lane,
      pointerId: e.pointerId,
      time: performance.now(),
    });
  }

  /**
   * Translate screen clientX to lane index based on vertical columns.
   */
  private getLaneFromX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const laneWidth = rect.width / Config.LANE_COUNT;
    return Math.floor(x / laneWidth);
  }

  private updateLaneHoldState(): void {
    this.laneHoldState.fill(false);
    for (const lane of this.activePointers.values()) {
      if (lane >= 0 && lane < Config.LANE_COUNT) {
        this.laneHoldState[lane] = true;
      }
    }
  }

  /**
   * Check if a specific lane is currently being held.
   */
  isLaneHeld(lane: number): boolean {
    return this.laneHoldState[lane] ?? false;
  }

  /**
   * Clean listeners on destroy.
   */
  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown.bind(this));
    this.canvas.removeEventListener('pointermove', this.onPointerMove.bind(this));
    this.canvas.removeEventListener('pointerup', this.onPointerUp.bind(this));
    this.canvas.removeEventListener('pointercancel', this.onPointerUp.bind(this));
    this.activePointers.clear();
  }
}
