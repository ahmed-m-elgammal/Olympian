/**
 * Tests for the P2.E1 engine systems: Input, Movement (incl. collision
 * + facing + locomotion keys), Animation (loop wrap + completion), and
 * Camera (follow lerp + world clamping) — spec 07 §1.5.
 */

import { World } from '@/game/engine/ecs/World';
import type { MoveIntent } from '@/game/engine/ecs/components';
import { AnimationTable } from '@/game/engine/animation/AnimationTable';
import {
  createInputSystem,
  createMovementSystem,
  createAnimationSystem,
  createCameraSystem,
  feetRect,
  facingFromVector,
  followLerp,
  isLocomotionAnim,
  locomotionAnimKey,
  type InputSource,
} from '@/game/engine';
import type { CollisionSpace, Rect, WorldBounds } from '@/game/engine/systems/collision';
import { rectsOverlap } from '@/game/engine/systems/collision';
import { Camera } from '@/game/render/canvas/Camera';
import {
  CAMERA_FOLLOW_RATE,
  HERO_COLLIDER_HEIGHT,
  HERO_COLLIDER_WIDTH,
  HERO_SPEED_PX_SEC,
  MOVEMENT_IDLE_EPSILON,
} from '@/game/config/gameplay';

const DT = 1 / 60;

/** A flat world: bounds + a list of solid rects. */
function makeSpace(solids: Rect[], bounds?: Partial<WorldBounds>): CollisionSpace {
  const full: WorldBounds = {
    minX: bounds?.minX ?? 0,
    minY: bounds?.minY ?? 0,
    maxX: bounds?.maxX ?? 10_000,
    maxY: bounds?.maxY ?? 10_000,
  };
  return {
    bounds: full,
    intersectsSolid: (r: Rect) => solids.some((s) => rectsOverlap(r, s)),
  };
}

/** Manifest stub covering the locomotion + action keys the tests use. */
function makeTable(): AnimationTable {
  return new AnimationTable({
    hero_idle_down: { frames: ['a0', 'a1', 'a2', 'a3'], fps: 8, loop: true },
    hero_idle_up: { frames: ['b0', 'b1', 'b2', 'b3'], fps: 8, loop: true },
    hero_walk_down: { frames: ['w0', 'w1', 'w2', 'w3', 'w4', 'w5'], fps: 8, loop: true },
    hero_walk_up: { frames: ['x0', 'x1', 'x2', 'x3', 'x4', 'x5'], fps: 8, loop: true },
    hero_attack_down: { frames: ['at0', 'at1', 'at2'], fps: 12, loop: false },
  });
}

function spawnHero(world: World, x = 100, y = 100): number {
  const hero = world.createEntity();
  world.addComponent(hero, 'position', { x, y });
  world.addComponent(hero, 'velocity', { vx: 0, vy: 0 });
  world.addComponent(hero, 'moveIntent', { x: 0, y: 0 });
  world.addComponent(hero, 'facing', { dir: 'down' });
  world.addComponent(hero, 'locomotion', {
    maxSpeed: HERO_SPEED_PX_SEC,
    animationBase: 'hero',
  });
  world.addComponent(hero, 'collider', {
    shape: 'box',
    width: HERO_COLLIDER_WIDTH,
    height: HERO_COLLIDER_HEIGHT,
    isSolid: false,
    tag: 'player',
  });
  world.addComponent(hero, 'animation', {
    current: 'hero_idle_down',
    frame: 0,
    fps: 8,
    loop: true,
    elapsedMs: 0,
  });
  world.addComponent(hero, 'sprite', {
    atlasId: 'atlas_hero',
    spriteId: 'a0',
    layer: 40,
    flipX: false,
    alpha: 1,
  });
  world.addComponent(hero, 'playerControlled', { playerId: 'hero' });
  return hero;
}

describe('InputSystem', () => {
  it('copies the source vector into every player-controlled intent', () => {
    const world = new World();
    const hero = spawnHero(world);
    const source: InputSource = { getMove: () => ({ x: 0.5, y: -1 }) };
    createInputSystem(source)(world, DT);

    const intent = world.getComponent(hero, 'moveIntent') as MoveIntent;
    expect(intent.x).toBeCloseTo(0.5);
    expect(intent.y).toBeCloseTo(-1);
  });

  it('clamps out-of-range axes defensively', () => {
    const world = new World();
    const hero = spawnHero(world);
    const source: InputSource = { getMove: () => ({ x: 7, y: -99 }) };
    createInputSystem(source)(world, DT);
    const intent = world.getComponent(hero, 'moveIntent') as MoveIntent;
    expect(intent.x).toBe(1);
    expect(intent.y).toBe(-1);
  });

  it('never touches intents on entities without playerControlled', () => {
    const world = new World();
    spawnHero(world);
    const npc = world.createEntity();
    world.addComponent(npc, 'moveIntent', { x: 0.25, y: 0.25 });
    const source: InputSource = { getMove: () => ({ x: 1, y: 1 }) };
    createInputSystem(source)(world, DT);
    expect(world.getComponent(npc, 'moveIntent')).toEqual({ x: 0.25, y: 0.25 });
  });
});

