/**
 * Tests for the ECS `World` — entity lifecycle + typed component
 * storage (spec 07 §1.1, §1.4).
 */

import { World } from '@/game/engine/ecs/World';
import type { Position, Sprite } from '@/game/engine/ecs/components';

describe('World — entities', () => {
  it('creates unique monotonic entity ids', () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    expect(a).not.toBe(b);
    expect(world.isAlive(a)).toBe(true);
    expect(world.entityCount).toBe(2);
  });

  it('destroyEntity drops components and marks the id dead', () => {
    const world = new World();
    const e = world.createEntity();
    world.addComponent(e, 'position', { x: 1, y: 2 });
    world.destroyEntity(e);
    expect(world.isAlive(e)).toBe(false);
    expect(world.entityCount).toBe(0);
    expect(world.getComponent(e, 'position')).toBeUndefined();
  });

  it('destroyEntity is idempotent (double destroy safe)', () => {
    const world = new World();
    const e = world.createEntity();
    world.destroyEntity(e);
    expect(() => world.destroyEntity(e)).not.toThrow();
  });

  it('addComponent on a dead entity is ignored without throwing', () => {
    const world = new World();
    const e = world.createEntity();
    world.destroyEntity(e);
    expect(() =>
      world.addComponent(e, 'position', { x: 0, y: 0 }),
    ).not.toThrow();
    expect(world.getComponent(e, 'position')).toBeUndefined();
  });
});

describe('World — components', () => {
  it('stores and retrieves typed payloads', () => {
    const world = new World();
    const e = world.createEntity();
    const pos: Position = { x: 10, y: 20 };
    world.addComponent(e, 'position', pos);
    expect(world.getComponent(e, 'position')).toEqual(pos);
    expect(world.hasComponent(e, 'position')).toBe(true);
  });

  it('re-adding the same type replaces the payload (last wins)', () => {
    const world = new World();
    const e = world.createEntity();
    world.addComponent(e, 'position', { x: 1, y: 1 });
    world.addComponent(e, 'position', { x: 2, y: 2 });
    expect(world.getComponent(e, 'position')).toEqual({ x: 2, y: 2 });
  });

  it('removeComponent is a no-op when absent', () => {
    const world = new World();
    const e = world.createEntity();
    expect(() => world.removeComponent(e, 'sprite')).not.toThrow();
    world.addComponent(e, 'sprite', {
      atlasId: 'a',
      spriteId: 's',
      layer: 0,
      flipX: false,
      alpha: 1,
    } satisfies Sprite);
    world.removeComponent(e, 'sprite');
    expect(world.hasComponent(e, 'sprite')).toBe(false);
  });
});

describe('World — queries', () => {
  it('query returns only entities carrying every listed type, ascending', () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    const c = world.createEntity();
    for (const id of [a, b, c]) {
      world.addComponent(id, 'position', { x: id, y: 0 });
    }
    world.addComponent(a, 'velocity', { vx: 0, vy: 0 });
    world.addComponent(c, 'velocity', { vx: 0, vy: 0 });
    expect(world.query('position', 'velocity')).toEqual([a, c]);
  });

  it('query with an unknown/empty type returns empty (never throws)', () => {
    const world = new World();
    const e = world.createEntity();
    world.addComponent(e, 'position', { x: 0, y: 0 });
    expect(world.query('position', 'facing')).toEqual([]);
    expect(world.query()).toEqual([e]);
  });

  it('query with no arguments lists all entities sorted', () => {
    const world = new World();
    const ids = [world.createEntity(), world.createEntity(), world.createEntity()];
    expect(world.query()).toEqual(ids.sort((a, b) => a - b));
  });

  it('getStore exposes the per-type map (read-only by convention)', () => {
    const world = new World();
    const e = world.createEntity();
    world.addComponent(e, 'position', { x: 5, y: 6 });
    const store = world.getStore('position');
    expect(store.get(e)).toEqual({ x: 5, y: 6 });
  });
});
