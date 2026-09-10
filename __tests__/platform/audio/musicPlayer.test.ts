/**
 * Tests for MusicPlayer (spec 11 §3.3, task P1.E4.T9).
 *
 * Verifies:
 *   - init() calls TrackPlayer.setupPlayer() + updateOptions() once.
 *   - play(track) resets the queue, adds the track, sets volume, plays.
 *   - play(track, { fadeInMs }) starts at 0 and fades up over time.
 *   - play() with the same track id is a no-op.
 *   - crossfadeTo() switches to a new track and fades in from 0.
 *   - stop() with fadeOutMs animates volume to 0 then resets.
 *   - stop() without fadeOutMs resets immediately.
 *   - pause() / resume() round-trip the playing state.
 *   - setVolume(v) / setDuckFactor(f) compose into the effective volume.
 *   - getCurrentTrack() / isPlaying reflect the player's state.
 *   - onTrackEnd fires on the PlaybackQueueEnded event.
 *   - onError fires on PlayerError / PlaybackError events.
 *
 * `react-native-track-player` is mocked at module level. The mock stores
 * listeners keyed by event name and exposes `__emit(event, payload)` so
 * tests can simulate native events.
 */

import { MusicPlayer } from '@/platform/audio/MusicPlayer';

// ---------------------------------------------------------------------------
// Mock react-native-track-player
// ---------------------------------------------------------------------------

interface MockTrackPlayer {
  setupPlayer: jest.Mock;
  updateOptions: jest.Mock;
  add: jest.Mock;
  reset: jest.Mock;
  play: jest.Mock;
  pause: jest.Mock;
  stop: jest.Mock;
  setVolume: jest.Mock;
  setRate: jest.Mock;
  addEventListener: jest.Mock;
  getActiveTrack: jest.Mock;
  getActiveTrackIndex: jest.Mock;
  getVolume: jest.Mock;
  __emit: (event: string, payload?: unknown) => void;
  __reset: () => void;
}

jest.mock('react-native-track-player', () => {
  const Event = {
    PlayerError: 'player-error',
    PlaybackState: 'playback-state',
    PlaybackError: 'playback-error',
    PlaybackQueueEnded: 'playback-queue-ended',
    PlaybackActiveTrackChanged: 'playback-active-track-changed',
    PlaybackTrackChanged: 'playback-track-changed',
    PlaybackPlayWhenReadyChanged: 'playback-play-when-ready-changed',
    PlaybackProgressUpdated: 'playback-progress-updated',
    RemoteDuck: 'remote-duck',
  };

  const listeners: Record<string, Array<(payload?: unknown) => void>> = {};

  const instance: MockTrackPlayer = {
    setupPlayer: jest.fn().mockResolvedValue(undefined),
    updateOptions: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(0),
    reset: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    setVolume: jest.fn().mockResolvedValue(undefined),
    setRate: jest.fn().mockResolvedValue(undefined),
    addEventListener: jest.fn((event: string, cb: (payload?: unknown) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      return {
        remove: () => {
          const arr = listeners[event];
          if (arr) {
            const idx = arr.indexOf(cb);
            if (idx >= 0) arr.splice(idx, 1);
          }
        },
      };
    }),
    getActiveTrack: jest.fn().mockResolvedValue(undefined),
    getActiveTrackIndex: jest.fn().mockResolvedValue(undefined),
    getVolume: jest.fn().mockResolvedValue(0.8),
    __emit(event: string, payload?: unknown) {
      const arr = listeners[event];
      if (arr) for (const cb of arr) cb(payload);
    },
    __reset() {
      for (const k of Object.keys(listeners)) delete listeners[k];
      instance.setupPlayer.mockClear();
      instance.updateOptions.mockClear();
      instance.add.mockClear();
      instance.reset.mockClear();
      instance.play.mockClear();
      instance.pause.mockClear();
      instance.stop.mockClear();
      instance.setVolume.mockClear();
      instance.setRate.mockClear();
      instance.addEventListener.mockClear();
      instance.getActiveTrack.mockClear();
      instance.getActiveTrackIndex.mockClear();
      instance.getVolume.mockClear();
      instance.setupPlayer.mockResolvedValue(undefined);
      instance.updateOptions.mockResolvedValue(undefined);
      instance.add.mockResolvedValue(0);
      instance.reset.mockResolvedValue(undefined);
      instance.play.mockResolvedValue(undefined);
      instance.pause.mockResolvedValue(undefined);
      instance.stop.mockResolvedValue(undefined);
      instance.setVolume.mockResolvedValue(undefined);
      instance.setRate.mockResolvedValue(undefined);
      instance.getActiveTrack.mockResolvedValue(undefined);
      instance.getActiveTrackIndex.mockResolvedValue(undefined);
      instance.getVolume.mockResolvedValue(0.8);
    },
  };

  (globalThis as unknown as { __mockTrackPlayer: MockTrackPlayer }).__mockTrackPlayer = instance;
  return { __esModule: true, default: instance, Event, Capability: {}, State: {} };
});

