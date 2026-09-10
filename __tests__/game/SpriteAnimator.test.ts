/**
 * Tests for SpriteAnimator (spec 07 §6.1, task P1.E2.T11).
 *
 * Verifies:
 *  - Frame advance: 4 frames at 10fps → 100ms = 1 frame, 200ms = 2 frames.
 *  - Loop: at end, wraps to frame 0.
 *  - Non-loop: stays at last frame, fires onComplete.
 *  - Callback fires once for non-loop, multiple times for loop.
 *
 * The SpriteSheet dependency is real (no Skia needed — the animator
 * only touches the frame-lookup table, not the atlas image), so we
 * construct one with synthetic frame rects in-memory.
 */

import { SpriteAnimator } from '@/game/render/sprites/SpriteAnimator';
import { SpriteSheet } from '@/game/render/sprites/SpriteSheet';

/** Build a 4-frame sprite sheet, 16×16 each, laid out horizontally. */
function makeSheet(): SpriteSheet {
  return new SpriteSheet({
    atlas: null,
    frames: [
      { name: 'f0', x: 0, y: 0, width: 16, height: 16 },
      { name: 'f1', x: 16, y: 0, width: 16, height: 16 },
      { name: 'f2', x: 32, y: 0, width: 16, height: 16 },
      { name: 'f3', x: 48, y: 0, width: 16, height: 16 },
    ],
    frameWidth: 16,
    frameHeight: 16,
  });
}

/** Build a 4-frame, 10fps animator. */
function makeAnimator(
  sheet: SpriteSheet,
  opts: Partial<ConstructorParameters<typeof SpriteAnimator>[0]> = {},
): SpriteAnimator {
  return new SpriteAnimator({
    sheet,
    animationName: 'test',
    frames: ['f0', 'f1', 'f2', 'f3'],
    fps: 10,
    loop: false,
    ...opts,
  });
}

