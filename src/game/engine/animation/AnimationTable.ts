/**
 * AnimationTable — runtime animation registry resolved from atlas
 * manifests (spec 07 §6.1).
 *
 * The atlas manifest ships an `animations` table:
 *
 * ```json
 * { "hero_idle_down": { "frames": ["hero_idle_down_0", ...], "fps": 8, "loop": true } }
 * ```
 *
 * `AnimationTable` indexes it for O(1) lookup by the `AnimationSystem`
 * and exposes {@link setAnimation}, the single sanctioned way gameplay
 * code transitions an entity's animation (it resets frame/elapsed/fps
 * state so transitions never carry stale timing).
 *
 * @packageDocumentation
 */

import { logger } from '@/shared/log';
import type { Animation } from '../ecs/components';

/** One animation definition (matches the manifest JSON shape). */
export interface AnimationDefinition {
  /** Ordered frame names (must exist in the same atlas). */
  readonly frames: readonly string[];
  /** Playback rate in frames/second. */
  readonly fps: number;
  /** Whether the sequence wraps. */
  readonly loop: boolean;
}

/** Raw manifest shape (the `animations` object of an atlas JSON). */
export type AnimationManifest = Readonly<Record<string, AnimationDefinition>>;

export class AnimationTable {
  private readonly defs = new Map<string, AnimationDefinition>();

  constructor(manifest: AnimationManifest) {
    for (const [key, def] of Object.entries(manifest)) {
      if (!Array.isArray(def.frames) || def.frames.length === 0) {
        logger.warn(`AnimationTable: "${key}" has no frames — skipped`);
        continue;
      }
      if (typeof def.fps !== 'number' || def.fps <= 0) {
        logger.warn(`AnimationTable: "${key}" has invalid fps (${def.fps}) — skipped`);
        continue;
      }
      this.defs.set(key, { frames: [...def.frames], fps: def.fps, loop: def.loop });
    }
  }

  /** Whether the key exists. */
  has(key: string): boolean {
    return this.defs.has(key);
  }

  /** Resolve a definition; `undefined` when unknown. */
  get(key: string): AnimationDefinition | undefined {
    return this.defs.get(key);
  }

  /** Number of registered animations. */
  get size(): number {
    return this.defs.size;
  }

  /**
   * Transition an `Animation` component to `key`.
   *
   * This is the only sanctioned transition path: it resets the frame
   * pointer + elapsed timer, and mirrors fps/loop from the table so
   * the component never drifts from its data. Unknown keys are a
   * no-op (warned) — callers should probe {@link has} first.
   *
   * @returns `true` when the transition happened.
   */
  setAnimation(anim: Animation, key: string): boolean {
    const def = this.defs.get(key);
    if (!def) {
      logger.warn(`AnimationTable: unknown animation "${key}" — keeping "${anim.current}"`);
      return false;
    }
    anim.current = key;
    anim.frame = 0;
    anim.fps = def.fps;
    anim.loop = def.loop;
    anim.elapsedMs = 0;
    return true;
  }
}

export default AnimationTable;
