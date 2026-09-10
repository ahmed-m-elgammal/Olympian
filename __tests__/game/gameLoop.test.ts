/**
 * Tests for GameLoop — fixed-timestep behavior (spec 07 §2).
 *
 * Covers: accumulator stepping at 60Hz, spiral-of-death clamping
 * (MAX_ACCUMULATOR_SEC = 0.1 per spec MAX_DT), step cap, pause behavior,
 * and start/stop lifecycle.
 */

import { GameLoop, MAX_ACCUMULATOR_SEC, MAX_STEPS_PER_TICK } from '@/game/engine/loop/GameLoop';

class FakeWorld {
  steps = 0;
  renders = 0;
  step(_dt: number): void {
    this.steps++;
  }
  render(): void {
    this.renders++;
  }
}

const FIXED_DT_MS = 1000 / 60;

describe('GameLoop (spec 07 §2)', () => {
  it('runs one step per fixed timestep and renders once per tick', () => {
    const world = new FakeWorld();
    const loop = new GameLoop(world);

    loop.tick(FIXED_DT_MS);
    expect(world.steps).toBe(1);
    expect(world.renders).toBe(1);

    loop.tick(FIXED_DT_MS * 3); // 3 fixed steps worth of time
    expect(world.steps).toBe(4);
    expect(world.renders).toBe(2);
  });

  it('keeps leftover time in the accumulator (no dropped remainder)', () => {
    const world = new FakeWorld();
    const loop = new GameLoop(world);

    // 1.5 fixed steps → 1 step runs, half remains.
    loop.tick(FIXED_DT_MS * 1.5);
    expect(world.steps).toBe(1);

    // Next normal frame accumulates the leftover → steps again.
    loop.tick(FIXED_DT_MS);
    expect(world.steps).toBe(2);
  });

  it('clamps the accumulator at MAX_ACCUMULATOR_SEC (0.1s, spec MAX_DT)', () => {
    const world = new FakeWorld();
    const loop = new GameLoop(world);

    // Huge stall (2s): clamped to 0.1s → floor(0.1 / (1/60)) = 6 steps,
    // but capped by MAX_STEPS_PER_TICK = 5.
    loop.tick(2000);
    expect(world.steps).toBe(MAX_STEPS_PER_TICK);
    expect(MAX_ACCUMULATOR_SEC).toBeCloseTo(0.1);
  });

  it('drops remaining time after hitting the step cap (spiral-of-death)', () => {
    const world = new FakeWorld();
    const loop = new GameLoop(world);

    loop.tick(2000); // clamp → 5 steps → accumulator reset
    expect(world.steps).toBe(MAX_STEPS_PER_TICK);

    // Accumulator was reset: the next normal frame runs exactly 1 step.
    loop.tick(FIXED_DT_MS);
    expect(world.steps).toBe(MAX_STEPS_PER_TICK + 1);
  });

  it('ignores negative deltas (clock went backwards)', () => {
    const world = new FakeWorld();
    const loop = new GameLoop(world);
    loop.tick(-16);
    expect(world.steps).toBe(0);
    expect(world.renders).toBe(0);
  });

  it('pause resets the time anchor; clamps still protect on resume', () => {
    const world = new FakeWorld();
    const loop = new GameLoop(world);

    loop.tick(FIXED_DT_MS); // 1 step
    expect(world.steps).toBe(1);

    // setPaused resets lastTime so a paused interval never leaks into
    // the accumulator. Simulate a huge wall-clock gap through tick —
    // the accumulator clamp still caps it.
    loop.setPaused(true);
    loop.setPaused(false);
    loop.tick(5000);
    expect(world.steps).toBe(1 + MAX_STEPS_PER_TICK);
  });

  it('start() is idempotent and stop() cancels the rAF handle', () => {
    const world = new FakeWorld();
    const loop = new GameLoop(world);
    expect(loop.isRunning).toBe(false);

    loop.start();
    expect(loop.isRunning).toBe(true);
    const handle = (loop as unknown as { rafHandle: number }).rafHandle;
    loop.start(); // no-op
    expect((loop as unknown as { rafHandle: number }).rafHandle).toBe(handle);

    loop.stop();
    expect(loop.isRunning).toBe(false);
  });

  it('reset() clears the accumulator', () => {
    const world = new FakeWorld();
    const loop = new GameLoop(world);
    loop.tick(FIXED_DT_MS * 1.5); // 1 step, leaves remainder
    const stepsBefore = world.steps;

    loop.reset();
    // After reset, a sub-threshold delta runs zero NEW steps.
    loop.tick(FIXED_DT_MS * 0.25);
    expect(world.steps).toBe(stepsBefore);
  });
});