describe('SpriteAnimator', () => {
  let sheet: SpriteSheet;

  beforeEach(() => {
    sheet = makeSheet();
  });

  // -------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------

  describe('construction', () => {
    it('starts at frame 0 with no elapsed time', () => {
      const anim = makeAnimator(sheet);
      expect(anim.currentFrameIndex).toBe(0);
      expect(anim.isFinished).toBe(false);
      expect(anim.getCurrentFrameName()).toBe('f0');
    });

    it('exposes the configured animation name and frame count', () => {
      const anim = makeAnimator(sheet);
      expect(anim.animationName).toBe('test');
      expect(anim.frames).toHaveLength(4);
    });

    it('throws on empty frames list', () => {
      expect(
        () =>
          new SpriteAnimator({
            sheet,
            animationName: 'bad',
            frames: [],
            fps: 10,
          }),
      ).toThrow(/frames/);
    });

    it('throws on non-positive fps', () => {
      expect(
        () =>
          new SpriteAnimator({
            sheet,
            animationName: 'bad',
            frames: ['f0'],
            fps: 0,
          }),
      ).toThrow(/fps/);
    });
  });

  // -------------------------------------------------------------------
  // Frame advance
  // -------------------------------------------------------------------

  describe('frame advance (4 frames @ 10fps)', () => {
    it('100ms advances exactly 1 frame (frame 0 → frame 1)', () => {
      const anim = makeAnimator(sheet);
      const result = anim.update(100);
      expect(result).toBe('f1');
      expect(anim.currentFrameIndex).toBe(1);
      expect(anim.getCurrentFrameName()).toBe('f1');
    });

    it('200ms advances exactly 2 frames (frame 0 → frame 2)', () => {
      const anim = makeAnimator(sheet);
      const result = anim.update(200);
      expect(result).toBe('f2');
      expect(anim.currentFrameIndex).toBe(2);
    });

    it('300ms advances exactly 3 frames (frame 0 → frame 3)', () => {
      const anim = makeAnimator(sheet);
      const result = anim.update(300);
      expect(result).toBe('f3');
      expect(anim.currentFrameIndex).toBe(3);
    });

    it('two 100ms updates equal one 200ms update', () => {
      const anim = makeAnimator(sheet);
      anim.update(100);
      anim.update(100);
      expect(anim.currentFrameIndex).toBe(2);
    });

    it('0ms update does not advance the frame', () => {
      const anim = makeAnimator(sheet);
      anim.update(0);
      expect(anim.currentFrameIndex).toBe(0);
      expect(anim.getCurrentFrameName()).toBe('f0');
    });

    it('update smaller than frame duration does not advance', () => {
      const anim = makeAnimator(sheet);
      anim.update(99);
      expect(anim.currentFrameIndex).toBe(0);
    });

    it('accumulates fractional time across updates', () => {
      const anim = makeAnimator(sheet);
      // 50ms + 50ms = 100ms total → frame 1.
      anim.update(50);
      expect(anim.currentFrameIndex).toBe(0);
      anim.update(50);
      expect(anim.currentFrameIndex).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // Loop behavior
  // -------------------------------------------------------------------

  describe('loop (wraps at end)', () => {
    it('wraps to frame 0 after exactly one cycle (400ms)', () => {
      const anim = makeAnimator(sheet, { loop: true });
      const result = anim.update(400);
      expect(result).toBe('f0');
      expect(anim.currentFrameIndex).toBe(0);
      expect(anim.isFinished).toBe(false);
    });

    it('keeps wrapping across multiple cycles', () => {
      const anim = makeAnimator(sheet, { loop: true });
      // 800ms = 2 full cycles → back at frame 0.
      anim.update(800);
      expect(anim.currentFrameIndex).toBe(0);
    });

    it('handles partial cycles correctly', () => {
      const anim = makeAnimator(sheet, { loop: true });
      // 500ms = 1 cycle (400ms) + 100ms → frame 1.
      anim.update(500);
      expect(anim.currentFrameIndex).toBe(1);
    });

    it('never reports isFinished', () => {
      const anim = makeAnimator(sheet, { loop: true });
      anim.update(10_000);
      expect(anim.isFinished).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // Non-loop behavior
  // -------------------------------------------------------------------

  describe('non-loop (stays at last frame)', () => {
    it('marks finished after exactly one cycle (400ms)', () => {
      const anim = makeAnimator(sheet, { loop: false });
      const result = anim.update(400);
      expect(result).toBeNull();
      expect(anim.isFinished).toBe(true);
    });

    it('keeps the last frame index after finishing', () => {
      const anim = makeAnimator(sheet, { loop: false });
      anim.update(400);
      expect(anim.currentFrameIndex).toBe(3);
    });

    it('getCurrentFrame still returns the last frame rect after finish', () => {
      const anim = makeAnimator(sheet, { loop: false });
      anim.update(400);
      const rect = anim.getCurrentFrame();
      // f3 lives at x=48, y=0, 16×16.
      expect(rect.x).toBe(48);
      expect(rect.y).toBe(0);
      expect(rect.width).toBe(16);
      expect(rect.height).toBe(16);
    });

    it('getCurrentFrameName returns null after finish', () => {
      const anim = makeAnimator(sheet, { loop: false });
      anim.update(400);
      expect(anim.getCurrentFrameName()).toBeNull();
    });

    it('subsequent updates return null without re-firing callback', () => {
      const onComplete = jest.fn();
      const anim = makeAnimator(sheet, { loop: false, onComplete });
      anim.update(400); // finish
      expect(onComplete).toHaveBeenCalledTimes(1);
      anim.update(100); // already finished
      anim.update(100);
      expect(onComplete).toHaveBeenCalledTimes(1);
      // Update still returns null.
      expect(anim.update(100)).toBeNull();
    });

    it('overshoot beyond the cycle still clamps to last frame', () => {
      const anim = makeAnimator(sheet, { loop: false });
      anim.update(1000); // way past end
      expect(anim.isFinished).toBe(true);
      expect(anim.currentFrameIndex).toBe(3);
    });
  });

  // -------------------------------------------------------------------
  // Callbacks
  // -------------------------------------------------------------------

  describe('onComplete callback', () => {
    it('fires exactly once for a non-loop animation', () => {
      const onComplete = jest.fn();
      const anim = makeAnimator(sheet, { loop: false, onComplete });
      anim.update(400);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('does not fire before the end for a non-loop animation', () => {
      const onComplete = jest.fn();
      const anim = makeAnimator(sheet, { loop: false, onComplete });
      anim.update(300); // frame 3 reached, but cycle not done
      expect(onComplete).not.toHaveBeenCalled();
      anim.update(100); // now finish
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('fires once per cycle for a loop animation (3 cycles = 3 fires)', () => {
      const onComplete = jest.fn();
      const anim = makeAnimator(sheet, { loop: true, onComplete });
      anim.update(400); // cycle 1 → fire
      expect(onComplete).toHaveBeenCalledTimes(1);
      anim.update(400); // cycle 2 → fire
      expect(onComplete).toHaveBeenCalledTimes(2);
      anim.update(400); // cycle 3 → fire
      expect(onComplete).toHaveBeenCalledTimes(3);
    });

    it('fires once per update call even if multiple cycles pass', () => {
      const onComplete = jest.fn();
      const anim = makeAnimator(sheet, { loop: true, onComplete });
      // 1200ms = 3 full cycles, but only one update call.
      anim.update(1200);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('does not fire on a 0ms update', () => {
      const onComplete = jest.fn();
      const anim = makeAnimator(sheet, { loop: true, onComplete });
      anim.update(0);
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('does not fire on updates that do not cross a cycle boundary', () => {
      const onComplete = jest.fn();
      const anim = makeAnimator(sheet, { loop: true, onComplete });
      anim.update(100); // still in first cycle
      expect(onComplete).not.toHaveBeenCalled();
      anim.update(100); // 200ms total, still in cycle 1
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------

  describe('reset', () => {
    it('returns to frame 0 after advancing', () => {
      const anim = makeAnimator(sheet, { loop: false });
      anim.update(200);
      expect(anim.currentFrameIndex).toBe(2);
      anim.reset();
      expect(anim.currentFrameIndex).toBe(0);
      expect(anim.isFinished).toBe(false);
      expect(anim.getCurrentFrameName()).toBe('f0');
    });

    it('clears the finished flag on a finished non-loop animation', () => {
      const onComplete = jest.fn();
      const anim = makeAnimator(sheet, { loop: false, onComplete });
      anim.update(400);
      expect(anim.isFinished).toBe(true);
      anim.reset();
      expect(anim.isFinished).toBe(false);
      // Animation can finish again after reset.
      anim.update(400);
      expect(anim.isFinished).toBe(true);
      expect(onComplete).toHaveBeenCalledTimes(2);
    });

    it('restarts a loop animation cleanly', () => {
      const anim = makeAnimator(sheet, { loop: true });
      anim.update(500); // frame 1 of cycle 2
      anim.reset();
      expect(anim.currentFrameIndex).toBe(0);
      anim.update(100);
      expect(anim.currentFrameIndex).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // getCurrentFrame rect lookup
  // -------------------------------------------------------------------

  describe('getCurrentFrame rect lookup', () => {
    it('returns the source rect for the current frame', () => {
      const anim = makeAnimator(sheet);
      anim.update(100); // frame 1
      const rect = anim.getCurrentFrame();
      // f1 lives at x=16, y=0, 16×16.
      expect(rect.x).toBe(16);
      expect(rect.y).toBe(0);
      expect(rect.width).toBe(16);
      expect(rect.height).toBe(16);
    });

    it('updates the rect as the frame advances', () => {
      const anim = makeAnimator(sheet);
      anim.update(100);
      expect(anim.getCurrentFrame().x).toBe(16); // f1
      anim.update(100);
      expect(anim.getCurrentFrame().x).toBe(32); // f2
      anim.update(100);
      expect(anim.getCurrentFrame().x).toBe(48); // f3
    });
  });

  // -------------------------------------------------------------------
  // Negative delta handling
  // -------------------------------------------------------------------

  describe('defensive behavior', () => {
    it('ignores negative deltas', () => {
      const anim = makeAnimator(sheet);
      const result = anim.update(-50);
      expect(result).toBe('f0');
      expect(anim.currentFrameIndex).toBe(0);
    });

    it('handles large single-step deltas for loop', () => {
      const anim = makeAnimator(sheet, { loop: true });
      // 1234ms → 3 full cycles (1200ms) + 34ms → still frame 0.
      anim.update(1234);
      // 34ms < 100ms frame duration → still frame 0.
      expect(anim.currentFrameIndex).toBe(0);
    });
  });
});
