import { Container, Graphics } from 'pixi.js';
import { ObjectPool } from './ObjectPool';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  alpha: number;
  size: number;
  decay: number;
  active: boolean;
}

export class ParticlePool {
  private particles: Particle[] = [];
  private pool: ObjectPool<Particle>;
  private graphics: Graphics;

  constructor(parentContainer: Container) {
    this.graphics = new Graphics();
    parentContainer.addChild(this.graphics);

    // Initialise object pool
    this.pool = new ObjectPool<Particle>(
      () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        color: 0xffffff,
        alpha: 1.0,
        size: 4,
        decay: 0.02,
        active: false,
      }),
      (p) => {
        p.active = false;
      },
      500 // Pre-allocate up to maximum particle budget
    );
  }

  /**
   * Spawn a burst of glowing neon particles at a target position.
   */
  spawnBurst(x: number, y: number, color: number, count: number = 20): void {
    const targetCount = Math.min(count, 500 - this.particles.length);
    
    for (let i = 0; i < targetCount; i++) {
      const p = this.pool.obtain();
      
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.color = color;
      p.alpha = 1.0;
      p.size = 2 + Math.random() * 6;
      p.decay = 0.015 + Math.random() * 0.025;
      p.active = true;

      this.particles.push(p);
    }
  }

  /**
   * Update active particles and redraw vector shapes.
   */
  update(): void {
    this.graphics.clear();
    
    if (this.particles.length === 0) return;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Update positions
      p.x += p.vx;
      p.y += p.vy;
      
      // Decelerate slightly
      p.vx *= 0.98;
      p.vy *= 0.98;

      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        p.active = false;
        this.pool.release(p);
        this.particles.splice(i, 1);
        continue;
      }

      // Draw particle circle with additive neon blend mode
      this.graphics.circle(p.x, p.y, p.size);
      this.graphics.fill({ color: p.color, alpha: p.alpha });
    }
  }

  /**
   * Flush all active particles.
   */
  clear(): void {
    this.particles.forEach((p) => this.pool.release(p));
    this.particles = [];
    this.graphics.clear();
  }

  destroy(): void {
    this.clear();
    this.graphics.destroy();
    this.pool.clear();
  }
}
