/**
 * Barrel for the ECS core (spec 07 §1).
 */

export type {
  Animation,
  CameraFollow,
  Collider,
  ComponentMap,
  ComponentTypeKey,
  Facing,
  FacingDir,
  Locomotion,
  MoveIntent,
  PlayerControlled,
  Position,
  Sprite,
  Velocity,
} from './components';
export { World } from './World';
export type { EntityId } from './World';