describe('MovementSystem', () => {
  it('integrates intent × maxSpeed into position and velocity', () => {
    const world = new World();
    const hero = spawnHero(world);
    (world.getComponent(hero, 'moveIntent') as MoveIntent).x = 1;
    const movement = createMovementSystem(makeSpace([]), makeTable());
    movement(world, DT);

    const pos = world.getComponent(hero, 'position')!;
    const vel = world.getComponent(hero, 'velocity')!;
    expect(vel.vx).toBeCloseTo(HERO_SPEED_PX_SEC);
    expect(pos.x).toBeCloseTo(100 + (HERO_SPEED_PX_SEC * DT));
    expect(pos.y).toBeCloseTo(100);
  });

  it('scales speed by the analog magnitude', () => {
    const world = new World();
    const hero = spawnHero(world);
    (world.getComponent(hero, 'moveIntent') as MoveIntent).x = 0.5;
    createMovementSystem(makeSpace([]), makeTable())(world, DT);
    expect(world.getComponent(hero, 'velocity')!.vx).toBeCloseTo(HERO_SPEED_PX_SEC * 0.5);
  });

  it('normalizes over-length diagonal intents to magnitude 1', () => {
    const world = new World();
    const hero = spawnHero(world);
    (world.getComponent(hero, 'moveIntent') as MoveIntent).x = 1;
    (world.getComponent(hero, 'moveIntent') as MoveIntent).y = 1;
    createMovementSystem(makeSpace([]), makeTable())(world, DT);
    const vel = world.getComponent(hero, 'velocity')!;
    const mag = Math.hypot(vel.vx, vel.vy);
    expect(mag).toBeCloseTo(HERO_SPEED_PX_SEC, 5);
  });

  it('updates facing to the dominant velocity axis while moving', () => {
    const world = new World();
    const hero = spawnHero(world);
    const intent = world.getComponent(hero, 'moveIntent') as MoveIntent;
    intent.y = -0.4; // up dominates
    intent.x = 0.2;
    createMovementSystem(makeSpace([]), makeTable())(world, DT);
    expect(world.getComponent(hero, 'facing')!.dir).toBe('up');
  });

  it('keeps the previous facing when idle', () => {
    const world = new World();
    const hero = spawnHero(world);
    createMovementSystem(makeSpace([]), makeTable())(world, DT);
    expect(world.getComponent(hero, 'facing')!.dir).toBe('down');
  });

  it('blocks a solid tile on X but still slides along Y (wall slide)', () => {
    const world = new World();
    // Wall covering x ∈ [106, 200), y ∈ [0, 300) — clear of the hero's
    // 10px-wide feet box at x=100 (95..105) so nothing starts embedded.
    const space = makeSpace([{ x: 106, y: 0, width: 94, height: 300 }]);
    const hero = spawnHero(world, 100, 100);
    const intent = world.getComponent(hero, 'moveIntent') as MoveIntent;
    intent.x = 1; // into the wall
    intent.y = 1; // along it

    const movement = createMovementSystem(space, makeTable());
    // Run to convergence: the first ticks close the 1px gap to the
    // wall, then X stays pinned while Y keeps sliding.
    for (let i = 0; i < 120; i++) movement(world, DT);
    const pos = world.getComponent(hero, 'position')!;
    // X stopped just short of the wall (feet half-width 5 → x ≈ 101);
    // Y advanced (wall slide).
    expect(pos.x).toBeCloseTo(101, 0);
    expect(pos.x + HERO_COLLIDER_WIDTH / 2).toBeLessThanOrEqual(106);
    expect(pos.y).toBeGreaterThan(100);
  });

  it('is blocked by other entities\' solid colliders but never by itself', () => {
    const world = new World();
    const hero = spawnHero(world, 100, 100);
    const blocker = world.createEntity();
    world.addComponent(blocker, 'position', { x: 110, y: 100 });
    world.addComponent(blocker, 'collider', {
      shape: 'box',
      width: 10,
      height: 8,
      isSolid: true,
      tag: 'enemy',
    });
    (world.getComponent(hero, 'moveIntent') as MoveIntent).x = 1;

    createMovementSystem(makeSpace([]), makeTable())(world, DT);
    expect(world.getComponent(hero, 'position')!.x).toBeCloseTo(100);
  });

  it('switches walk/idle animation keys via the animation table', () => {
    const world = new World();
    const animations = makeTable();
    const hero = spawnHero(world);
    const intent = world.getComponent(hero, 'moveIntent') as MoveIntent;
    intent.y = -1;

    const movement = createMovementSystem(makeSpace([]), animations);
    movement(world, DT);
    expect(world.getComponent(hero, 'animation')!.current).toBe('hero_walk_up');

    intent.y = 0;
    movement(world, DT);
    expect(world.getComponent(hero, 'animation')!.current).toBe('hero_idle_up');
  });

  it('never overrides a non-locomotion (action) animation', () => {
    const world = new World();
    const animations = makeTable();
    const hero = spawnHero(world);
    const anim = world.getComponent(hero, 'animation')!;
    animations.setAnimation(anim, 'hero_attack_down');
    (world.getComponent(hero, 'moveIntent') as MoveIntent).x = 1;

    createMovementSystem(makeSpace([]), animations)(world, DT);
    expect(anim.current).toBe('hero_attack_down');
  });
});

