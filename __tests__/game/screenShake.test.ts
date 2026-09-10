/**
 * Tests for ScreenShake — time-decay behavior (spec 07 §3.6).
 *
 * Regression: the old update() computed `originalMax = intensity / falloff`
 * then `intensity = originalMax * falloff` — a circular no-op, so the
 * intensity never decayed and snapped abruptly to zero when the duration
 * expired. These tests pin the quadratic decay.
 */

import { ScreenShake } from '@/game/render/effects/ScreenShake';

describe('ScreenShake (spec 07 §3.6)', () => {
  it('starts at the triggered intensity and decays over the duration', () => {
    const shake = new ScreenShake();
    shake.trigger(1000, 20);
    expect(shake.isActive).toBe(true);
    expect(shake.intensity).toBe(20);

    shake.update(500); // halfway
    expect(shake.intensity).toBeCloseTo(20 * 0.25, 5); // quadratic falloff
    expect(shake.isActive).toBe(true);
  });

  it('decays monotonically and reaches zero when the duration expires', () => {
    const shake = new ScreenShake();
    shake.trigger(600, 16);

    let prev = shake.intensity;
    for (let t = 0; t < 600; t += 50) {
      shake.update(50);
      expect(shake.intensity).toBeLessThanOrEqual(prev + 1e-9);
      prev = shake.intensity;
    }
    expect(shake.intensity).toBe(0);
    expect(shake.isActive).toBe(false);
  });

  it('clamps intensity above the configured max', () => {
    const shake = new ScreenShake();
    shake.maxIntensity = 20;
    shake.trigger(500, 100);
    expect(shake.intensity).toBe(20);
    expect(shake.initialIntensity).toBe(20);
  });

  it('returns zero offset when inactive and non-zero while shaking', () => {
    const shake = new ScreenShake();
    expect(shake.getOffset()).toEqual({ x: 0, y: 0 });

    shake.trigger(1000, 20);
    // With intensity 20 / max 20 → amplitude = 20, offsets in [-20, 20].
    let sawNonZero = false;
    for (let i = 0; i < 50; i++) {
      const off = shake.getOffset();
      expect(Math.abs(off.x)).toBeLessThanOrEqual(20 + 1e-9);
      expect(Math.abs(off.y)).toBeLessThanOrEqual(20 + 1e-9);
      if (off.x !== 0 || off.y !== 0) sawNonZero = true;
    }
    expect(sawNonZero).toBe(true);
  });

  it('offset shrinks as the shake decays', () => {
    const shake = new ScreenShake();
    shake.trigger(1000, 20);

    let maxEarly = 0;
    for (let i = 0; i < 20; i++) maxEarly = Math.max(maxEarly, Math.abs(shake.getOffset().x));
    shake.update(900); // near the end → tiny intensity
    let maxLate = 0;
    for (let i = 0; i < 20; i++) maxLate = Math.max(maxLate, Math.abs(shake.getOffset().x));
    expect(maxLate).toBeLessThan(maxEarly);
  });

  it('ignores non-positive durations and keeps state consistent', () => {
    const shake = new ScreenShake();
    shake.trigger(0, 10);
    expect(shake.isActive).toBe(false);
    shake.trigger(-5, 10);
    expect(shake.isActive).toBe(false);
  });

  it('replaces the current shake on a new trigger', () => {
    const shake = new ScreenShake();
    shake.trigger(1000, 20);
    shake.update(900);
    expect(shake.intensity).toBeLessThan(20);

    shake.trigger(500, 12); // new shake replaces the old
    expect(shake.durationMs).toBe(500);
    expect(shake.totalDurationMs).toBe(500);
    expect(shake.initialIntensity).toBe(12);
    expect(shake.intensity).toBe(12);
  });

  it('cancel() stops the shake immediately', () => {
    const shake = new ScreenShake();
    shake.trigger(1000, 20);
    shake.cancel();
    expect(shake.isActive).toBe(false);
    expect(shake.intensity).toBe(0);
    expect(shake.initialIntensity).toBe(0);
    expect(shake.getOffset()).toEqual({ x: 0, y: 0 });
  });

  it('update() is a no-op when inactive', () => {
    const shake = new ScreenShake();
    shake.update(1000);
    expect(shake.isActive).toBe(false);
    expect(shake.intensity).toBe(0);
  });
});
