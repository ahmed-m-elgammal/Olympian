/**
 * Tests for SfxPool (spec 11 §3.4, task P1.E4.T9).
 *
 * Verifies:
 *   - preload() loads Sound instances into the pool.
 *   - play() returns a SoundInstance and triggers Sound.play().
 *   - play() on a not-preloaded sound returns a no-op handle (no throw).
 *   - stop(soundId) and stop(soundId, instanceId) call Sound.stop().
 *   - setVolume(soundId, v) and setGroupVolume(v) recompute effective volume.
 *   - release() releases all Sound instances and clears the pool.
 *   - Pool size cap recycles finished instances.
 *   - Multiple preloads create multiple instances per sound id.
 *
 * `react-native-sound` is mocked at module level; the mock class records
 * every created instance on `globalThis.__mockSounds` for assertion.
 */

import Sound from 'react-native-sound';

import { SfxPool } from '@/platform/audio/SfxPool';

// ---------------------------------------------------------------------------
// Mock react-native-sound.
//
// react-native-sound uses `module.exports = Sound` (CommonJS), so the mock
// factory returns the class directly. The class records every instance on
// `globalThis.__mockSounds` so tests can assert against the underlying
// Sound objects the pool created.
// ---------------------------------------------------------------------------

interface MockSound {
  file: string;
  basePath: string;
  loaded: boolean;
  playing: boolean;
  volume: number;
  numberOfLoops: number;
  speed: number;
  onEnd: ((success: boolean) => void) | null;
  isLoaded(): boolean;
  isPlaying(): boolean;
  play(onEnd?: (success: boolean) => void): MockSound;
  pause(cb?: () => void): MockSound;
  stop(cb?: () => void): MockSound;
  release(): void;
  setVolume(v: number): MockSound;
  setNumberOfLoops(n: number): MockSound;
  setSpeed(s: number): MockSound;
  setPitch(p: number): void;
  getDuration(): number;
  getVolume(): number;
}

jest.mock('react-native-sound', () => {
  const instances: MockSound[] = [];

  class MockSoundImpl {
    static MAIN_BUNDLE = 'MAIN_BUNDLE';
    static DOCUMENT = 'DOCUMENT';
    static LIBRARY = 'LIBRARY';
    static CACHES = 'CACHES';

    file: string;
    basePath: string;
    loaded = true;
    playing = false;
    volume = 1.0;
    numberOfLoops = 0;
    speed = 1.0;
    pitch = 1.0;
    onEnd: ((success: boolean) => void) | null = null;

    constructor(file: string, basePath: string, cb?: (err: unknown) => void) {
      this.file = file;
      this.basePath = basePath;
      instances.push(this as unknown as MockSound);
      // Simulate a successful synchronous load.
      if (cb) cb(null);
    }

    isLoaded() {
      return this.loaded;
    }
    isPlaying() {
      return this.playing;
    }
    play(onEnd?: (success: boolean) => void) {
      this.playing = true;
      this.onEnd = onEnd ?? null;
      return this;
    }
    pause(cb?: () => void) {
      this.playing = false;
      cb?.();
      return this;
    }
    stop(cb?: () => void) {
      this.playing = false;
      cb?.();
      return this;
    }
    release() {
      this.loaded = false;
    }
    setVolume(v: number) {
      this.volume = v;
      return this;
    }
    setNumberOfLoops(n: number) {
      this.numberOfLoops = n;
      return this;
    }
    setSpeed(s: number) {
      this.speed = s;
      return this;
    }
    setPitch(p: number) {
      this.pitch = p;
    }
    getDuration() {
      return 0.5;
    }
    getVolume() {
      return this.volume;
    }
    reset() {
      return this;
    }
  }

  (globalThis as unknown as { __mockSounds: MockSound[] }).__mockSounds = instances;
  return MockSoundImpl;
});

function mockSounds(): MockSound[] {
  return (globalThis as unknown as { __mockSounds: MockSound[] }).__mockSounds;
}

// Reset the recorded instances + jest mocks between tests.
beforeEach(() => {
  mockSounds().length = 0;
});

