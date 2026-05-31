/**
 * High-performance generic object recycling pool.
 * Prevents GC thrashing during active gameplay.
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private resetFn?: (item: T) => void;

  constructor(factory: () => T, resetFn?: (item: T) => void, initialSize: number = 0) {
    this.factory = factory;
    this.resetFn = resetFn;

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.factory());
    }
  }

  /**
   * Check out an object from the pool. Creates a new one if empty.
   */
  obtain(): T {
    return this.pool.length > 0 ? this.pool.pop()! : this.factory();
  }

  /**
   * Return an object to the pool for future reuse.
   */
  release(item: T): void {
    if (this.resetFn) {
      this.resetFn(item);
    }
    this.pool.push(item);
  }

  /**
   * Clear the pool's cached objects.
   */
  clear(): void {
    this.pool = [];
  }

  /**
   * Get current size of the pool.
   */
  get size(): number {
    return this.pool.length;
  }
}
