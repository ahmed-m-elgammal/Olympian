/**
 * AnimationSystem — advance sprite animation frames
 * (spec 07 §1.5, §6.1, P2.E1.T10).
 *
 * For every entity carrying `animation` + `sprite`:
 *
 *  1. Integrate `elapsedMs += dt * 1000`.
 *  2. `frame = floor(elapsed / frameDuration)` — looping animations
 *     wrap modulo the frame count (and the elapsed timer wraps with
 *     them, so timers stay bounded); non-looping animations clamp to
 *     the last frame, set the sprite to its final pose, and fire the
 *     completion behavior exactly once (`destroy` the entity, or emit
 *     the injected `onAnimComplete` listener).
 *  3. Resolve the current frame name from the animation table and
 *     write it into `sprite.spriteId` — the render producer reads only
 *     `Sprite`, so rendering never knows about animation timing.
 *
 * A malformed `current` key (not in the table) is left untouched and
 * warned once — the sprite keeps its last valid frame.
 *
 * @packageDocumentation
 */

import { logger } from '@/shared/log';
import type { Animation, Sprite } from '../ecs/components';
import type { World, EntityId } from '../ecs/World';
import type { AnimationTable } from '../animation/AnimationTable';
import type { System } from './index';

export type AnimCompleteListener = (entityId: EntityId, key: string) => void;

/** Build the {@link AnimationSystem}. */
export function createAnimationSystem(
  table: AnimationTable,
  onAnimComplete?: AnimCompleteListener,
): System {
  // Entities whose non-loop animation already fired — cleared on key change.
  const completed = new WeakSet<object>();

  return (world: World, dt: number) => {
    for (const id of world.query('animation', 'sprite')) {
      const anim = world.getComponent(id, 'animation') as Animation;
      const sprite = world.getComponent(id, 'sprite') as Sprite;
      const def = table.get(anim.current);
      if (!def) {
        logger.warn(`AnimationSystem: unknown animation "${anim.current}" — skipping`);
        continue;
      }

      if (anim.elapsedMs === 0 && anim.frame === 0) {
        completed.delete(anim); // fresh transition via setAnimation
      }

      const frameCount = def.frames.length;
      const frameDurationMs = 1000 / anim.fps;
      anim.elapsedMs += dt * 1000;

      let frame = Math.floor(anim.elapsedMs / frameDurationMs);
      let finished = false;

      if (frame >= frameCount) {
        if (def.loop) {
          // Wrap both frame pointer and timer (bounded, drift-free).
          anim.elapsedMs %= frameCount * frameDurationMs;
          frame = Math.floor(anim.elapsedMs / frameDurationMs);
        } else {
          frame = frameCount - 1;
          finished = true;
        }
      }

      anim.frame = frame;
      sprite.spriteId = def.frames[frame] ?? def.frames[frameCount - 1];

      if (finished && !completed.has(anim)) {
        completed.add(anim);
        if (anim.onComplete === 'destroy') {
          world.destroyEntity(id);
        } else if (anim.onComplete === 'callback') {
          onAnimComplete?.(id, anim.current);
        }
      }
    }
  };
}

export default createAnimationSystem;
