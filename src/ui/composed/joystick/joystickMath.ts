/**
 * Joystick math — pure translation from a raw knob displacement to the
 * analog move vector (spec 07 §4.1).
 *
 * Kept free of React/Reanimated so it is trivially unit-testable and
 * usable from both the gesture path (via `runOnJS`) and jest.
 *
 * Coordinates are screen-space, y-down: pushing the stick up produces
 * a **negative** y, which is exactly the convention the
 * `MovementSystem` uses for "up".
 *
 * @packageDocumentation
 */

/** 2D vector. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Clamp a raw knob displacement to the travel radius. No deadzone —
 * this is the **visual** position of the thumb cap, so it tracks the
 * finger 1:1 until it hits the rim.
 */
export function clampKnob(dx: number, dy: number, radius: number): Vec2 {
  'worklet';
  const len = Math.hypot(dx, dy);
  if (len <= radius || len === 0) {
    return { x: dx, y: dy };
  }
  return { x: (dx / len) * radius, y: (dy / len) * radius };
}

/**
 * Convert a raw knob displacement into the analog move vector:
 *
 *  1. Inside the deadzone → `(0, 0)` (a resting thumb must not drift).
 *  2. Outside → clamped to the rim, then normalized to `[-1, 1]` per
 *     axis so a fully-deflected diagonal is still magnitude 1
 *     (the `MovementSystem` re-normalizes defensively anyway).
 *
 * Analog taper: displacement between the deadzone and the rim maps
 * linearly onto `0..1`, so a half-tilt walks at half speed.
 */
export function intentFromKnob(
  dx: number,
  dy: number,
  radius: number,
  deadzone: number,
): Vec2 {
  'worklet';
  const len = Math.hypot(dx, dy);
  if (len <= deadzone || len === 0) {
    return { x: 0, y: 0 };
  }
  const clampedLen = Math.min(len, radius);
  const scale = clampedLen / radius / len;
  return { x: dx * scale, y: dy * scale };
}