describe('AnimationSystem', () => {
  it('advances frames at the manifest fps and mirrors them to the sprite', () => {
    const world = new World();
    const animations = makeTable();
    const hero = spawnHero(world);
    const system = createAnimationSystem(animations);

    // 8fps → 125ms/frame. One 60Hz tick ≈ 16.7ms → still frame 0.
    system(world, DT);
    expect(world.getComponent(hero, 'animation')!.frame).toBe(0);
    expect(world.getComponent(hero, 'sprite')!.spriteId).toBe('a0');

    // Past the first frame boundary.
    system(world, 0.13);
    expect(world.getComponent(hero, 'animation')!.frame).toBe(1);
    expect(world.getComponent(hero, 'sprite')!.spriteId).toBe('a1');
  });

  it('wraps looping animations and keeps the timer bounded', () => {
    const world = new World();
    const animations = makeTable();
    const hero = spawnHero(world);
    const system = createAnimationSystem(animations);
    const anim = world.getComponent(hero, 'animation')!;

    // 4 frames @ 8fps = 500ms per cycle. Step 540ms → wraps to frame 0/1.
    system(world, 0.54);
    expect(anim.frame).toBe(0);
    expect(anim.elapsedMs).toBeLessThan(500);
  });

  it('clamps non-looping animations to the last frame', () => {
    const world = new World();
    const animations = makeTable();
    const hero = spawnHero(world);
    const anim = world.getComponent(hero, 'animation')!;
    animations.setAnimation(anim, 'hero_attack_down');
    const sprite = world.getComponent(hero, 'sprite')!;

    createAnimationSystem(animations)(world, 10); // 10s ≫ 3 frames @12fps
    expect(anim.frame).toBe(2);
    expect(sprite.spriteId).toBe('at2');
  });

  it('fires the completion callback exactly once for non-loop animations', () => {
    const world = new World();
    const animations = makeTable();
    const hero = spawnHero(world);
    const anim = world.getComponent(hero, 'animation')!;
    animations.setAnimation(anim, 'hero_attack_down');
    anim.onComplete = 'callback';

    const listener = jest.fn();
    const system = createAnimationSystem(animations, listener);
    system(world, 10);
    system(world, 0.5);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(hero, 'hero_attack_down');
  });

  it('destroys the entity on onComplete=destroy after the final frame', () => {
    const world = new World();
    const animations = makeTable();
    const hero = spawnHero(world);
    const anim = world.getComponent(hero, 'animation')!;
    animations.setAnimation(anim, 'hero_attack_down');
    anim.onComplete = 'destroy';

    createAnimationSystem(animations)(world, 10);
    expect(world.isAlive(hero)).toBe(false);
  });

  it('leaves unknown animation keys untouched and keeps the last frame', () => {
    const world = new World();
    const animations = makeTable();
    const hero = spawnHero(world);
    const anim = world.getComponent(hero, 'animation')!;
    const sprite = world.getComponent(hero, 'sprite')!;
    anim.current = 'no_such_animation';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    createAnimationSystem(animations)(world, DT);
    expect(anim.frame).toBe(0);
    expect(sprite.spriteId).toBe('a0');
    warnSpy.mockRestore();
  });
});

