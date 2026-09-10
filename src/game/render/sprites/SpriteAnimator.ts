/**
 * SpriteAnimator — frame-based animation over a {@link SpriteSheet}
 * (spec 07 §6.1).
 *
 * Each animator owns one animation sequence: an ordered list of frame
 * names, a playback rate, and a loop flag. The animator is advanced
 * manually via {@link SpriteAnimator.update} — typically called once
 * per game tick from the `AnimationSystem`.
 *
 * Semantics:
 *  - At construction, the animator points at frame 0 with 0ms elapsed.
 *  - Each `update(dtMs)` accumulates time; when enough has elapsed to
 *    advance one frame, `currentIndex` is bumped. Updates larger than
 *    one frame duration cause multi-frame advances.
 *  - Loop animations wrap modulo frame count and fire `onComplete`
 *    each time a cycle boundary is crossed.
 *  - Non-loop animations clamp to the last frame, set `isFinished`,
 *    fire `onComplete` exactly once, then return `null` from
 *    `update` thereafter. {@link getCurrentFrame} keeps returning the
 *    last frame's rect so the renderer can keep drawing the final pose.
 *
 * @packageDocumentation
 */

import type { Rect, SpriteSheet } from './SpriteSheet';

/** Constructor options for {@link SpriteAnimator}. */
export interface SpriteAnimatorOptions {
  /** Source sprite sheet used for rect lookup. */
  sheet: SpriteSheet;
  /** Logical name of this animation (e.g. `nemean_lion_idle`). */
  animationName: string;
  /** Ordered list of frame names from the sprite sheet. */
  frames: string[];
  /** Playback rate in frames per second. Must be > 0. */
  fps: number;
  /** Whether to loop at the end. Default `false`. */
  loop?: boolean;
  /**
   * Called when the animation completes a cycle. For loop animations
   * this fires once per cycle; for non-loop it fires once when the
   * animation finishes.
   */
  onComplete?: () => void;
}

/**
 * Frame-based sprite animator.
 *
 * @example
 * ```ts
 * const animator = new SpriteAnimator({
 *   sheet,
 *   animationName: 'lion_idle',
 *   frames: ['lion_0', 'lion_1', 'lion_2', 'lion_3'],
 *   fps: 10,
 *   loop: true,
 * });
 * // In each game tick:
 * animator.update(deltaMs);
 * const rect = animator.getCurrentFrame();
 * ```
 */
export class SpriteAnimator {
  /** Source sprite sheet. */
  public readonly sheet: SpriteSheet;
  /** Animation name (for debugging / lookup). */
  public readonly animationName: string;
  /** Frame names in playback order. */
  public readonly frames: readonly string[];
  /** Playback rate (frames per second). */
  public readonly fps: number;
  /** Whether the animation loops. */
  public readonly loop: boolean;
  /** Completion callback. */
  public onComplete?: () => void;

  /** Elapsed time since the last wrap, in milliseconds. */
  private elapsedMs = 0;
  /** Index into {@link frames} of the currently displayed frame. */
  private currentIndex = 0;
  /** True once a non-loop animation has finished. */
  private _isFinished = false;
  /** Guards `onComplete` against duplicate fires for non-loop. */
  private onCompleteFired = false;

  constructor(opts: SpriteAnimatorOptions) {
    if (!opts || !opts.sheet) {
      throw new Error('SpriteAnimator: sheet is required');
    }
    if (!Array.isArray(opts.frames) || opts.frames.length === 0) {
      throw new Error('SpriteAnimator: frames must be a non-empty array');
    }
    if (typeof opts.fps !== 'number' || opts.fps <= 0) {
      throw new Error('SpriteAnimator: fps must be a positive number');
    }
    this.sheet = opts.sheet;
    this.animationName = opts.animationName;
    this.frames = opts.frames;
    this.fps = opts.fps;
    this.loop = opts.loop ?? false;
    this.onComplete = opts.onComplete;
  }

