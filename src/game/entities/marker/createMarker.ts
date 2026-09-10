/**
 * Marker entity factory (P2.E2.T4).
 *
 * Assembles a walk-over marker: Position (feet anchor at the tile's
 * bottom edge), an animated Sprite + Animation (the pulsing shrine /
 * flickering brazier / swirling portal frames from the tiles atlas),
 * and the `marker` component carrying the routing data the screen
 * layer acts on when the player taps.
 *
 * Markers are sensors: no Collider — the `MarkerSystem` measures pure
 * proximity, so walking "onto" the marker never blocks movement.
 *
 * @packageDocumentation
 */

import { DEFAULT_ANIMATION_FPS } from '@/game/config/gameplay';
import { LAYERS } from '@/game/config/layers';
import { World } from '@/game/engine/ecs/World';
import type { EntityId } from '@/game/engine/ecs/World';
import type { MarkerSpriteSpec } from '@/game/engine/scene/types';

/** Options for {@link createMarkerEntity}. */
export interface CreateMarkerOptions {
  readonly markerId: string;
  readonly markerKind: 'puzzle' | 'boss' | 'portal';
  /** Feet anchor (px): tile center-x, tile bottom-y. */
  readonly x: number;
  readonly y: number;
  /** Routing target (level id / boss id / `hub` / `overworld`). */
  readonly target: string;
  /** i18n key for the display name. */
  readonly labelKey: string;
  /** Proximity radius (px). */
  readonly radiusPx: number;
  /** Atlas + looping animation wiring (frame 0 is applied first). */
  readonly sprite: MarkerSpriteSpec;
}

/**
 * Create a marker entity. The caller's `AnimationTable` must contain
 * `sprite.animationKey` (the tiles manifest ships the marker
 * animations; the scene contract test pins this).
 */
export function createMarkerEntity(world: World, opts: CreateMarkerOptions): EntityId {
  const marker = world.createEntity();

  world.addComponent(marker, 'position', { x: opts.x, y: opts.y });
  world.addComponent(marker, 'sprite', {
    atlasId: opts.sprite.atlasId,
    spriteId: opts.sprite.frameId,
    layer: LAYERS.props, // markers sit under actors so the hero draws over them
    flipX: false,
    alpha: 1,
  });
  world.addComponent(marker, 'animation', {
    current: opts.sprite.animationKey,
    frame: 0,
    fps: DEFAULT_ANIMATION_FPS,
    loop: true,
    elapsedMs: 0,
  });
  world.addComponent(marker, 'marker', {
    markerId: opts.markerId,
    kind: opts.markerKind,
    target: opts.target,
    labelKey: opts.labelKey,
    radiusPx: opts.radiusPx,
    playerInFocus: false,
  });

  return marker;
}
