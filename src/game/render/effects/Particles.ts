/**
 * Particles — fixed-size particle pool (spec 07 §3.7).
 *
 * Pre-allocates 200 particle slots and recycles dead ones. Emitters
 * (sword hits, magic bursts, dust kicks) call {@link Particles.emit}
 * to spawn; the game loop calls {@link Particles.update} each tick
 * and the React/Skia layer calls {@link Particles.draw} to render.
 *
 * Hard cap is 200 simultaneously active particles. Emits beyond the
 * cap silently fail (return `false`) — emitters should be tuned to
 * stay under the cap.
 *
 * The class is pure TypeScript: `draw` accepts a small canvas-like
 * interface so it can be tested without a real Skia runtime.
 *
 * @packageDocumentation
 */

import { logger } from '@/shared/log';

/** Hard cap on simultaneously active particles. */
export const MAX_PARTICLES = 200;

/** 2D point. */
export interface ParticlePoint {
  x: number;
  y: number;
}

/** 2D velocity (px/sec). */
export interface ParticleVelocity {
  vx: number;
  vy: number;
}

/** Color string accepted by Skia (CSS hex or `rgba(...)`). */
export type ParticleColor = string;

/** Shape drawn for each particle. */
export type ParticleShape = 'circle' | 'rect';

/** A single particle slot. */
export interface Particle {
  /** Current X position (world space). */
  x: number;
  /** Current Y position (world space). */
  y: number;
  /** Velocity X (px/sec). */
  vx: number;
  /** Velocity Y (px/sec). */
  vy: number;
  /** Color (CSS string). */
  color: ParticleColor;
  /** Remaining life in ms. */
  lifeMs: number;
  /** Initial life in ms — used for alpha fade. */
  initialLifeMs: number;
  /** Rendered size (radius for circle, half-extent for rect). */
  size: number;
  /** Whether to draw as a circle or rect. */
  shape: ParticleShape;
  /** Active flag. */
  alive: boolean;
}

/**
 * Minimal canvas interface for rendering particles. In production
 * this is Skia's `SkCanvas`; in tests it can be a mock that records
 * draw calls.
 */
export interface ParticlesCanvasLike {
  /** Draw a filled circle at `(cx, cy)` with `radius`. */
  drawCircle(cx: number, cy: number, radius: number, paint?: unknown): void;
  /** Draw a filled rect (x, y = top-left). */
  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    paint?: unknown,
  ): void;
}

/** Internal: factory for a fresh (dead) particle. */
function deadParticle(): Particle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    color: '#ffffff',
    lifeMs: 0,
    initialLifeMs: 0,
    size: 0,
    shape: 'circle',
    alive: false,
  };
}

/** Emit options for {@link Particles.emit}. */
export interface EmitOptions {
  /** Spawn position (world space). */
  position: ParticlePoint;
  /** Initial velocity (px/sec). */
  velocity: ParticleVelocity;
  /** Color (CSS hex). */
  color: ParticleColor;
  /** Life in ms before the particle expires. */
  lifeMs: number;
  /** Rendered size (px). */
  size: number;
  /** Shape — circle (default) or rect. */
  shape?: ParticleShape;
}

/**
 * 200-particle pool with fixed allocation.
 *
 * @example
 * ```ts
 * const particles = new Particles();
 * particles.emit({
 *   position: { x: 100, y: 100 },
 *   velocity: { vx: 30, vy: -40 },
 *   color: '#ff5555',
 *   lifeMs: 500,
 *   size: 3,
 * });
 * // Each tick:
 * particles.update(deltaMs);
 * particles.draw(skiaCanvas);
 * ```
 */
export class Particles {
  /** Fixed-size pool. Dead slots have `alive === false`. */
  public readonly pool: Particle[] = [];
  /** Maximum number of simultaneously active particles. */
  public readonly maxParticles: number = MAX_PARTICLES;
  /** Current active count. */
  private activeCount = 0;
  /** Cursor for round-robin slot search (avoids O(n) scans). */
  private searchCursor = 0;
  /** Last timestamp (ms) a pool-full warning was logged — throttles the
   * debug log so a saturated pool doesn't spam it every emit attempt. */
  private lastFullLogMs = 0;
  /** Minimum interval (ms) between pool-full debug logs. */
  private static readonly FULL_LOG_INTERVAL_MS = 1000;

