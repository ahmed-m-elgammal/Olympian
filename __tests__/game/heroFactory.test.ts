/**
 * Tests for the hero entity factory (P2.E1.T4) — component assembly +
 * the HERO id contract against the real baked atlas manifest.
 */

import atlasHero from '../../assets/sprites/atlas_hero.json';

import { createHero } from '@/game/entities/hero/createHero';
import { HERO } from '@/game/entities/hero/heroDef';
import { World } from '@/game/engine/ecs/World';
import {
  DEFAULT_ANIMATION_FPS,
  HERO_COLLIDER_HEIGHT,
  HERO_COLLIDER_WIDTH,
  HERO_SPEED_PX_SEC,
} from '@/game/config/gameplay';
import { LAYERS } from '@/game/config/layers';
import { ATLAS_IDS } from '@/game/render/atlas/atlasRegistry';

const heroManifest = atlasHero as {
  atlas: string;
  frames: Array<{ name: string }>;
  animations: Record<string, { frames: string[]; fps: number; loop: boolean }>;
};

function frameNames(): Set<string> {
  return new Set(heroManifest.frames.map((f) => f.name));
}

describe('createHero', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  it('assembles the full P2.E1 component set', () => {
    const hero = createHero(world, { x: 24, y: 48 });
    for (const component of [
      'position',
      'velocity',
      'moveIntent',
      'facing',
      'locomotion',
      'collider',
      'sprite',
      'animation',
      'playerControlled',
      'cameraFollow',
    ]) {
      expect(world.hasComponent(hero, component as never)).toBe(true);
    }
  });

  it('anchors position at the spawn point and zeroes velocity/intent', () => {
    const hero = createHero(world, { x: 24, y: 48 });
    expect(world.getComponent(hero, 'position')).toEqual({ x: 24, y: 48 });
    expect(world.getComponent(hero, 'velocity')).toEqual({ vx: 0, vy: 0 });
    expect(world.getComponent(hero, 'moveIntent')).toEqual({ x: 0, y: 0 });
  });

  it('defaults facing/animation to the configured spawn facing', () => {
    const hero = createHero(world, { x: 0, y: 0 });
    expect(world.getComponent(hero, 'facing')!.dir).toBe('down');
    const anim = world.getComponent(hero, 'animation')!;
    expect(anim.current).toBe(HERO.idleAnim('down'));
    expect(anim.fps).toBe(DEFAULT_ANIMATION_FPS);
    expect(anim.loop).toBe(true);
    expect(world.getComponent(hero, 'sprite')!.spriteId).toBe(
      HERO.idleFrame('down', 0),
    );
  });

  it('honors an explicit spawn facing', () => {
    const hero = createHero(world, { x: 0, y: 0, facing: 'left' });
    expect(world.getComponent(hero, 'facing')!.dir).toBe('left');
    expect(world.getComponent(hero, 'animation')!.current).toBe(
      HERO.idleAnim('left'),
    );
  });

  it('wires locomotion/collider/sprite from the gameplay config', () => {
    const hero = createHero(world, { x: 0, y: 0 });
    expect(world.getComponent(hero, 'locomotion')).toEqual({
      maxSpeed: HERO_SPEED_PX_SEC,
      animationBase: HERO.ANIMATION_BASE,
    });
    const collider = world.getComponent(hero, 'collider')!;
    expect(collider.width).toBe(HERO_COLLIDER_WIDTH);
    expect(collider.height).toBe(HERO_COLLIDER_HEIGHT);
    expect(collider.isSolid).toBe(false);
    expect(collider.tag).toBe('player');
    const sprite = world.getComponent(hero, 'sprite')!;
    expect(sprite.atlasId).toBe(HERO.ATLAS_ID);
    expect(sprite.layer).toBe(LAYERS.actors);
    expect(sprite.alpha).toBe(1);
  });

  it('marks the entity as the local player and camera target', () => {
    const hero = createHero(world, { x: 0, y: 0 });
    expect(world.getComponent(hero, 'playerControlled')).toEqual({
      playerId: HERO.PLAYER_ID,
    });
    expect(world.getComponent(hero, 'cameraFollow')).toEqual({
      offsetX: 0,
      offsetY: 0,
    });
  });
});

describe('HERO id contract vs the baked manifest', () => {
  it('uses the hero atlas id', () => {
    expect(HERO.ATLAS_ID).toBe(ATLAS_IDS.hero);
    expect(heroManifest.atlas).toBe(ATLAS_IDS.hero);
  });

  it('resolves every idle/walk key for all four directions', () => {
    const names = frameNames();
    for (const dir of ['down', 'up', 'left', 'right'] as const) {
      expect(heroManifest.animations[HERO.idleAnim(dir)]).toBeDefined();
      expect(heroManifest.animations[HERO.walkAnim(dir)]).toBeDefined();
      // And the sprite the factory spawns on exists in the atlas.
      expect(names.has(HERO.idleFrame(dir, 0))).toBe(true);
    }
  });

  it('frame sizes match the tall-sprite convention', () => {
    expect(HERO.FRAME_WIDTH).toBe(16);
    expect(HERO.FRAME_HEIGHT).toBe(24);
  });
});
