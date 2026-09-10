/**
 * Tests for the joystick math (spec 07 §4.1): rim clamping, deadzone,
 * analog taper, and screen-space (y-down) orientation.
 */

import { clampKnob, intentFromKnob } from '@/ui/composed/joystick/joystickMath';

const RADIUS = 50; // JOYSTICK_RADIUS (100px base)
const DEADZONE = 6; // JOYSTICK_DEADZONE_PX

describe('clampKnob (visual thumb-cap position)', () => {
  it('passes through displacements inside the rim', () => {
    expect(clampKnob(10, -20, RADIUS)).toEqual({ x: 10, y: -20 });
  });

  it('projects over-rim displacements onto the rim', () => {
    const knob = clampKnob(100, 0, RADIUS);
    expect(knob.x).toBeCloseTo(RADIUS);
    expect(knob.y).toBeCloseTo(0);

    const diag = clampKnob(30, 60, RADIUS); // |v| ≈ 67 > 50
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(RADIUS, 6);
    // Direction preserved.
    expect(diag.x / diag.y).toBeCloseTo(30 / 60, 6);
  });

  it('handles the zero vector without NaN', () => {
    expect(clampKnob(0, 0, RADIUS)).toEqual({ x: 0, y: 0 });
  });
});

describe('intentFromKnob (analog move vector)', () => {
  it('is zero inside the deadzone (resting thumb never drifts)', () => {
    expect(intentFromKnob(0, 0, RADIUS, DEADZONE)).toEqual({ x: 0, y: 0 });
    expect(intentFromKnob(4, 3, RADIUS, DEADZONE)).toEqual({ x: 0, y: 0 }); // |v|=5 < 6
  });

  it('full deflection right → (1, 0); up → (0, -1) (y-down screen space)', () => {
    expect(intentFromKnob(RADIUS, 0, RADIUS, DEADZONE).x).toBeCloseTo(1);
    expect(intentFromKnob(0, -RADIUS, RADIUS, DEADZONE).y).toBeCloseTo(-1);
  });

  it('tapers linearly between deadzone and rim (half tilt = half speed)', () => {
    expect(intentFromKnob(RADIUS / 2, 0, RADIUS, DEADZONE).x).toBeCloseTo(0.5);
    expect(intentFromKnob(0, -RADIUS / 4, RADIUS, DEADZONE).y).toBeCloseTo(-0.25);
  });

  it('full diagonal deflection stays magnitude 1', () => {
    const v = intentFromKnob(RADIUS, RADIUS, RADIUS, DEADZONE);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
  });

  it('clamps overdrive input to the rim', () => {
    const v = intentFromKnob(500, 0, RADIUS, DEADZONE);
    expect(v.x).toBeCloseTo(1);
  });

  it('avoids NaN at the exact origin', () => {
    const v = intentFromKnob(0, 0, RADIUS, 0);
    expect(Number.isNaN(v.x)).toBe(false);
    expect(Number.isNaN(v.y)).toBe(false);
  });
});
