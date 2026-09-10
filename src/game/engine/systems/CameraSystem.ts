/**
 * CameraSystem — follow the player with a smooth lerp
 * (spec 07 §1.5, §3.5, P2.E1.T7).
 *
 * Each tick the system centers the camera on the first entity carrying
 * `cameraFollow` + `position` (plus the component's offset), using the
 * frame-rate-independent form of the spec's follow:
 *
 *     lerp = 1 - exp(-CAMERA_FOLLOW_RATE * dt)
 *
 * which equals the spec's `min(1, dt * 5)` at 60Hz and stays stable at
 * any tick rate. When `bounds` (world px) is supplied the camera is
 * clamped so the viewport never shows void beyond the map edge — maps
 * smaller than the viewport (in either axis) are centered instead.
 *
 * @packageDocumentation
 */

import { CAMERA_FOLLOW_RATE } from '@/game/config/gameplay';
import { clamp, lerp } from '@/shared/math';
import type { Camera } from '@/game/render/canvas/Camera';
import type { World } from '../ecs/World';
import type { System } from './index';

/** World size in px for camera clamping (from the map). */
export interface CameraBounds {
  width: number;
  height: number;
}

/** Exponential-decay lerp factor equivalent to the spec's dt-based lerp. */
export function followLerp(dt: number, rate: number = CAMERA_FOLLOW_RATE): number {
  return 1 - Math.exp(-rate * dt);
}

/** Clamp the camera so the viewport stays inside the world. */
export function clampCameraTo(
  camera: Camera,
  bounds: CameraBounds,
): void {
  const viewW = camera.viewport.width / camera.zoom;
  const viewH = camera.viewport.height / camera.zoom;

  if (bounds.width <= viewW) {
    camera.position.x = (bounds.width - viewW) / 2; // center narrow maps
  } else {
    camera.position.x = clamp(camera.position.x, 0, bounds.width - viewW);
  }
  if (bounds.height <= viewH) {
    camera.position.y = (bounds.height - viewH) / 2;
  } else {
    camera.position.y = clamp(camera.position.y, 0, bounds.height - viewH);
  }
}

/** Build the {@link CameraSystem}. */
export function createCameraSystem(
  camera: Camera,
  bounds?: CameraBounds,
): System {
  return (world: World, dt: number) => {
    const followers = world.query('cameraFollow', 'position');
    const first = followers[0];
    if (first === undefined) return;

    const follow = world.getComponent(first, 'cameraFollow');
    const pos = world.getComponent(first, 'position');
    if (!follow || !pos) return;

    camera.follow(
      { x: pos.x + follow.offsetX, y: pos.y + follow.offsetY },
      followLerp(dt),
    );
    if (bounds) clampCameraTo(camera, bounds);
  };
}

/** Re-export for callers that need the raw interpolation math. */
export { lerp as cameraLerp };

export default createCameraSystem;