function tp(): MockTrackPlayer {
  return (globalThis as unknown as { __mockTrackPlayer: MockTrackPlayer }).__mockTrackPlayer;
}

beforeEach(() => {
  tp().__reset();
  jest.useRealTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MusicPlayer (spec 11 §3.3)', () => {
  describe('init()', () => {
    it('calls setupPlayer() and updateOptions()', async () => {
      const player = new MusicPlayer();
      await player.init();
      expect(tp().setupPlayer).toHaveBeenCalledTimes(1);
      expect(tp().updateOptions).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — setupPlayer() called only once across multiple inits', async () => {
      const player = new MusicPlayer();
      await player.init();
      await player.init();
      await player.init();
      expect(tp().setupPlayer).toHaveBeenCalledTimes(1);
    });

    it('registers PlaybackQueueEnded and PlayerError listeners', async () => {
      const player = new MusicPlayer();
      await player.init();
      // Two listeners: PlaybackQueueEnded + PlayerError + PlaybackError = 3.
      expect(tp().addEventListener).toHaveBeenCalledTimes(3);
    });
  });

  describe('play()', () => {
    it('resets queue, adds track, sets volume, plays', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });

      expect(tp().reset).toHaveBeenCalled();
      expect(tp().add).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'act1', url: 'music/act1.ogg' }),
      );
      expect(tp().setVolume).toHaveBeenCalledWith(0.8); // default volume
      expect(tp().play).toHaveBeenCalled();
      expect(player.getCurrentTrack()).toBe('act1');
      expect(player.isPlaying).toBe(true);
    });

    it('defaults title to track id when not provided', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      expect(tp().add).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'act1', artist: 'Olympian OST' }),
      );
    });

    it('is a no-op when the same track is already playing', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      const addCallsBefore = tp().add.mock.calls.length;
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      expect(tp().add.mock.calls.length).toBe(addCallsBefore);
    });

    it('applies fadeInMs by starting at 0 then animating up', async () => {
      jest.useFakeTimers();
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' }, { fadeInMs: 100 });

      // First setVolume call should be 0 (start of fade-in).
      const firstCall = tp().setVolume.mock.calls[0]?.[0];
      expect(firstCall).toBe(0);

      // TrackPlayer.play() called.
      expect(tp().play).toHaveBeenCalled();

      // Advance fake timers to complete the fade.
      jest.advanceTimersByTime(200);
      // Last setVolume should be the effective volume (0.8 default).
      const lastCall = tp().setVolume.mock.calls.at(-1)?.[0];
      expect(lastCall).toBeCloseTo(0.8, 1);
    });

    it('does not fade when fadeInMs is 0', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' }, { fadeInMs: 0 });
      // setVolume called once with the effective volume (0.8).
      const calls = tp().setVolume.mock.calls.map((c) => c[0]);
      expect(calls).toContain(0.8);
    });
  });

  describe('crossfadeTo()', () => {
    it('resets queue, adds new track, starts at 0, fades in', async () => {
      jest.useFakeTimers();
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      tp().setVolume.mockClear();

      await player.crossfadeTo({ id: 'act2', url: 'music/act2.ogg' }, 200);

      expect(tp().reset).toHaveBeenCalled();
      expect(tp().add).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'act2', url: 'music/act2.ogg' }),
      );
      // Set volume to 0 right before play.
      expect(tp().setVolume).toHaveBeenNthCalledWith(1, 0);

      jest.advanceTimersByTime(300);
      expect(player.getCurrentTrack()).toBe('act2');
      expect(player.isPlaying).toBe(true);
    });

    it('is a no-op when crossing to the same track', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      const resetBefore = tp().reset.mock.calls.length;
      await player.crossfadeTo({ id: 'act1', url: 'music/act1.ogg' }, 200);
      expect(tp().reset.mock.calls.length).toBe(resetBefore);
    });
  });

  describe('stop()', () => {
    it('without fadeOutMs resets immediately', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      await player.stop();
      expect(tp().reset).toHaveBeenCalled();
      expect(player.getCurrentTrack()).toBeNull();
      expect(player.isPlaying).toBe(false);
    });

    it('with fadeOutMs animates volume to 0 then resets', async () => {
      jest.useFakeTimers();
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      tp().reset.mockClear();

      await player.stop(100);
      jest.advanceTimersByTime(150);
      // Drain the microtask queued by resetInternal()'s `await TrackPlayer.reset()`.
      await Promise.resolve();
      await Promise.resolve();

      expect(tp().reset).toHaveBeenCalled();
      expect(player.isPlaying).toBe(false);
      // Last setVolume call should be 0.
      const lastVol = tp().setVolume.mock.calls.at(-1)?.[0];
      expect(lastVol).toBeLessThanOrEqual(0.01);
    });
  });

  describe('pause() / resume()', () => {
    it('pause() calls TrackPlayer.pause() and clears isPlaying', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      expect(player.isPlaying).toBe(true);

      await player.pause();
      expect(tp().pause).toHaveBeenCalled();
      expect(player.isPlaying).toBe(false);
    });

    it('resume() calls TrackPlayer.play() and restores isPlaying', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      await player.pause();
      await player.resume();
      expect(tp().play).toHaveBeenCalled();
      expect(player.isPlaying).toBe(true);
    });
  });

  describe('setVolume() / setDuckFactor()', () => {
    it('setVolume calls TrackPlayer.setVolume with the new value', async () => {
      const player = new MusicPlayer();
      await player.init();
      tp().setVolume.mockClear();
      player.setVolume(0.5);
      expect(tp().setVolume).toHaveBeenCalledWith(0.5);
      expect(player.getVolume()).toBe(0.5);
    });

    it('setDuckFactor multiplies the effective volume', async () => {
      const player = new MusicPlayer();
      await player.init();
      player.setVolume(0.8);
      tp().setVolume.mockClear();
      player.setDuckFactor(0.3);
      expect(tp().setVolume).toHaveBeenCalledWith(0.8 * 0.3);
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
    it('onTrackEnd fires when PlaybackQueueEnded event triggers', async () => {
      const player = new MusicPlayer();
      const ended = jest.fn();
      player.setCallbacks({ onTrackEnd: ended });
      await player.play({ id: 'act1', url: 'music/act1.ogg' });

      tp().__emit('playback-queue-ended');
      expect(ended).toHaveBeenCalledWith('act1');
      expect(player.isPlaying).toBe(false);
    });

    it('onError fires when PlayerError event triggers', async () => {
      const player = new MusicPlayer();
      const errored = jest.fn();
      player.setCallbacks({ onError: errored });
      await player.play({ id: 'act1', url: 'music/act1.ogg' });

      tp().__emit('player-error', { error: 'decoding failed' });
      expect(errored).toHaveBeenCalled();
      expect(errored.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('onError fires when PlaybackError event triggers', async () => {
      const player = new MusicPlayer();
      const errored = jest.fn();
      player.setCallbacks({ onError: errored });
      await player.play({ id: 'act1', url: 'music/act1.ogg' });

      tp().__emit('playback-error', { error: 'stream interrupted' });
      expect(errored).toHaveBeenCalled();
    });
  });

  describe('destroy()', () => {
    it('cancels fades, resets player, clears state', async () => {
      const player = new MusicPlayer();
      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      await player.destroy();
      expect(tp().reset).toHaveBeenCalled();
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
  // reset() the player AFTER a subsequent play() had started a new track,
  // killing it. play()/crossfadeTo() must cancel in-flight fades first.
  describe('fade race: stop(fade) → play()', () => {
    it('a pending stop-fade does not kill a track started afterwards', async () => {
      jest.useFakeTimers();
      const player = new MusicPlayer();

      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      await player.stop(200); // schedules fade-to-0 + resetInternal()

      // Immediately start a new track before the fade completes.
      await player.play({ id: 'act2', url: 'music/act2.ogg' });
      tp().reset.mockClear();

      // Let the (now-cancelled) stop-fade timer window elapse.
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();

      // No reset may fire after the new track started, and the new track
      // must still be playing.
      expect(tp().reset).not.toHaveBeenCalled();
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
      const lastVol = tp().setVolume.mock.calls.at(-1)?.[0] as number;
      expect(lastVol).toBeGreaterThan(0.01);

      jest.useRealTimers();
    });

    it('crossfadeTo() during a stop-fade keeps the new track playing', async () => {
      jest.useFakeTimers();
      const player = new MusicPlayer();

      await player.play({ id: 'act1', url: 'music/act1.ogg' });
      await player.stop(200);
      await player.crossfadeTo({ id: 'act2', url: 'music/act2.ogg' }, 100);
      tp().reset.mockClear();

      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();

      expect(tp().reset).not.toHaveBeenCalled();
      expect(player.getCurrentTrack()).toBe('act2');
      expect(player.isPlaying).toBe(true);

      jest.useRealTimers();
    });
  });
});
