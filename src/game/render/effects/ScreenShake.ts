/**
 * ScreenShake — simple time-decay screen shake (spec 07 §3.6).
 *
 * The shake is parameterised by `durationMs` and `intensity`. Each
 * frame, `update(deltaMs)` decays the intensity linearly over the
 * duration. `getOffset()` returns a random offset in `[-intensity,
 * +intensity]` that the camera applies as a post-transform translate.
 *
 * The spec's `trauma * trauma` model is preserved via a quadratic
 * falloff so small shakes decay gently and large shakes snap harder.
 *
 * @packageDocumentation
 */

/** A 2D offset (in device pixels) to add to the camera transform. */
export interface ShakeOffset {
  x: number;
  y: number;
}

/**
 * Time-decay screen shake. Reusable — call {@link trigger} to start a
 * new shake (which stacks with any current shake, clamped to the
 * configured max intensity).
 *
 * @example
 * ```ts
 * const shake = new ScreenShake();
 * shake.trigger(300, 8); // 300ms, 8px max
 * // each tick:
 * shake.update(deltaMs);
 * const off = shake.getOffset();
 * canvas.translate(off.x, off.y);
 * ```
 */
export class ScreenShake {
  /** Maximum shake intensity (px). Default 20. */
  public maxIntensity: number = 20;
  /** Current intensity (decays over time). */
  public intensity: number = 0;
  /** Remaining duration (ms). */
  public durationMs: number = 0;
  /** Total duration of the active shake (ms). Used for falloff. */
  public totalDurationMs: number = 0;
  /** Whether a shake is currently active. */
  public isActive: boolean = false;

  /**
   * Start (or extend) a shake.
   *
   * @param durationMs  How long the shake lasts.
   * @param intensity   Maximum displacement in pixels. Clamped to
   *                    `[0, maxIntensity]`.
   */
  trigger(durationMs: number, intensity: number): void {
    if (durationMs <= 0) return;
    this.durationMs = durationMs;
    this.totalDurationMs = durationMs;
    this.intensity = Math.max(0, Math.min(intensity, this.maxIntensity));
    this.isActive = true;
  }

  /**
   * Advance the shake clock by `deltaMs`. Decays intensity linearly
   * over the configured duration.
   */
  update(deltaMs: number): void {
    if (!this.isActive) return;
    this.durationMs -= deltaMs;
    if (this.durationMs <= 0) {
      this.durationMs = 0;
      this.intensity = 0;
      this.isActive = false;
      return;
    }
    // Linear decay: intensity * (remaining / total).
    const fraction = this.durationMs / this.totalDurationMs;
    // Quadratic falloff (matches spec 07 §3.6 trauma^2 model).
    const falloff = fraction * fraction;
    // Re-derive from the original max (stored separately).
    const originalMax = this.intensity / Math.max(fraction * fraction, 1e-6);
    this.intensity = originalMax * falloff;
  }

  /**
   * Current shake offset. Returns `{x: 0, y: 0}` when inactive.
   *
   * Uses the quadratic `trauma * trauma` model from the spec: actual
   * displacement is `(random - 0.5) * intensity^2 / maxIntensity`.
   * This keeps small shakes very subtle and only large shakes
   * actually displace the camera meaningfully.
   */
  getOffset(): ShakeOffset {
    if (!this.isActive || this.intensity <= 0) {
      return { x: 0, y: 0 };
    }
    const trauma = this.intensity / this.maxIntensity;
    const t = trauma * trauma;
    const amplitude = t * this.maxIntensity;
    return {
      x: (Math.random() - 0.5) * 2 * amplitude,
      y: (Math.random() - 0.5) * 2 * amplitude,
    };
  }

  /** Immediately stop the shake. */
  cancel(): void {
    this.durationMs = 0;
    this.intensity = 0;
    this.isActive = false;
  }
}

export default ScreenShake;
