/**
 * Tests for MusicPlayer (spec 11 §3.3, task P1.E4.T9).
 *
 * Verifies:
 *   - init() is idempotent and never throws.
 *   - play(track) loads a Sound, sets volume, plays.
 *   - play(track, { fadeInMs }) starts at 0 and fades up over time.
 *   - play() with the same track id is a no-op.
 *   - crossfadeTo() switches to a new track and fades in from 0.
 *   - stop() with fadeOutMs animates volume to 0 then releases.
 *   - stop() without fadeOutMs releases immediately.
 *   - pause() / resume() round-trip the playing state.
 *   - setVolume(v) / setDuckFactor(f) compose into the effective volume.
 *   - getCurrentTrack() / isPlaying reflect the player's state.
 *   - onTrackEnd fires on natural playback end.
 *   - onError fires on load failure.
 *
 * `react-native-sound` is mocked at module level. The mock records every
 * created Sound on `globalThis.__mockSounds` and supports failure
 * injection via `__failNextLoad(err)`.
 */

import Sound from 'react-native-sound';

import { MusicPlayer } from '@/platform/audio/MusicPlayer';

// ---------------------------------------------------------------------------
// Mock react-native-sound.
//
// react-native-sound uses `module.exports = Sound` (CommonJS), so the mock
// factory returns the class directly.
// ---------------------------------------------------------------------------

interface MockSoundInstance {
  file: string;
  basePath: string;
  volume: number;
  released: boolean;
  playing: boolean;
  playCb: ((success: boolean) => void) | null;
  play: jest.Mock;
  pause: jest.Mock;
  stop: jest.Mock;
  release: jest.Mock;
  setVolume: jest.Mock;
  __finish: (success: boolean) => void;
}

jest.mock('react-native-sound', () => {
  const instances: MockSoundInstance[] = [];
  let nextLoadError: unknown = null;

  class MockSoundImpl {
    static MAIN_BUNDLE = 'MAIN_BUNDLE';
    static DOCUMENT = 'DOCUMENT';
    static setCategory = jest.fn();

    file: string;
    basePath: string;
    volume = 1.0;
    released = false;
    playing = false;
    playCb: ((success: boolean) => void) | null = null;
    play = jest.fn((cb?: (success: boolean) => void) => {
      this.playing = true;
      this.playCb = cb ?? null;
      return this;
    });
    pause = jest.fn(() => {
      this.playing = false;
      return this;
    });
    stop = jest.fn(() => {
      this.playing = false;
      return this;
    });
    release = jest.fn(() => {
      this.released = true;
      return this;
    });
    setVolume = jest.fn((v: number) => {
      this.volume = v;
      return this;
    });

    constructor(file: string, basePath: string, cb?: (err: unknown) => void) {
      this.file = file;
      this.basePath = basePath;
      instances.push(this as unknown as MockSoundInstance);
      const err = nextLoadError;
      nextLoadError = null;
      if (cb) cb(err);
    }

    __finish(success: boolean) {
      this.playCb?.(success);
    }
  }

  (globalThis as unknown as { __mockSounds: MockSoundInstance[] }).__mockSounds =
    instances;
  (globalThis as unknown as { __failNextSoundLoad: (e: unknown) => void }).__failNextSoundLoad =
    (e: unknown) => {
      nextLoadError = e;
    };
  (globalThis as unknown as { __resetMockSounds: () => void }).__resetMockSounds =
    () => {
      instances.length = 0;
      nextLoadError = null;
      MockSoundImpl.setCategory.mockClear();
    };

  return MockSoundImpl;
});

function sounds(): MockSoundInstance[] {
  return (globalThis as unknown as { __mockSounds: MockSoundInstance[] }).__mockSounds;
}

function lastSound(): MockSoundInstance {
  const all = sounds();
  return all[all.length - 1];
}

function failNextLoad(err: unknown): void {
  (globalThis as unknown as { __failNextSoundLoad: (e: unknown) => void }).__failNextSoundLoad(err);
}

function resetMocks(): void {
  (globalThis as unknown as { __resetMockSounds: () => void }).__resetMockSounds();
}

