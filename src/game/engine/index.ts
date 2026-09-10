/**
 * Barrel for the engine (loop, world, ECS, systems).
 */

export { GameLoop } from './loop/GameLoop';
export type { World as LoopWorld } from './loop/GameLoop';
export { GameWorld } from './GameWorld';
export type { FramePublisher, GameWorldOptions } from './GameWorld';
export * from './ecs';
export { AnimationTable } from './animation/AnimationTable';
export type { AnimationDefinition, AnimationManifest } from './animation/AnimationTable';
export {
  createInputSystem,
  clampAxis,
  type InputSource,
} from './systems/InputSystem';
export {
  createMovementSystem,
  feetRect,
  facingFromVector,
  isLocomotionAnim,
  locomotionAnimKey,
} from './systems/MovementSystem';
export {
  createAnimationSystem,
  type AnimCompleteListener,
} from './systems/AnimationSystem';
export {
  createCameraSystem,
  clampCameraTo,
  followLerp,
  type CameraBounds,
} from './systems/CameraSystem';
export {
  TileCollisionSpace,
  rectsOverlap,
  type CollisionSpace,
  type Rect,
  type WorldBounds,
} from './systems/collision';
export { SYSTEM_ORDER, type System, type SystemName } from './systems';
export {
  createMarkerSystem,
  type FocusedMarker,
  type MarkerFocusSink,
} from './systems/MarkerSystem';
export {
  SceneManager,
  type SceneManagerOptions,
} from './scene/SceneManager';
export type {
  SceneSpec,
  SceneType,
  SceneHandle,
  SceneBuilder,
  SceneAudioBridge,
  AmbientLight,
  EntitySpec,
  HeroEntitySpec,
  MarkerEntitySpec,
  MarkerSpriteSpec,
} from './scene/types';
export { produceSpriteCommands, type FrameSizeLookup } from './render/spriteCommands';
export {
  createTileCommandProducer,
  type TileCommandProducer,
  type TileLayerSpec,
} from './render/tileCommands';
