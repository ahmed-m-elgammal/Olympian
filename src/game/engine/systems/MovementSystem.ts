/**
 * MovementSystem — intent + locomotion → velocity → position, with
 * collision and facing/animation updates (spec 07 §1.5, P2.E1.T6).
 *
 * Per player-controlled (or otherwise locomoting) entity each tick:
 *
 *  1. `velocity = moveIntent * locomotion.maxSpeed` — the intent
 *     magnitude (analog joystick, 0..1) scales the speed, and an
 *     over-length vector is normalized defensively.
 *  2. Axis-separated integration with collision resolution: try X,
 *     then Y. Blocking one axis still lets the other through, which
 *     produces smooth wall-sliding instead of sticky walls.
 *  3. Solids = the {@link CollisionSpace}'s tiles + other entities'
 *     solid `Collider` boxes (AABB, feet-anchored).
 *  4. Facing follows the dominant velocity axis (kept while idle).
 *  5. Locomotion animation key: `<base>_walk_<dir>` while moving,
 *     `<base>_idle_<dir>` when stopped, applied via the animation
 *     table's sanctioned transition. Non-looping action animations
 *     (attack/hit/death, P2.E4) take priority by convention: this
 *     system only writes keys with the `walk`/`idle` infix.
 *
 * Position anchor: feet (see components.ts). The collider box is
 * centered on x and spans `collider.height` px **above** the anchor.
 *
 * @packageDocumentation
 */

import { MOVEMENT_IDLE_EPSILON } from '@/game/config/gameplay';
import type { FacingDir, MoveIntent, Position } from '../ecs/components';
import type { World, EntityId } from '../ecs/World';
import type { AnimationTable } from '../animation/AnimationTable';
import type { CollisionSpace, Rect } from './collision';
import { rectsOverlap } from './collision';
import type { System } from './index';

/** Collider box for a feet-anchored position. */
export function feetRect(x: number, y: number, width: number, height: number): Rect {
  return { x: x - width / 2, y: y - height, width, height };
}

/** Dominant-axis facing from a velocity vector. */
export function facingFromVector(vx: number, vy: number): FacingDir {
  if (Math.abs(vx) >= Math.abs(vy)) {
    return vx < 0 ? 'left' : 'right';
  }
  return vy < 0 ? 'up' : 'down';
}

/** Locomotion animation key for a base + facing + moving state. */
export function locomotionAnimKey(base: string, dir: FacingDir, moving: boolean): string {
  return `${base}_${moving ? 'walk' : 'idle'}_${dir}`;
}

/** Build the {@link MovementSystem}. */
export function createMovementSystem(
  collision: CollisionSpace,
  animations: AnimationTable,
): System {
  return (world: World, dt: number) => {
    const movers = world.query('moveIntent', 'locomotion', 'position');
    if (movers.length === 0) return;

    // Snapshot other entities' solid boxes once per tick (cheap for
    // P2-scale entity counts; revisited with spatial partitioning if a
    // scene ever ships 100+ solid entities).
    const solids: Array<{ owner: EntityId; rect: Rect }> = [];
    for (const id of world.query('collider', 'position')) {
      const collider = world.getComponent(id, 'collider');
      const pos = world.getComponent(id, 'position');
      if (!collider?.isSolid || !pos) continue;
      solids.push({ owner: id, rect: feetRect(pos.x, pos.y, collider.width, collider.height) });
    }

    for (const id of movers) {
      const intent = world.getComponent(id, 'moveIntent') as MoveIntent;
      const locomotion = world.getComponent(id, 'locomotion');
      const position = world.getComponent(id, 'position') as Position;
      if (!locomotion || !position) continue;

      // 1) Intent → velocity (normalize over-length vectors).
      const mag = Math.hypot(intent.x, intent.y);
      const scale = mag > 1 ? 1 / mag : 1;
      const vx = intent.x * scale * locomotion.maxSpeed;
      const vy = intent.y * scale * locomotion.maxSpeed;
      const velocity = world.getComponent(id, 'velocity');
      if (velocity) {
        velocity.vx = vx;
        velocity.vy = vy;
      }

      // 2) Axis-separated integration: try X, then Y; a blocked axis
      //    keeps its previous coordinate (wall slide).
      const collider = world.getComponent(id, 'collider');
      const w = collider?.width ?? 0;
      const h = collider?.height ?? 0;
      const wouldCollide = (nx: number, ny: number): boolean => {
        // Scene bounds.
        if (
          nx - w / 2 < collision.bounds.minX ||
          nx + w / 2 > collision.bounds.maxX ||
          ny - h < collision.bounds.minY ||
          ny > collision.bounds.maxY
        ) {
          return true;
        }
        if (w <= 0 || h <= 0) return false;
        // Solid tiles.
        if (collision.intersectsSolid(feetRect(nx, ny, w, h))) return true;
        // Other entities' solid boxes (never blocked by self).
        const self = feetRect(nx, ny, w, h);
        for (const { owner, rect } of solids) {
          if (owner === id) continue;
          if (rectsOverlap(self, rect)) return true;
        }
        return false;
      };

      const stepX = position.x + vx * dt;
      if (!wouldCollide(stepX, position.y)) {
        position.x = stepX;
      }
      const stepY = position.y + vy * dt;
      if (!wouldCollide(position.x, stepY)) {
        position.y = stepY;
      }

      // 4) Facing follows dominant velocity axis (kept while idle).
      const moving = Math.abs(vx) > MOVEMENT_IDLE_EPSILON || Math.abs(vy) > MOVEMENT_IDLE_EPSILON;
      const facing = world.getComponent(id, 'facing');
      if (moving && facing) {
        facing.dir = facingFromVector(vx, vy);
      }

      // 5) Locomotion animation key.
      const anim = world.getComponent(id, 'animation');
      if (anim && facing) {
        const key = locomotionAnimKey(locomotion.animationBase, facing.dir, moving);
        if (anim.current !== key && isLocomotionAnim(anim)) {
          animations.setAnimation(anim, key);
        }
      }
    }
  };
}

/**
 * Whether the entity's current animation belongs to the locomotion set
 * (`*_idle_*` / `*_walk_*`). Action animations (attack/hit/death) are
 * never overridden by movement — they own the sprite until they
 * complete or gameplay code transitions away.
 */
export function isLocomotionAnim(anim: { current: string }): boolean {
  return /_(idle|walk)_/.test(anim.current);
}

export default createMovementSystem;
