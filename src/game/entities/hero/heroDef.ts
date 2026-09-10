/**
 * Hero asset/identity constants — the single source of truth for every
 * hero atlas/sprite/animation id used at runtime (spec 07 §7: code
 * references assets by id, never by embedded data).
 *
 * These ids MUST match the names emitted by `scripts/sprites/heroArt.ts`
 * into `assets/sprites/atlas_hero.json`. A jest test
 * (`__tests__/assets/atlasManifest.test.ts`) pins the manifest to this
 * contract so a rename on either side fails loudly at CI.
 *
 * @packageDocumentation
 */

import type { FacingDir } from '@/game/engine/ecs/components';

/** Hero identity + atlas contract. */
export const HERO = {
  /** Stable player id for `PlayerControlled`. */
  PLAYER_ID: 'hero',

  /** Atlas containing the hero sheet (spec 12 §1: `atlas_hero`). */
  ATLAS_ID: 'atlas_hero',

  /** Animation family prefix — manifest keys are `<base>_<pose>_<dir>`. */
  ANIMATION_BASE: 'hero',

  /** Sprite frame size (spec 01 §7.1 tall-sprite convention). */
  FRAME_WIDTH: 16,
  FRAME_HEIGHT: 24,

  /** Build an idle animation key for a facing. */
  idleAnim(dir: FacingDir): string {
    return `hero_idle_${dir}`;
  },

  /** Build a walk animation key for a facing. */
  walkAnim(dir: FacingDir): string {
    return `hero_walk_${dir}`;
  },

  /** Build an idle frame name for a facing + index. */
  idleFrame(dir: FacingDir, frame: number): string {
    return `hero_idle_${dir}_${frame}`;
  },
} as const;