  constructor(max: number = MAX_PARTICLES) {
    // Pre-allocate — no per-frame allocation.
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) {
      this.pool[i] = deadParticle();
    }
    this.maxParticles = max;
  }

  /** Number of currently active particles. */
  get count(): number {
    return this.activeCount;
  }

  /** Alias for `count` (matches the spec wording "track active count"). */
  getActiveCount(): number {
    return this.activeCount;
  }

  /** True if all slots are active (no room for new emits). */
  get isFull(): boolean {
    return this.activeCount >= this.maxParticles;
  }

  /**
   * Spawn a particle. Recycles the next dead slot (round-robin).
   *
   * @returns `true` if spawned, `false` if the pool was full.
   */
  emit(opts: EmitOptions): boolean {
    if (opts.lifeMs <= 0) {
      // No-op — would be instantly dead.
      return false;
    }
    const slot = this.findDeadSlot();
    if (slot === null) {
      this.logPoolFullThrottled();
      return false;
    }
    slot.x = opts.position.x;
    slot.y = opts.position.y;
    slot.vx = opts.velocity.vx;
    slot.vy = opts.velocity.vy;
    slot.color = opts.color;
    slot.lifeMs = opts.lifeMs;
    slot.initialLifeMs = opts.lifeMs;
    slot.size = opts.size;
    slot.shape = opts.shape ?? 'circle';
    slot.alive = true;
    this.activeCount++;
    return true;
  }

  /**
   * Convenience overload matching the spec's positional signature:
   * `emit(position, velocity, color, lifeMs, size)`.
   */
  emitRaw(
    position: ParticlePoint,
    velocity: ParticleVelocity,
    color: ParticleColor,
    lifeMs: number,
    size: number,
    shape: ParticleShape = 'circle',
  ): boolean {
    return this.emit({ position, velocity, color, lifeMs, size, shape });
  }

  /**
   * Advance all active particles by `deltaMs`. Moves them by their
   * velocity × dt, decrements life, and marks dead ones.
   */
  update(deltaMs: number): void {
    if (deltaMs <= 0) return;
    const dt = deltaMs / 1000;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!;
      if (!p.alive) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) {
        p.lifeMs = 0;
        p.alive = false;
        this.activeCount--;
      }
    }
  }

  /**
   * Render all active particles to a Skia-like canvas.
   *
   * @param canvas Canvas implementing {@link ParticlesCanvasLike}.
   * @param paintFactory Optional: called per particle to produce a
   *                     paint (so callers can set alpha based on
   *                     remaining life). If omitted, the renderer
   *                     passes `undefined` and the canvas must apply
   *                     its own default paint.
   */
  draw(
    canvas: ParticlesCanvasLike,
    paintFactory?: (p: Particle) => unknown,
  ): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!;
      if (!p.alive) continue;
      const paint = paintFactory ? paintFactory(p) : undefined;
      if (p.shape === 'rect') {
        // x, y is the center — convert to top-left for drawRect.
        canvas.drawRect(
          p.x - p.size,
          p.y - p.size,
          p.size * 2,
          p.size * 2,
          paint,
        );
      } else {
        canvas.drawCircle(p.x, p.y, p.size, paint);
      }
    }
  }

  /** Kill all particles (e.g. on scene change). */
  clear(): void {
    for (const p of this.pool) {
      p.alive = false;
      p.lifeMs = 0;
    }
    this.activeCount = 0;
    this.searchCursor = 0;
  }

  /**
   * Find the next dead slot using round-robin search starting from
   * the cursor. O(1) amortized.
   */
  private findDeadSlot(): Particle | null {
    const n = this.pool.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.searchCursor + i) % n;
      const p = this.pool[idx]!;
      if (!p.alive) {
        this.searchCursor = (idx + 1) % n;
        return p;
      }
    }
    return null;
  }

  /** Log "pool full" at most once per second (avoid hot-loop spam). */
  private logPoolFullThrottled(): void {
    const nowMs = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    if (nowMs - this.lastFullLogMs >= Particles.FULL_LOG_INTERVAL_MS) {
      this.lastFullLogMs = nowMs;
      logger.debug('Particles: pool full, emit dropped (throttled log)');
    }
  }
}

export default Particles;
