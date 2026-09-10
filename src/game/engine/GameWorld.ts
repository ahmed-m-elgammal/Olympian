/**
 * GameWorld — the concrete "world" the GameLoop drives
 * (spec 07 §1.5, §2; fulfills the loop's `World` interface).
 *
 * Owns the ECS `World`, the `Camera`, the per-frame `RenderSystem`
 * command buffer, and the ordered system list. Each fixed tick it runs
 * the systems; each render it assembles the draw list from components
 * and publishes it — together with the camera transform — through the
 * injected {@link FramePublisher} (the render layer adapts this to the
 * Zustand render bus, keeping the engine store-free).
 *
 * @packageDocumentation
 */

import { Camera, type CameraTransform } from '@/game/render/canvas/Camera';
import type { DrawCommand } from './render/DrawCommand';
import { produceSpriteCommands, type FrameSizeLookup } from './render/spriteCommands';
import type { TileCommandProducer } from './render/tileCommands';
import { RenderSystem } from './render/RenderSystem';
import { World } from './ecs/World';
import type { AnimationTable } from './animation/AnimationTable';
import type { CollisionSpace } from './systems/collision';
import type { System } from './systems/index';

/** Consumes the finished frame (the render bus adapter). */
export type FramePublisher = (
  commands: readonly DrawCommand[],
  camera: CameraTransform,
) => void;

export interface GameWorldOptions {
  /** Solid geometry + bounds for movement. */
  readonly collision: CollisionSpace;
  /** Animation registry shared by the movement + animation systems. */
  readonly animations: AnimationTable;
  /** Resolves sprite ids to pixel sizes (atlas registry adapter). */
  readonly frameSizeOf: FrameSizeLookup;
  /** Frame consumer (render bus adapter). */
  readonly publish: FramePublisher;
  /**
   * Optional tile-command producer (static map layers). When supplied,
   * its commands join the sprite commands in the same sorted draw list
   * so map + actors layer correctly (spec 07 §3.2).
   */
  readonly tileProducer?: TileCommandProducer;
  /**
   * System list in execution order. Scenes assemble via
   * `createDefaultSystems(...)`; injectable for tests.
   */
  readonly systems: readonly System[];
  /** Camera instance (a fresh one is created when omitted). */
  readonly camera?: Camera;
}

export class GameWorld {
  /** ECS store. */
  public readonly ecs = new World();
  /** World camera. */
  public readonly camera: Camera;
  /** Per-frame command buffer (sorted, read by the publisher). */
  public readonly renderSystem = new RenderSystem();

  private readonly collision: CollisionSpace;
  private readonly animations: AnimationTable;
  private readonly frameSizeOf: FrameSizeLookup;
  private readonly publish: FramePublisher;
  private readonly tileProducer?: TileCommandProducer;
  private readonly systems: readonly System[];

  constructor(opts: GameWorldOptions) {
    this.collision = opts.collision;
    this.animations = opts.animations;
    this.frameSizeOf = opts.frameSizeOf;
    this.publish = opts.publish;
    this.tileProducer = opts.tileProducer;
    this.systems = opts.systems;
    this.camera = opts.camera ?? new Camera();
  }

  /**
   * Advance the simulation by one fixed timestep. Runs every system in
   * registration order (spec 07 §1.5).
   */
  step(dt: number): void {
    for (const system of this.systems) {
      system(this.ecs, dt);
    }
  }

  /**
   * Assemble + publish the current frame: tile commands (culled,
   * run-merged map layers) + sprite commands (culled by the camera
   * viewport), sorted back-to-front, plus the camera transform for the
   * Skia group.
   */
  render(): void {
    this.renderSystem.clear();
    if (this.tileProducer) {
      this.renderSystem.submit(this.tileProducer());
    }
    this.renderSystem.submit(
      produceSpriteCommands(this.ecs, this.frameSizeOf, { camera: this.camera }),
    );
    this.renderSystem.sort();
    this.publish(this.renderSystem.getCommands(), this.camera.getTransform());
  }

  /** Collision space (exposed for spawning/interaction checks). */
  get collisionSpace(): CollisionSpace {
    return this.collision;
  }

  /** Animation table (exposed for gameplay transitions). */
  get animationTable(): AnimationTable {
    return this.animations;
  }
}

export default GameWorld;
