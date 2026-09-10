/**
 * Sprite draw-command production (spec 07 §3.2, §8).
 *
 * Pure function over the ECS: walks every `sprite` + `position` entity,
 * resolves the frame's pixel size through an injected lookup (the atlas
 * registry in the render layer supplies the real one; tests stub it),
 * and emits feet-anchored `sprite` DrawCommands.
 *
 * Culling (spec 07 §8): sprites whose dest rect falls entirely outside
 * the camera viewport (+ margin) are skipped before any allocation.
 *
 * The engine never touches Skia or `require()` — this module is the
 * seam between simulation and rendering.
 *
 * @packageDocumentation
 */

import { DrawCommandFactories, type DrawCommand } from './DrawCommand';
import type { Camera } from '@/game/render/canvas/Camera';
import type { World } from '../ecs/World';

/** Resolves a sprite id to its pixel dimensions inside its atlas. */
export type FrameSizeLookup = (
  atlasId: string,
  spriteId: string,
) => { width: number; height: number };

export interface ProduceOptions {
  /** Current camera (viewport culling + nothing else — commands stay in world space). */
  readonly camera?: Camera;
  /** Extra px of margin around the viewport for partially visible sprites. */
  readonly cullMarginPx?: number;
}

/** Fallback frame size when the lookup misses (prevents NaN draws). */
const FALLBACK_FRAME = { width: 16, height: 16 };

/**
 * Produce the sorted sprite commands for the current world state.
 * Returns commands in entity-id order; the RenderSystem sorts by layer.
 */
export function produceSpriteCommands(
  world: World,
  frameSizeOf: FrameSizeLookup,
  opts: ProduceOptions = {},
): DrawCommand[] {
  const commands: DrawCommand[] = [];
  const margin = opts.cullMarginPx ?? 0;

  let view: { x: number; y: number; width: number; height: number } | null = null;
  if (opts.camera) {
    view = opts.camera.getVisibleBounds();
    view.x -= margin;
    view.y -= margin;
    view.width += margin * 2;
    view.height += margin * 2;
  }

  for (const id of world.query('sprite', 'position')) {
    const sprite = world.getComponent(id, 'sprite');
    const position = world.getComponent(id, 'position');
    if (!sprite || !position) continue;

    const size = frameSizeOf(sprite.atlasId, sprite.spriteId) ?? FALLBACK_FRAME;

    // Feet anchor → top-left dest rect (draws the sprite above the feet).
    const destX = position.x - size.width / 2;
    const destY = position.y - size.height;

    if (
      view &&
      (destX + size.width < view.x ||
        destX > view.x + view.width ||
        destY + size.height < view.y ||
        destY > view.y + view.height)
    ) {
      continue; // fully off-screen (spec 07 §8 culling)
    }

    commands.push(
      DrawCommandFactories.sprite(
        sprite.atlasId,
        sprite.spriteId,
        destX,
        destY,
        size.width,
        size.height,
        sprite.layer,
        { flipX: sprite.flipX, alpha: sprite.alpha },
      ),
    );
  }
  return commands;
}
