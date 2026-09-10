/**
 * GameLoop — fixed-timestep, 60Hz game loop (spec 07 §2).
 *
 * The loop runs the simulation at a fixed 60Hz regardless of the
 * display refresh rate. Each frame:
 *
 *  1. Add the elapsed wall-clock delta (in seconds) to an accumulator.
 *  2. While `accumulator >= FIXED_DT` (1/60s), call `world.step(dt)`
 *     and subtract `FIXED_DT` from the accumulator. This decouples
 *     physics from framerate — collisions and integrations are
 *     deterministic.
 *  3. After stepping, call `world.render()` once. Rendering uses the
 *     leftover fractional accumulator for interpolation (handled by
 *     the renderer, not this loop).
 *
 * **Spiral-of-death protection:** if the accumulator exceeds 0.25s
 * (e.g. the device stalled, the JS thread was blocked, the debugger
 * was open), it is clamped — we accept losing some simulation time
 * rather than run an unbounded number of catch-up steps.
 *
 * @packageDocumentation
 */

import { logger } from '@/shared/log';

/**
 * Minimal world interface the loop drives. In production this is the
 * ECS `World`; for tests it can be any object with these two methods.
 */
export interface World {
  /** Advance the simulation by `dt` seconds (fixed timestep). */
  step(dt: number): void;
  /** Render the current world state once. */
  render(): void;
}

/** Maximum number of catch-up steps to run in a single tick. */
export const MAX_STEPS_PER_TICK = 5;

/** Maximum accumulator before we drop the excess (seconds). */
export const MAX_ACCUMULATOR_SEC = 0.25;

/**
 * Fixed-timestep game loop.
 *
 * @example
 * ```ts
 * const loop = new GameLoop(world);
 * loop.start();
 * // ... later, on app background:
 * loop.setPaused(true);
 * // ... on app foreground:
 * loop.setPaused(false);
 * // ... on teardown:
 * loop.stop();
 * ```
 */
export class GameLoop {
  /** Time accumulator (in seconds). */
  private accumulator = 0;
  /** Fixed simulation timestep (1/60s). */
  private readonly FIXED_DT = 1 / 60;
  /** Wall-clock time of the previous frame (ms since epoch). */
  private lastTime = 0;
  /** Active `requestAnimationFrame` handle, or null if stopped. */
  private rafHandle: number | null = null;
  /** Pause flag — when true, `tick` is skipped (but rAF keeps running). */
  private isPaused = false;
  /** The world being simulated. */
  public readonly world: World;

  constructor(world: World) {
    this.world = world;
  }

  /** Whether the loop is currently running (between `start` and `stop`). */
  get isRunning(): boolean {
    return this.rafHandle !== null;
  }

  /** Whether the loop is paused (rAF still runs, but ticks are skipped). */
  get paused(): boolean {
    return this.isPaused;
  }

  /**
   * Begin driving the loop with `requestAnimationFrame`. Safe to call
   * repeatedly — subsequent calls are no-ops.
   */
  start(): void {
    if (this.rafHandle !== null) return;
    this.lastTime = now();
    const tick = (timeMs: number): void => {
      const delta = timeMs - this.lastTime;
      this.lastTime = timeMs;
      if (!this.isPaused) {
        this.tick(delta);
      }
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  /**
   * Stop driving the loop. Cancels the active rAF handle. Safe to
   * call when already stopped.
   */
  stop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  /**
   * Pause / resume the simulation. While paused, the rAF loop keeps
   * running (so resume is instant) but `tick` is not called.
   */
  setPaused(paused: boolean): void {
    this.isPaused = paused;
    // Reset lastTime so the next frame's delta doesn't include the
    // paused interval (which would inflate the accumulator).
    this.lastTime = now();
  }

  /**
   * Advance the simulation by `deltaMs` of wall-clock time. Adds to
   * the accumulator and runs `world.step(FIXED_DT)` while the
   * accumulator has enough time, then renders once.
   *
   * Exposed for testing — in production this is called from the rAF
   * callback set up by {@link start}.
   */
  tick(deltaMs: number): void {
    if (deltaMs < 0) {
      // Defensive: clock went backwards. Drop the frame.
      return;
    }
    const dtSec = deltaMs / 1000;
    this.accumulator += dtSec;

    // Spiral-of-death protection: clamp the accumulator so we never
    // run more than MAX_STEPS_PER_TICK catch-up steps in one frame.
    if (this.accumulator > MAX_ACCUMULATOR_SEC) {
      logger.warn(
        `GameLoop: accumulator ${this.accumulator.toFixed(3)}s exceeds ${MAX_ACCUMULATOR_SEC}s — clamping (spiral-of-death protection)`,
      );
      this.accumulator = MAX_ACCUMULATOR_SEC;
    }

    let steps = 0;
    while (this.accumulator >= this.FIXED_DT && steps < MAX_STEPS_PER_TICK) {
      this.world.step(this.FIXED_DT);
      this.accumulator -= this.FIXED_DT;
      steps++;
    }

    // If we hit the step cap, drop the remaining accumulator — the
    // simulation is too far behind to catch up; better to drop time
    // than to never finish a frame.
    if (steps >= MAX_STEPS_PER_TICK) {
      this.accumulator = 0;
    }

    // Render once per rAF callback, regardless of step count.
    this.world.render();
  }

  /** Reset internal timing state (e.g. on scene change). */
  reset(): void {
    this.accumulator = 0;
    this.lastTime = now();
  }
}

/** Wall-clock time in ms. Wraps `performance.now()` so it can be mocked. */
function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export default GameLoop;
