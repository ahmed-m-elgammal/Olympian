/**
 * RenderSystem — collect, sort, and expose draw commands (spec 07 §3.2).
 *
 * Per spec 07 §1.5, the RenderSystem is the last system to run each
 * tick. It does NOT draw — it produces a flat, sorted list of
 * {@link DrawCommand}s that the Skia layer consumes (typically via a
 * Zustand store or a direct call to `getCommands()` after the systems
 * have run).
 *
 * Lifecycle each frame:
 *
 *  1. `clear()` — drop the previous frame's commands.
 *  2. Other systems (SpriteSystem, UISystem, DebugSystem, ...) call
 *     `submit(commands)` to add their draws.
 *  3. `sort()` — order by `zIndex` ascending (back-to-front).
 *  4. `getCommands()` — Skia renderer iterates and draws.
 *
 * @packageDocumentation
 */

import { logger } from '@/shared/log';
import type { DrawCommand } from './DrawCommand';

/** Default max commands per frame — guards against runaway submits. */
export const DEFAULT_MAX_COMMANDS = 4096;

/**
 * Collects draw commands per frame, sorts them by z-index, and
 * exposes them to the Skia renderer.
 *
 * @example
 * ```ts
 * const rs = new RenderSystem();
 *
 * // each frame:
 * rs.clear();
 * rs.submit(spriteSystem.produce());
 * rs.submit(uiSystem.produce());
 * rs.sort();
 * const cmds = rs.getCommands();
 * skiaRenderer.flush(cmds);
 * ```
 */
export class RenderSystem {
  /** Current frame's commands (in submit order until sort()). */
  private commands: DrawCommand[] = [];
  /** Max commands before a warning is logged. */
  public readonly maxCommands: number;

  constructor(maxCommands: number = DEFAULT_MAX_COMMANDS) {
    this.maxCommands = maxCommands;
  }

  /** Number of commands currently buffered. */
  get count(): number {
    return this.commands.length;
  }

  /** Whether the buffer is empty. */
  get isEmpty(): boolean {
    return this.commands.length === 0;
  }

  /**
   * Add one or more commands to the current frame's buffer. Commands
   * are pushed in array order; their relative order is preserved up
   * until {@link sort}.
   *
   * Silently drops commands beyond {@link maxCommands} (with a
   * warning log) to avoid runaway memory.
   */
  submit(commands: DrawCommand[] | DrawCommand): void {
    const list = Array.isArray(commands) ? commands : [commands];
    for (const cmd of list) {
      if (this.commands.length >= this.maxCommands) {
        logger.warn(
          `RenderSystem: max commands (${this.maxCommands}) reached; dropping further submits`,
        );
        return;
      }
      this.commands.push(cmd);
    }
  }

  /**
   * Sort the buffer by `zIndex` ascending (lower = back, higher =
   * front). Uses a stable sort so commands with equal zIndex preserve
   * their submit order.
   */
  sort(): void {
    // Array.prototype.sort is stable in V8 / modern engines (Node 12+).
    this.commands.sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Empty the buffer. Call at the start of each frame.
   */
  clear(): void {
    // Keep the array reference stable (micro-opt: avoids GC churn by
    // reusing the backing array).
    this.commands.length = 0;
  }

  /**
   * Get the current buffer (read-only view). The returned array is
   * the live internal array — do NOT mutate it.
   */
  getCommands(): DrawCommand[] {
    return this.commands;
  }

  /**
   * Convenience: returns commands whose `type` matches the given
   * filter. Allocates a new array; use sparingly.
   */
  filterByType(type: DrawCommand['type']): DrawCommand[] {
    return this.commands.filter((c) => c.type === type);
  }

  /** Snapshot the current buffer (defensive copy). Useful for tests. */
  snapshot(): DrawCommand[] {
    return this.commands.slice();
  }
}

export default RenderSystem;
