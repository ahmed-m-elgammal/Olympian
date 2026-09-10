/**
 * Hero entity factory (spec 07 §1.3, P2.E1.T4).
 *
 * Assembles the hero's component set: Position (feet anchor), Velocity,
 * MoveIntent, Facing, Locomotion, Collider, Sprite, Animation,
 * PlayerControlled, CameraFollow. All ids/dimensions come from
 * {@link HERO} / `@/game/config` — nothing hardcoded at call sites.
 *
 * The factory is the only gameplay entry point for spawning the hero;
 * scenes call it with the scene's spawn point.
 *
 * @packageDocumentation
 */

import {
  DEFAULT_ANIMATION_FPS,
  HERO_COLLIDER_HEIGHT,
  HERO_COLLIDER_WIDTH,
  HERO_SPEED_PX_SEC,
  HERO_SPAWN_FACING,
} from '@/game/config/gameplay';
import { LAYERS } from '@/game/config/layers';
import type { FacingDir } from '@/game/engine/ecs/components';
import { World } from '@/game/engine/ecs/World';
import type { EntityId } from '@/game/engine/ecs/World';
import { HERO } from './heroDef';

export interface CreateHeroOptions {
  /** World-space spawn point (feet anchor, px). */
  readonly x: number;
  readonly y: number;
  /** Initial facing. Defaults to the configured spawn facing. */
  readonly facing?: FacingDir;
}

/**
 * Create the hero entity. Returns the entity id; callers attach any
 * scene-specific extras (persist tags, markers) themselves.
 */
export function createHero(world: World, opts: CreateHeroOptions): EntityId {
  const hero = world.createEntity();
  const dir = opts.facing ?? HERO_SPAWN_FACING;

  world.addComponent(hero, 'position', { x: opts.x, y: opts.y });
  world.addComponent(hero, 'velocity', { vx: 0, vy: 0 });
  world.addComponent(hero, 'moveIntent', { x: 0, y: 0 });
  world.addComponent(hero, 'facing', { dir });
  world.addComponent(hero, 'locomotion', {
    maxSpeed: HERO_SPEED_PX_SEC,
    animationBase: HERO.ANIMATION_BASE,
  });
  world.addComponent(hero, 'collider', {
    shape: 'box',
    width: HERO_COLLIDER_WIDTH,
    height: HERO_COLLIDER_HEIGHT,
    isSolid: false,
    tag: 'player',
  });
  world.addComponent(hero, 'sprite', {
    atlasId: HERO.ATLAS_ID,
    spriteId: HERO.idleFrame(dir, 0),
    layer: LAYERS.actors,
    flipX: false,
    alpha: 1,
  });
  world.addComponent(hero, 'animation', {
    current: HERO.idleAnim(dir),
    frame: 0,
    fps: DEFAULT_ANIMATION_FPS,
    loop: true,
    elapsedMs: 0,
  });
  world.addComponent(hero, 'playerControlled', { playerId: HERO.PLAYER_ID });
  world.addComponent(hero, 'cameraFollow', { offsetX: 0, offsetY: 0 });

  return hero;
}
