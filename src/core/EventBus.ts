/**
 * EventBus — typed pub/sub for decoupled communication between systems.
 *
 * DECISION: Simple synchronous dispatch with typed event map.
 * Async dispatch adds latency we can't afford in a rhythm game hot path.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventCallback = (...args: any[]) => void;

export class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.off(event, callback);
    };
  }

  /**
   * Subscribe to an event for a single firing, then auto-unsubscribe.
   */
  once(event: string, callback: EventCallback): () => void {
    const wrapper: EventCallback = (...args) => {
      this.off(event, wrapper);
      callback(...args);
    };
    return this.on(event, wrapper);
  }

  /**
   * Unsubscribe a specific callback from an event.
   */
  off(event: string, callback: EventCallback): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event synchronously to all subscribers.
   */
  emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event);
    if (set) {
      // Iterate a snapshot so handlers can safely unsubscribe during dispatch
      for (const cb of [...set]) {
        cb(...args);
      }
    }
  }

  /**
   * Remove all listeners for a specific event, or all events if none specified.
   */
  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Returns the number of listeners for a given event (debug utility).
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

/** Singleton event bus for the entire game. */
export const eventBus = new EventBus();
