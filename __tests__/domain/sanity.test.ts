import { ok, err } from '@/shared/result';
import { clamp, lerp } from '@/shared/math';

describe('Sanity & Shared Utilities', () => {
  it('handles Result type correctly', () => {
    const success = ok(42);
    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.value).toBe(42);
    }

    const failure = err(new Error('Failed'));
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.message).toBe('Failed');
    }
  });

  it('clamps and lerps correctly', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);

    expect(lerp(0, 100, 0.5)).toBe(50);
  });
});