  /** Index of the currently displayed frame. */
  get currentFrameIndex(): number {
    return this.currentIndex;
  }

  /** Total duration of one loop cycle, in ms. */
  get totalDurationMs(): number {
    return (this.frames.length * 1000) / this.fps;
  }

  /** Per-frame duration in ms. */
  get frameDurationMs(): number {
    return 1000 / this.fps;
  }

  /** True if a non-loop animation has finished. Loop animations never finish. */
  get isFinished(): boolean {
    return this._isFinished;
  }

  /**
   * Advance the animation by `deltaMs` milliseconds.
   *
   * @returns The current frame name after the update, or `null` if
   * the animation has finished (non-loop, post-completion). For loop
   * animations this always returns a frame name.
   */
  update(deltaMs: number): string | null {
    if (deltaMs < 0) {
      // Defensive: negative deltas are a bug in the caller. Ignore.
      return this.frames[this.currentIndex] ?? null;
    }

    // Already finished — never advance, signal null to caller.
    if (this._isFinished) {
      return null;
    }

    const totalFrames = this.frames.length;
    if (totalFrames === 0) {
      return null;
    }

    this.elapsedMs += deltaMs;
    const frameDuration = this.frameDurationMs;
    const totalDuration = this.totalDurationMs;

    let newIndex = Math.floor(this.elapsedMs / frameDuration);

    if (newIndex >= totalFrames) {
      if (this.loop) {
        // Wrap. Use modulo so the remainder drives the new frame.
        const cycles = Math.floor(this.elapsedMs / totalDuration);
        // Fire one callback per update call where a boundary was
        // crossed, even if multiple cycles completed in one tick.
        // (Most update calls advance one frame at a time.)
        if (cycles >= 1) {
          this.fireComplete();
        }
        this.elapsedMs = this.elapsedMs % totalDuration;
        newIndex = Math.floor(this.elapsedMs / frameDuration);
        // Defensive clamp in case of float drift.
        if (newIndex >= totalFrames) {
          newIndex = totalFrames - 1;
        }
      } else {
        // Non-loop: clamp to last frame, mark finished, fire callback.
        this.currentIndex = totalFrames - 1;
        this._isFinished = true;
        this.fireComplete();
        return null;
      }
    }

    this.currentIndex = newIndex;
    return this.frames[this.currentIndex] ?? null;
  }

  /**
   * Get the source rect for the currently displayed frame, suitable
   * for passing to Skia's `drawImageRect`. After a non-loop animation
   * finishes this still returns the last frame's rect so the renderer
   * can keep drawing the final pose.
   */
  getCurrentFrame(): Rect {
    const name = this.frames[this.currentIndex];
    if (!name) {
      // Should not happen — guards against malformed frames lists.
      throw new Error(
        `SpriteAnimator: no frame at index ${this.currentIndex}`,
      );
    }
    return this.sheet.getFrame(name);
  }

  /** Name of the currently displayed frame, or `null` if finished. */
  getCurrentFrameName(): string | null {
    if (this._isFinished) {
      return null;
    }
    return this.frames[this.currentIndex] ?? null;
  }

  /** Reset to frame 0 with no elapsed time and clear `isFinished`. */
  reset(): void {
    this.elapsedMs = 0;
    this.currentIndex = 0;
    this._isFinished = false;
    this.onCompleteFired = false;
  }

  /**
   * Fire the `onComplete` callback. For non-loop animations, fires at
   * most once. For loop animations, fires each cycle boundary.
   */
  private fireComplete(): void {
    if (this.loop) {
      // Loop fires every cycle — no de-dup.
      try {
        this.onComplete?.();
      } catch {
        // Swallow callback errors so the animator keeps running.
      }
      return;
    }
    if (this.onCompleteFired) {
      return;
    }
    this.onCompleteFired = true;
    try {
      this.onComplete?.();
    } catch {
      // Swallow callback errors.
    }
  }
}

export default SpriteAnimator;
