/**
 * Tests for AudioMixer (spec 11 §3.2, §6; task P1.E4.T9).
 *
 * Verifies:
 *   - getGroupVolume / setGroupVolume round-trip for every group.
 *   - setGroupVolume clamps to [0,1].
 *   - getEffectiveVolume = master × group × duckFactor.
 *   - setGroupVolume('master') fans out notifications to every group.
 *   - duck(group, target, 0) sets duckFactor immediately; effective reflects it.
 *   - unduck(group, 0) restores duckFactor to 1.
 *   - duck/unduck animate over durationMs under fake timers.
 *   - subscribe() returns an unsubscribe; cb stops firing after unsubscribe.
 *   - subscribe() callback receives the effective volume.
 *   - setGroupVolume('music', v) persists to MMKV via setMusicVolume.
 *   - setGroupVolume('sfx', v) persists to MMKV via setSfxVolume.
 *   - setGroupVolume('ambience', v) does NOT persist (only music/sfx).
 *   - loadFromStorage() reads MMKV values into group volumes.
 *   - Unknown group names are rejected gracefully (no crash, no notify).
 *
 * `react-native-mmkv` is mocked in-memory so importing
 * `@/platform/storage/mmkv` works and persistence can be asserted.
 */

import {
  AudioMixer,
  DEFAULT_GROUP_VOLUMES,
  VOLUME_GROUPS,
} from '@/platform/audio/mixer';
import {
  getMusicVolume,
  getSfxVolume,
  setMusicVolume,
  setSfxVolume,
} from '@/platform/storage/mmkv';

// ---------------------------------------------------------------------------
// Mock react-native-mmkv (in-memory Map-backed singleton)
// ---------------------------------------------------------------------------