beforeEach(() => {
  resetMocks();
  jest.useRealTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MusicPlayer (spec 11 §3.3)', () => {
  describe('init()', () => {
    it('resolves and is idempotent', async () => {
      const player = new MusicPlayer();
      await expect(player.init()).resolves.toBeUndefined();
      await expect(player.init()).resolves.toBeUndefined();
      await expect(player.init()).resolves.toBeUndefined();
      expect((Sound as unknown as { setCategory: jest.Mock }).setCategory).toHaveBeenCalled();
    });

    it('never throws even when setCategory throws', async () => {
      (Sound as unknown as { setCategory: jest.Mock }).setCategory.mockImplementationOnce(() => {
        throw new Error('no native');
      });
      const player = new MusicPlayer();
      await expect(player.init()).resolves.toBeUndefined();
    });
  });

  describe('play()', () => {
    it('loads a Sound, sets volume, plays', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });

      expect(sounds()).toHaveLength(1);
      expect(lastSound().file).toBe('music/act1.ogg');
      expect(lastSound().setVolume).toHaveBeenCalledWith(0.8); // default volume
      expect(lastSound().play).toHaveBeenCalled();
      expect(player.getCurrentTrack()).toBe('act1');
      expect(player.isPlaying).toBe(true);
    });

    it('is a no-op when the same track is already playing', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      const countBefore = sounds().length;
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      expect(sounds()).toHaveLength(countBefore);
    });

    it('replaces the previous Sound when the track changes', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      const first = lastSound();
      await player.play({ id: 'act2', url: 'music/act2.ogg' });
      expect(first.release).toHaveBeenCalled();
      expect(lastSound().file).toBe('music/act2.ogg');
      expect(player.getCurrentTrack()).toBe('act2');
    });

    it('applies fadeInMs by starting at 0 then animating up', async () => {
      jest.useFakeTimers();
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' }, { fadeInMs: 100 });

      // First setVolume call should be 0 (start of fade-in).
      const firstCall = lastSound().setVolume.mock.calls[0]?.[0];
      expect(firstCall).toBe(0);

      expect(lastSound().play).toHaveBeenCalled();

      // Advance fake timers to complete the fade.
      jest.advanceTimersByTime(200);
      const lastCall = lastSound().setVolume.mock.calls.at(-1)?.[0];
      expect(lastCall).toBeCloseTo(0.8, 1);
    });

    it('does not fade when fadeInMs is 0', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' }, { fadeInMs: 0 });
      const calls = lastSound().setVolume.mock.calls.map((c) => c[0]);
      expect(calls).toContain(0.8);
    });

    it('fires onError and keeps state clean when load fails', async () => {
      const player = new MusicPlayer();
      const errored = jest.fn();
      player.setCallbacks({ onError: errored });
      failNextLoad(new Error('decode failed'));
      await player.play({ id: 'bad', url: 'music/bad.ogg' });
      expect(errored).toHaveBeenCalled();
      expect(player.getCurrentTrack()).toBeNull();
      expect(player.isPlaying).toBe(false);
    });
  });

  describe('crossfadeTo()', () => {
    it('switches tracks, starts at 0, fades in', async () => {
      jest.useFakeTimers();
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });

      await player.crossfadeTo({ id: 'act2', url: 'music/act2.ogg' }, 200);

      expect(lastSound().file).toBe('music/act2.ogg');
      // Set volume to 0 right before play.
      expect(lastSound().setVolume).toHaveBeenNthCalledWith(1, 0);

      jest.advanceTimersByTime(300);
      expect(player.getCurrentTrack()).toBe('act2');
      expect(player.isPlaying).toBe(true);
    });

    it('is a no-op when crossing to the same track', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      const countBefore = sounds().length;
      await player.crossfadeTo({ id: 'act1', url: 'music/act1.ogg' }, 200);
      expect(sounds()).toHaveLength(countBefore);
    });
  });

  describe('stop()', () => {
    it('without fadeOutMs releases immediately', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      const s = lastSound();
      await player.stop();
      expect(s.release).toHaveBeenCalled();
      expect(player.getCurrentTrack()).toBeNull();
      expect(player.isPlaying).toBe(false);
    });

    it('with fadeOutMs animates volume to 0 then releases', async () => {
      jest.useFakeTimers();
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      const s = lastSound();
      s.release.mockClear();

      await player.stop(100);
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();

      expect(s.release).toHaveBeenCalled();
      expect(player.isPlaying).toBe(false);
      // Last setVolume call should be ~0.
      const lastVol = s.setVolume.mock.calls.at(-1)?.[0] as number;
      expect(lastVol).toBeLessThanOrEqual(0.01);
    });
  });

  describe('pause() / resume()', () => {
    it('pause() pauses and clears isPlaying', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      expect(player.isPlaying).toBe(true);

      await player.pause();
      expect(lastSound().pause).toHaveBeenCalled();
      expect(player.isPlaying).toBe(false);
    });

    it('resume() plays again and restores isPlaying', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      await player.pause();
      await player.resume();
      expect(lastSound().play).toHaveBeenCalled();
      expect(player.isPlaying).toBe(true);
    });
  });

  describe('setVolume() / setDuckFactor()', () => {
    it('setVolume applies to the active Sound', async () => {
      const player = new MusicPlayer();
      await player.init();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      lastSound().setVolume.mockClear();
      player.setVolume(0.5);
      expect(lastSound().setVolume).toHaveBeenCalledWith(0.5);
      expect(player.getVolume()).toBe(0.5);
    });

    it('setDuckFactor multiplies the effective volume', async () => {
      const player = new MusicPlayer();
      await player.init();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      player.setVolume(0.8);
      lastSound().setVolume.mockClear();
      player.setDuckFactor(0.3);
      expect(lastSound().setVolume).toHaveBeenCalledWith(0.8 * 0.3);
      expect(player.getEffectiveVolume()).toBeCloseTo(0.24, 5);
    });

    it('clamps volume and duck factor to [0,1]', async () => {
      const player = new MusicPlayer();
      await player.init();
      player.setVolume(2);
      expect(player.getVolume()).toBe(1);
      player.setVolume(-1);
      expect(player.getVolume()).toBe(0);
    });

    it('setVolume before any play does not throw', () => {
      const player = new MusicPlayer();
      expect(() => player.setVolume(0.5)).not.toThrow();
      expect(player.getVolume()).toBe(0.5);
    });
  });

  describe('getCurrentTrack() / isPlaying', () => {
    it('returns null before any play', () => {
      const player = new MusicPlayer();
      expect(player.getCurrentTrack()).toBeNull();
      expect(player.isPlaying).toBe(false);
    });

    it('returns the active track id after play', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      expect(player.getCurrentTrack()).toBe('act1');
    });
  });

  describe('event callbacks', () => {
    it('onTrackEnd fires when playback ends naturally', async () => {
      const player = new MusicPlayer();
      const ended = jest.fn();
      player.setCallbacks({ onTrackEnd: ended });
      await player.play({ id: 'act1', url: 'music/act1.ogg' });

      lastSound().__finish(true);
      expect(ended).toHaveBeenCalledWith('act1');
      expect(player.isPlaying).toBe(false);
    });

    it('onError fires when playback reports failure', async () => {
      const player = new MusicPlayer();
      const errored = jest.fn();
      player.setCallbacks({ onError: errored });
      await player.play({ id: 'act1', url: 'music/act1.ogg' });

      lastSound().__finish(false);
      expect(errored).toHaveBeenCalled();
      expect(errored.mock.calls[0][0]).toBeInstanceOf(Error);
    });
  });

  describe('destroy()', () => {
    it('releases the Sound and clears state', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      const s = lastSound();
      await player.destroy();
      expect(s.release).toHaveBeenCalled();
      expect(player.getCurrentTrack()).toBeNull();
      expect(player.isPlaying).toBe(false);
    });

    it('is safe to call without prior init', async () => {
      const player = new MusicPlayer();
      await expect(player.destroy()).resolves.toBeUndefined();
    });
  });

  // Regression tests for the fade-race dataflow bug: a pending
  // stop(fadeOutMs) timer used to keep animating the volume to 0 and
  // release the player AFTER a subsequent play() had started a new track,
  // killing it. play()/crossfadeTo() must cancel in-flight fades first.
  describe('fade race: stop(fade) → play()', () => {
    it('a pending stop-fade does not kill a track started afterwards', async () => {
      jest.useFakeTimers();
      const player = new MusicPlayer();

      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      const first = lastSound();
      await player.stop(200); // schedules fade-to-0 + release

      // Immediately start a new track before the fade completes.
      await player.play({ id: 'act2', url: 'music/act2.ogg' });
      const second = lastSound();
      expect(second).not.toBe(first);
      second.release.mockClear();

      // Let the (now-cancelled) stop-fade timer window elapse.
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();

      // No release may fire after the new track started, and the new track
      // must still be playing.
      expect(second.release).not.toHaveBeenCalled();
      expect(player.getCurrentTrack()).toBe('act2');
      expect(player.isPlaying).toBe(true);

      jest.useRealTimers();
    });

    it('volume is not dragged to 0 by the cancelled stop-fade', async () => {
      jest.useFakeTimers();
      const player = new MusicPlayer();

      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      await player.stop(200);
      await player.play({ id: 'act2', url: 'music/act2.ogg' });

      jest.advanceTimersByTime(400);
      const lastVol = lastSound().setVolume.mock.calls.at(-1)?.[0] as number;
      expect(lastVol).toBeGreaterThan(0.01);

      jest.useRealTimers();
    });

    it('crossfadeTo() during a stop-fade keeps the new track playing', async () => {
      jest.useFakeTimers();
      const player = new MusicPlayer();

      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      await player.stop(200);
      await player.crossfadeTo({ id: 'act2', url: 'music/act2.ogg' }, 100);
      const second = lastSound();
      second.release.mockClear();

      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();

      expect(second.release).not.toHaveBeenCalled();
      expect(player.getCurrentTrack()).toBe('act2');
      expect(player.isPlaying).toBe(true);

      jest.useRealTimers();
    });
  });
});