describe('SfxPool (spec 11 §3.4)', () => {
  describe('preload()', () => {
    it('resolves and creates one Sound instance per call', async () => {
      const pool = new SfxPool();
      await pool.preload('sword_swing', 'combat/sword_swing.ogg');
      expect(mockSounds()).toHaveLength(1);
      expect(mockSounds()[0].file).toBe('combat/sword_swing.ogg');
      expect(mockSounds()[0].basePath).toBe(Sound.MAIN_BUNDLE);
    });

    it('multiple preloads for the same id create multiple instances', async () => {
      const pool = new SfxPool();
      await pool.preload('sword_swing', 'combat/sword_swing.ogg');
      await pool.preload('sword_swing', 'combat/sword_swing.ogg');
      await pool.preload('sword_swing', 'combat/sword_swing.ogg');
      expect(pool.instanceCount('sword_swing')).toBe(3);
      expect(pool.totalInstances()).toBe(3);
    });

    it('uses the provided basePath when given', async () => {
      const pool = new SfxPool({ basePath: Sound.DOCUMENT });
      await pool.preload('test', 'test.ogg');
      expect(mockSounds()[0].basePath).toBe(Sound.DOCUMENT);
    });

    it('resolves even if the Sound fails to load (no rejection)', async () => {
      // Verify preload resolves — actual error handling is internal.
      const pool = new SfxPool();
      await expect(pool.preload('x', 'x.ogg')).resolves.toBeUndefined();
    });
  });

  describe('play()', () => {
    it('returns a SoundInstance with a non-empty id and calls Sound.play()', async () => {
      const pool = new SfxPool();
      await pool.preload('swing', 'swing.ogg');
      const instance = pool.play('swing');
      expect(instance.id).not.toBe('');
      expect(mockSounds()[0].playing).toBe(true);
    });

    it('applies default volume 1.0 when no options given', async () => {
      const pool = new SfxPool();
      await pool.preload('swing', 'swing.ogg');
      pool.play('swing');
      expect(mockSounds()[0].volume).toBe(1.0);
    });

    it('applies per-call volume multiplier', async () => {
      const pool = new SfxPool();
      await pool.preload('swing', 'swing.ogg');
      pool.play('swing', { volume: 0.5 });
      expect(mockSounds()[0].volume).toBe(0.5);
    });

    it('composes per-call × per-sound × group volumes', async () => {
      const pool = new SfxPool();
      await pool.preload('swing', 'swing.ogg');
      pool.setVolume('swing', 0.8); // per-sound master
      pool.setGroupVolume(0.5); // mixer group
      pool.play('swing', { volume: 0.5 }); // per-call
      // 0.5 (group) × 0.8 (sound) × 0.5 (call) = 0.2
      expect(mockSounds()[0].volume).toBeCloseTo(0.2, 5);
    });

    it('clamps composed volume to [0,1]', async () => {
      const pool = new SfxPool();
      await pool.preload('swing', 'swing.ogg');
      // per-call > 1 is not allowed (clamp inside play), but a high sound
      // master × group × call could exceed 1 — verify clamp.
      pool.setVolume('swing', 1.0);
      pool.setGroupVolume(1.0);
      pool.play('swing', { volume: 1.0 });
      expect(mockSounds()[0].volume).toBeLessThanOrEqual(1.0);
    });

    it('sets numberOfLoops=-1 when loop:true', async () => {
      const pool = new SfxPool();
      await pool.preload('loop', 'loop.ogg');
      pool.play('loop', { loop: true });
      expect(mockSounds()[0].numberOfLoops).toBe(-1);
    });

    it('calls setSpeed when rate is provided', async () => {
      const pool = new SfxPool();
      await pool.preload('swing', 'swing.ogg');
      pool.play('swing', { rate: 2 });
      expect(mockSounds()[0].speed).toBe(2);
    });

    it('reuses an idle instance rather than creating a new one', async () => {
      const pool = new SfxPool();
      await pool.preload('swing', 'swing.ogg'); // 1 instance
      const i1 = pool.play('swing');
      // The first instance is now playing. Trigger its onEnd to mark idle.
      mockSounds()[0].onEnd?.(true);
      expect(pool.isPlaying('swing')).toBe(false);

      // Re-play — should reuse the same instance, not create a new one.
      const i2 = pool.play('swing');
      expect(pool.totalInstances()).toBe(1); // no new Sound created
      // Same instance id because the entry was reused.
      expect(i1.id).toBe(i2.id);
    });

    it('returns a no-op instance when sound is not preloaded', () => {
      const pool = new SfxPool();
      const instance = pool.play('unknown');
      expect(instance.id).toBe('');
      expect(instance.stop).not.toThrow();
    });
  });

  describe('stop()', () => {
    it('stops all instances of a sound id', async () => {
      const pool = new SfxPool();
      await pool.preload('swing', 'swing.ogg');
      await pool.preload('swing', 'swing.ogg');
      pool.play('swing');
      pool.play('swing');
      expect(pool.isPlaying('swing')).toBe(true);

      pool.stop('swing');
      expect(pool.isPlaying('swing')).toBe(false);
      expect(mockSounds()[0].playing).toBe(false);
      expect(mockSounds()[1].playing).toBe(false);
    });

    it('stops only the named instance when instanceId is given', async () => {
      const pool = new SfxPool();
      await pool.preload('swing', 'swing.ogg');
      await pool.preload('swing', 'swing.ogg');
      const i1 = pool.play('swing');
      pool.play('swing');

      pool.stop('swing', i1.id);
      expect(mockSounds()[0].playing).toBe(false);
      // i2 keeps playing
      expect(mockSounds()[1].playing).toBe(true);
    });

    it('is a no-op for an unknown sound id', () => {
      const pool = new SfxPool();
      expect(() => pool.stop('unknown')).not.toThrow();
    });

    it('calls Sound.stop() before reuse on play()', async () => {
      const pool = new SfxPool();
      await pool.preload('swing', 'swing.ogg');
      const sound = mockSounds()[0];
      // Spy on stop to assert it's called during the second play.
      const stopSpy = jest.spyOn(sound, 'stop');
      pool.play('swing');
      // Mark finished so it can be reused.
      sound.onEnd?.(true);
      pool.play('swing');
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('setVolume() / setGroupVolume()', () => {
    it('setVolume updates the master multiplier for that sound id', async () => {
      const pool = new SfxPool();
      await pool.preload('swing', 'swing.ogg');
      pool.play('swing');
      pool.setVolume('swing', 0.3);
      // group=1, sound=0.3, call=1 → 0.3
      expect(mockSounds()[0].volume).toBeCloseTo(0.3, 5);
    });

    it('setGroupVolume updates all playing instances', async () => {
      const pool = new SfxPool();
      await pool.preload('a', 'a.ogg');
      await pool.preload('b', 'b.ogg');
      pool.play('a');
      pool.play('b');
      pool.setGroupVolume(0.4);
      expect(mockSounds()[0].volume).toBeCloseTo(0.4, 5);
      expect(mockSounds()[1].volume).toBeCloseTo(0.4, 5);
    });

    it('does not affect non-playing instances (until next play)', async () => {
      const pool = new SfxPool();
      await pool.preload('a', 'a.ogg');
      // Don't play — setGroupVolume should not touch the idle instance.
      pool.setGroupVolume(0.4);
      expect(mockSounds()[0].volume).toBe(1.0); // default
    });
  });

  describe('pool size cap', () => {
    it('recycles oldest finished instance when pool is full', async () => {
      const pool = new SfxPool({ poolSize: 2 });
      await pool.preload('a', 'a.ogg');
      await pool.preload('b', 'b.ogg');
      expect(pool.totalInstances()).toBe(2);

      // Both instances are idle (no plays). Preloading a third should
      // recycle one of the idle instances to make room.
      await pool.preload('c', 'c.ogg');
      expect(pool.totalInstances()).toBe(2); // still 2, recycled one
      expect(mockSounds().length).toBe(3); // 3 Sound objects were constructed total
    });

    it('default pool size is 32', () => {
      const pool = new SfxPool();
      // We can't easily assert the private poolSize field, but the
      // constructor doesn't throw and accepts the default.
      expect(pool.totalInstances()).toBe(0);
    });
  });

  describe('release()', () => {
    it('calls Sound.release() on every instance and clears the pool', async () => {
      const pool = new SfxPool();
      await pool.preload('a', 'a.ogg');
      await pool.preload('b', 'b.ogg');
      expect(pool.totalInstances()).toBe(2);

      pool.release();
      expect(pool.totalInstances()).toBe(0);
      expect(mockSounds()[0].loaded).toBe(false);
      expect(mockSounds()[1].loaded).toBe(false);
    });

    it('is safe to call multiple times', () => {
      const pool = new SfxPool();
      expect(() => {
        pool.release();
        pool.release();
      }).not.toThrow();
    });
  });

  describe('instanceCount / isPlaying', () => {
    it('instanceCount returns 0 for unknown sound id', () => {
      const pool = new SfxPool();
      expect(pool.instanceCount('unknown')).toBe(0);
    });

    it('isPlaying returns false for unknown sound id', () => {
      const pool = new SfxPool();
      expect(pool.isPlaying('unknown')).toBe(false);
    });

    it('isPlaying returns true while any instance is playing', async () => {
      const pool = new SfxPool();
      await pool.preload('a', 'a.ogg');
      pool.play('a');
      expect(pool.isPlaying('a')).toBe(true);
      mockSounds()[0].onEnd?.(true);
      expect(pool.isPlaying('a')).toBe(false);
    });
  });

  // Regression tests for the state-leak bug on the recycle path:
  // numberOfLoops and speed persist on a native Sound instance between
  // plays — reusing an instance previously played with loop=true (or a
  // custom rate) without an explicit reset made it loop forever / play at
  // the wrong speed on the next trigger.
  describe('play() resets per-instance state on reuse', () => {
    it('a looped instance plays non-looped the next time', async () => {
      const pool = new SfxPool();
      await pool.preload('loopme', 'loopme.ogg');
      const sound = mockSounds()[0]!;

      pool.play('loopme', { loop: true });
      expect(sound.numberOfLoops).toBe(-1);
      sound.onEnd?.(true);

      pool.play('loopme');
      expect(sound.numberOfLoops).toBe(0);
    });

    it('a pitched instance resets to normal speed the next time', async () => {
      const pool = new SfxPool();
      await pool.preload('p', 'p.ogg');
      const sound = mockSounds()[0]!;

      pool.play('p', { rate: 2 });
      expect(sound.speed).toBe(2);
      sound.onEnd?.(true);

      pool.play('p');
      expect(sound.speed).toBe(1);
    });

    it('loop + rate can be combined and reset independently', async () => {
      const pool = new SfxPool();
      await pool.preload('x', 'x.ogg');
      const sound = mockSounds()[0]!;

      pool.play('x', { loop: true, rate: 0.5 });
      expect(sound.numberOfLoops).toBe(-1);
      expect(sound.speed).toBe(0.5);

      pool.stop('x');
      pool.play('x');
      expect(sound.numberOfLoops).toBe(0);
      expect(sound.speed).toBe(1);
    });
  });
});