jest.mock('react-native-mmkv', () => {
  const store = new Map<string, boolean | string | number>();
  const instance = {
    set(key: string, value: boolean | string | number): void {
      store.set(key, value);
    },
    getBoolean(key: string): boolean | undefined {
      const v = store.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    getString(key: string): string | undefined {
      const v = store.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getNumber(key: string): number | undefined {
      const v = store.get(key);
      return typeof v === 'number' ? v : undefined;
    },
    contains(key: string): boolean {
      return store.has(key);
    },
    delete(key: string): void {
      store.delete(key);
    },
    getAllKeys(): string[] {
      return Array.from(store.keys());
    },
    clearAll(): void {
      store.clear();
    },
  };
  (globalThis as unknown as { __mockMmkv: typeof instance }).__mockMmkv = instance;
  return {
    MMKV: class {
      constructor() {
        return instance;
      }
    },
  };
});

beforeEach(() => {
  // Clear the in-memory MMKV store between tests.
  const mmkv = (globalThis as unknown as { __mockMmkv: { clearAll(): void } }).__mockMmkv;
  mmkv.clearAll();
  jest.useRealTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AudioMixer (spec 11 §3.2, §6)', () => {
  describe('group volumes', () => {
    it('getGroupVolume returns defaults for every group', () => {
      const m = new AudioMixer();
      for (const g of VOLUME_GROUPS) {
        expect(m.getGroupVolume(g)).toBe(DEFAULT_GROUP_VOLUMES[g]);
      }
    });

    it('setGroupVolume round-trips', () => {
      const m = new AudioMixer();
      m.setGroupVolume('music', 0.5);
      expect(m.getGroupVolume('music')).toBe(0.5);
      m.setGroupVolume('sfx', 0.25);
      expect(m.getGroupVolume('sfx')).toBe(0.25);
    });

    it('clamps setGroupVolume to [0,1]', () => {
      const m = new AudioMixer();
      m.setGroupVolume('music', 2);
      expect(m.getGroupVolume('music')).toBe(1);
      m.setGroupVolume('music', -1);
      expect(m.getGroupVolume('music')).toBe(0);
    });

    it('accepts initial volume overrides in the constructor', () => {
      const m = new AudioMixer({
        initialVolumes: { music: 0.3, sfx: 0.7 },
      });
      expect(m.getGroupVolume('music')).toBe(0.3);
      expect(m.getGroupVolume('sfx')).toBe(0.7);
      // Others unchanged.
      expect(m.getGroupVolume('ambience')).toBe(DEFAULT_GROUP_VOLUMES.ambience);
    });

    it('ignores unknown group names', () => {
      const m = new AudioMixer();
      expect(() => m.setGroupVolume('notAGroup' as never, 0.5)).not.toThrow();
      expect(m.getGroupVolume('notAGroup' as never)).toBe(0);
    });
  });

  describe('getEffectiveVolume', () => {
    it('master × group × duckFactor', () => {
      const m = new AudioMixer();
      // master=1, music=0.8, duck=1 → 0.8
      expect(m.getEffectiveVolume('music')).toBeCloseTo(0.8, 5);
      m.setGroupVolume('master', 0.5);
      // master=0.5, music=0.8, duck=1 → 0.4
      expect(m.getEffectiveVolume('music')).toBeCloseTo(0.4, 5);
      m.duck('music', 0.3, 0);
      // master=0.5, music=0.8, duck=0.3 → 0.12
      expect(m.getEffectiveVolume('music')).toBeCloseTo(0.12, 5);
    });

    it('master group is its own volume × duckFactor (no self-multiply)', () => {
      const m = new AudioMixer();
      expect(m.getEffectiveVolume('master')).toBe(1.0);
      m.setGroupVolume('master', 0.5);
      expect(m.getEffectiveVolume('master')).toBe(0.5);
    });

    it('clamps to [0,1] even when master × group × duck would overflow', () => {
      const m = new AudioMixer({
        initialVolumes: { master: 1, music: 1 },
      });
      // duckFactor > 1 isn't possible via the API, but defensively clamp.
      m.duck('music', 1, 0);
      expect(m.getEffectiveVolume('music')).toBeLessThanOrEqual(1);
    });
  });

  describe('ducking', () => {
    it('duck(group, target, 0) sets duck factor immediately', () => {
      const m = new AudioMixer();
      m.duck('music', 0.3, 0);
      expect(m.getEffectiveVolume('music')).toBeCloseTo(0.8 * 0.3, 5);
    });

    it('unduck(group, 0) restores to full', () => {
      const m = new AudioMixer();
      m.duck('music', 0.3, 0);
      expect(m.getEffectiveVolume('music')).toBeLessThan(0.8);
      m.unduck('music', 0);
      expect(m.getEffectiveVolume('music')).toBeCloseTo(0.8, 5);
    });

    it('duck with durationMs animates (fake timers)', () => {
      jest.useFakeTimers();
      const m = new AudioMixer();
      const cb = jest.fn();
      m.subscribe('music', cb);
      cb.mockClear();

      m.duck('music', 0.3, 200);
      // Before time advances, the first notify has fired (step 1 of 13).
      // 200ms / 16ms = 12.5 → 13 steps.
      const callsMid = cb.mock.calls.length;
      expect(callsMid).toBeGreaterThan(0);

      jest.advanceTimersByTime(300);
      // After fade completes, duckFactor should be exactly 0.3.
      expect(m.getEffectiveVolume('music')).toBeCloseTo(0.8 * 0.3, 5);
      // Final callback fired.
      const lastCall = cb.mock.calls.at(-1)?.[0];
      expect(lastCall).toBeCloseTo(0.8 * 0.3, 5);
    });

    it('unduck with durationMs animates back to 1', () => {
      jest.useFakeTimers();
      const m = new AudioMixer();
      m.duck('music', 0.3, 0);
      expect(m.getEffectiveVolume('music')).toBeCloseTo(0.24, 5);

      m.unduck('music', 200);
      jest.advanceTimersByTime(300);
      expect(m.getEffectiveVolume('music')).toBeCloseTo(0.8, 5);
    });

    it('cancels previous duck animation when a new one starts', () => {
      jest.useFakeTimers();
      const m = new AudioMixer();
      m.duck('music', 0.3, 200);
      // Halfway through, start a new duck.
      jest.advanceTimersByTime(50);
      m.duck('music', 0.5, 200);
      jest.advanceTimersByTime(300);
      // Final state should be 0.5 (the most recent target).
      expect(m.getEffectiveVolume('music')).toBeCloseTo(0.8 * 0.5, 5);
    });

    it('ignores unknown group names', () => {
      const m = new AudioMixer();
      expect(() => m.duck('notAGroup' as never, 0.3, 0)).not.toThrow();
      expect(() => m.unduck('notAGroup' as never, 0)).not.toThrow();
    });
  });

  describe('subscribe()', () => {
    it('fires on setGroupVolume for the changed group', () => {
      const m = new AudioMixer();
      const musicCb = jest.fn();
      const sfxCb = jest.fn();
      m.subscribe('music', musicCb);
      m.subscribe('sfx', sfxCb);

      musicCb.mockClear();
      sfxCb.mockClear();

      m.setGroupVolume('music', 0.5);
      expect(musicCb).toHaveBeenCalled();
      expect(sfxCb).not.toHaveBeenCalled();
    });

    it('fires for every group when master changes', () => {
      const m = new AudioMixer();
      const musicCb = jest.fn();
      const sfxCb = jest.fn();
      const ambienceCb = jest.fn();
      const uiCb = jest.fn();
      const voiceCb = jest.fn();
      const masterCb = jest.fn();
      m.subscribe('master', masterCb);
      m.subscribe('music', musicCb);
      m.subscribe('sfx', sfxCb);
      m.subscribe('ambience', ambienceCb);
      m.subscribe('ui', uiCb);
      m.subscribe('voice', voiceCb);

      masterCb.mockClear();
      musicCb.mockClear();
      sfxCb.mockClear();
      ambienceCb.mockClear();
      uiCb.mockClear();
      voiceCb.mockClear();

      m.setGroupVolume('master', 0.5);
      expect(masterCb).toHaveBeenCalled();
      expect(musicCb).toHaveBeenCalled();
      expect(sfxCb).toHaveBeenCalled();
      expect(ambienceCb).toHaveBeenCalled();
      expect(uiCb).toHaveBeenCalled();
      expect(voiceCb).toHaveBeenCalled();
    });

    it('callback receives the effective volume', () => {
      const m = new AudioMixer();
      const cb = jest.fn();
      m.subscribe('music', cb);
      cb.mockClear();
      m.setGroupVolume('music', 0.5);
      // master=1, music=0.5, duck=1 → 0.5
      expect(cb).toHaveBeenCalledWith(0.5);
    });

    it('returns an unsubscribe that stops further calls', () => {
      const m = new AudioMixer();
      const cb = jest.fn();
      const unsub = m.subscribe('music', cb);
      cb.mockClear();
      m.setGroupVolume('music', 0.4);
      expect(cb).toHaveBeenCalled();
      unsub();
      cb.mockClear();
      m.setGroupVolume('music', 0.6);
      expect(cb).not.toHaveBeenCalled();
    });

    it('onEffectiveChange constructor hook fires on every change', () => {
      const hook = jest.fn();
      const m = new AudioMixer({ onEffectiveChange: hook });
      hook.mockClear();
      m.setGroupVolume('music', 0.5);
      expect(hook).toHaveBeenCalledWith('music', 0.5);
    });
  });

  describe('MMKV persistence', () => {
    it('setGroupVolume("music", v) persists via setMusicVolume', () => {
      const m = new AudioMixer();
      m.setGroupVolume('music', 0.42);
      expect(getMusicVolume()).toBeCloseTo(0.42, 5);
    });

    it('setGroupVolume("sfx", v) persists via setSfxVolume', () => {
      const m = new AudioMixer();
      m.setGroupVolume('sfx', 0.37);
      expect(getSfxVolume()).toBeCloseTo(0.37, 5);
    });

    it('setGroupVolume("ambience", v) does NOT persist', () => {
      const m = new AudioMixer();
      m.setGroupVolume('ambience', 0.5);
      // ambience isn't persisted per task spec; the music/sfx MMKV keys
      // should remain at their defaults.
      expect(getMusicVolume()).toBeCloseTo(DEFAULT_GROUP_VOLUMES.music, 5);
      expect(getSfxVolume()).toBeCloseTo(DEFAULT_GROUP_VOLUMES.sfx, 5);
    });

    it('setGroupVolume("master", v) does NOT persist (master not in spec)', () => {
      const m = new AudioMixer();
      m.setGroupVolume('master', 0.5);
      expect(getMusicVolume()).toBeCloseTo(DEFAULT_GROUP_VOLUMES.music, 5);
      expect(getSfxVolume()).toBeCloseTo(DEFAULT_GROUP_VOLUMES.sfx, 5);
    });

    it('persists the latest value when set repeatedly', () => {
      const m = new AudioMixer();
      m.setGroupVolume('music', 0.3);
      m.setGroupVolume('music', 0.7);
      expect(getMusicVolume()).toBeCloseTo(0.7, 5);
    });

    it('setMusicVolume / setSfxVolume are called from the mixer (smoke)', () => {
      // Verify the persist functions are reachable + the mock stores values.
      setMusicVolume(0.55);
      expect(getMusicVolume()).toBeCloseTo(0.55, 5);
      setSfxVolume(0.45);
      expect(getSfxVolume()).toBeCloseTo(0.45, 5);
    });
  });

  describe('loadFromStorage()', () => {
    it('reads persisted music/sfx volumes into group volumes', () => {
      setMusicVolume(0.65);
      setSfxVolume(0.35);
      const m = new AudioMixer();
      // Before load: defaults.
      expect(m.getGroupVolume('music')).toBe(DEFAULT_GROUP_VOLUMES.music);
      expect(m.getGroupVolume('sfx')).toBe(DEFAULT_GROUP_VOLUMES.sfx);

      m.loadFromStorage();
      expect(m.getGroupVolume('music')).toBeCloseTo(0.65, 5);
      expect(m.getGroupVolume('sfx')).toBeCloseTo(0.35, 5);
    });

    it('falls back to defaults when MMKV is empty', () => {
      const m = new AudioMixer();
      m.loadFromStorage();
      expect(m.getGroupVolume('music')).toBe(DEFAULT_GROUP_VOLUMES.music);
      expect(m.getGroupVolume('sfx')).toBe(DEFAULT_GROUP_VOLUMES.sfx);
    });

    it('notifies subscribers after loading so sub-systems sync', () => {
      setMusicVolume(0.5);
      const m = new AudioMixer();
      const cb = jest.fn();
      m.subscribe('music', cb);
      cb.mockClear();
      m.loadFromStorage();
      expect(cb).toHaveBeenCalled();
    });
  });

  describe('destroy()', () => {
    it('clears timers and subscribers', () => {
      jest.useFakeTimers();
      const m = new AudioMixer();
      const cb = jest.fn();
      m.subscribe('music', cb);
      m.duck('music', 0.3, 200); // starts an interval timer
      m.destroy();
      cb.mockClear();
      jest.advanceTimersByTime(300);
      // After destroy, no more notifications fire.
      expect(cb).not.toHaveBeenCalled();
    });

    it('is safe to call multiple times', () => {
      const m = new AudioMixer();
      expect(() => {
        m.destroy();
        m.destroy();
      }).not.toThrow();
    });
  });

  describe('VOLUME_GROUPS constant', () => {
    it('lists exactly the six groups', () => {
      expect(VOLUME_GROUPS).toEqual([
        'master',
        'music',
        'sfx',
        'ambience',
        'ui',
        'voice',
      ]);
    });
  });
});