describe('CameraSystem', () => {
  it('follows the first cameraFollow entity with a frame-rate-independent lerp', () => {
    const world = new World();
    const camera = new Camera();
    camera.setViewport(320, 180);
    const hero = world.createEntity();
    world.addComponent(hero, 'position', { x: 200, y: 120 });
    world.addComponent(hero, 'cameraFollow', { offsetX: 0, offsetY: 0 });

    const system = createCameraSystem(camera);
    // Simulate 2 seconds — convergence.
    for (let i = 0; i < 120; i++) system(world, DT);

    expect(camera.position.x).toBeCloseTo(200 - 320 / 2, 1);
    expect(camera.position.y).toBeCloseTo(120 - 180 / 2, 1);
  });

  it('applies the cameraFollow offset', () => {
    const world = new World();
    const camera = new Camera();
    camera.setViewport(100, 100);
    const e = world.createEntity();
    world.addComponent(e, 'position', { x: 0, y: 0 });
    world.addComponent(e, 'cameraFollow', { offsetX: 10, offsetY: -10 });

    const system = createCameraSystem(camera);
    for (let i = 0; i < 600; i++) system(world, DT);
    expect(camera.position.x).toBeCloseTo(10 - 50, 1);
    expect(camera.position.y).toBeCloseTo(-10 - 50, 1);
  });

  it('clamps the viewport inside the world bounds', () => {
    const world = new World();
    const camera = new Camera();
    camera.setViewport(320, 180);
    const e = world.createEntity();
    world.addComponent(e, 'position', { x: 5, y: 5 });
    world.addComponent(e, 'cameraFollow', { offsetX: 0, offsetY: 0 });

    const bounds = { width: 480, height: 448 };
    const system = createCameraSystem(camera, bounds);
    for (let i = 0; i < 120; i++) system(world, DT);

    expect(camera.position.x).toBe(0); // target −40 → clamped to 0
    expect(camera.position.y).toBe(0);
    expect(camera.position.x + 320 / camera.zoom).toBeLessThanOrEqual(480);
  });

  it('centers maps narrower than the viewport', () => {
    const world = new World();
    const camera = new Camera();
    camera.setViewport(640, 360); // zoom 1 → 640 world px wide
    camera.setZoom(1);
    const e = world.createEntity();
    world.addComponent(e, 'position', { x: 50, y: 50 });
    world.addComponent(e, 'cameraFollow', { offsetX: 0, offsetY: 0 });

    const bounds = { width: 480, height: 448 };
    const system = createCameraSystem(camera, bounds);
    system(world, DT);
    expect(camera.position.x).toBe((480 - 640) / 2); // −80
  });

  it('does nothing without a cameraFollow entity', () => {
    const world = new World();
    const camera = new Camera();
    camera.setPosition(7, 9);
    createCameraSystem(camera)(world, DT);
    expect(camera.position.x).toBe(7);
    expect(camera.position.y).toBe(9);
  });
});

describe('movement helpers', () => {
  it('feetRect anchors the box centered on x and above y', () => {
    const r = feetRect(100, 50, 10, 8);
    expect(r).toEqual({ x: 95, y: 42, width: 10, height: 8 });
  });

  it('facingFromVector picks the dominant axis', () => {
    expect(facingFromVector(-1, 0)).toBe('left');
    expect(facingFromVector(2, 1)).toBe('right');
    expect(facingFromVector(0, -5)).toBe('up');
    expect(facingFromVector(1, 3)).toBe('down');
    // Ties prefer the horizontal axis.
    expect(facingFromVector(-1, -1)).toBe('left');
  });

  it('locomotionAnimKey composes base_state_dir', () => {
    expect(locomotionAnimKey('hero', 'down', true)).toBe('hero_walk_down');
    expect(locomotionAnimKey('hero', 'left', false)).toBe('hero_idle_left');
  });

  it('isLocomotionAnim accepts idle/walk and rejects actions', () => {
    expect(isLocomotionAnim({ current: 'hero_walk_left' })).toBe(true);
    expect(isLocomotionAnim({ current: 'hero_idle_up' })).toBe(true);
    expect(isLocomotionAnim({ current: 'hero_attack_down' })).toBe(false);
    expect(isLocomotionAnim({ current: 'hero_death_down' })).toBe(false);
  });

  it('MOVEMENT_IDLE_EPSILON separates walk from idle without flicker', () => {
    expect(Math.abs(0) < MOVEMENT_IDLE_EPSILON).toBe(true);
    expect(Math.abs(0.01) < MOVEMENT_IDLE_EPSILON).toBe(false);
  });

  it('followLerp matches the spec lerp at 60Hz', () => {
    // Spec: min(1, dt*5) at dt=1/60 → 1/12 ≈ 0.0833.
    expect(followLerp(DT)).toBeCloseTo(1 - Math.exp(-CAMERA_FOLLOW_RATE * DT), 8);
  });
});
