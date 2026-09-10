/**
 * Tests for the MMKV typed accessors (spec 02 §6.2, spec 03 §1).
 *
 * Verifies:
 *   - Read/write round-trips for booleans, strings, and numbers.
 *   - Missing keys return the provided default.
 *   - Typed accessors for locale, audio volumes, and IAP ownership.
 *   - Feature flags use the spec-defined defaults when unset.
 *
 * We mock `react-native-mmkv` with an in-memory implementation that
 * mirrors the real `MMKV` class's surface area. This lets us test the
 * typed accessor layer without a native module.
 */

import {
  addOwnedIapId,
  getActiveSaveId,
  getFlag,
  getLocale,
  getMusicVolume,
  getOwnedIapIds,
  getSfxVolume,
  isIapOwned,
  setFlag,
  setLocale,
  setMusicVolume,
  setActiveSaveId,
  setOwnedIapIds,
  setSfxVolume,
  FLAG_DEFAULTS,
  SUPPORTED_LOCALES,
} from '@/platform/storage/mmkv';

// ---------------------------------------------------------------------------
// In-memory MMKV mock
//
// The mock module is created inside jest.mock's factory so the singleton
// instance exists *before* `mmkv.ts` (which calls `new MMKV()`) is loaded.
// The constructor of the mock class returns this singleton, so every
// `new MMKV()` call resolves to the same in-memory instance — both in
// the production code and in tests.
// ---------------------------------------------------------------------------

/** Shape of the mock MMKV instance (re-exported via globalThis). */
export interface InMemoryMMKV {
  set(key: string, value: boolean | string | number): void;
  getBoolean(key: string): boolean | undefined;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  contains(key: string): boolean;
  delete(key: string): void;
  getAllKeys(): string[];
  clearAll(): void;
}

jest.mock('react-native-mmkv', () => {
  // Map-based store. Defined entirely inside the factory so jest's
  // out-of-scope-variable guard doesn't trip on a class identifier.
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
        // Every `new MMKV()` returns the singleton instance.
        return instance;
      }
    },
  };
});

/** Helper: get the mock singleton for state inspection / reset. */
function getMockMmkv(): InMemoryMMKV {
  return (globalThis as unknown as { __mockMmkv: InMemoryMMKV }).__mockMmkv;
}

// Reset state between tests.
beforeEach(() => {
  getMockMmkv().clearAll();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MMKV typed accessors (spec 02 §6.2, spec 03 §1)', () => {
  describe('feature flags', () => {
    it('returns the spec-defined default for an unset flag', () => {
      expect(getFlag('show_paywall_button')).toBe(
        FLAG_DEFAULTS.show_paywall_button,
      );
      expect(getFlag('enable_haptics')).toBe(FLAG_DEFAULTS.enable_haptics);
      expect(getFlag('show_analytics')).toBe(false); // spec default false
      expect(getFlag('debug_overlay')).toBe(false); // spec default false
    });

    it('round-trips a written flag', () => {
      setFlag('enable_haptics', false);
      expect(getFlag('enable_haptics')).toBe(false);
      setFlag('enable_haptics', true);
      expect(getFlag('enable_haptics')).toBe(true);
    });

    it('respects an explicit default override', () => {
      // Even if the spec default is true, a caller can pass a different
      // fallback for keys it doesn't know the default for.
      expect(getFlag('debug_overlay', true)).toBe(true);
    });
  });

  describe('locale', () => {
    it('returns "en" by default', () => {
      expect(getLocale()).toBe('en');
    });

    it('round-trips a written locale', () => {
      setLocale('ar');
      expect(getLocale()).toBe('ar');
    });

    it('falls back to "en" if the stored value is not a supported locale', () => {
      // Write a bogus locale directly via the underlying instance.
      getMockMmkv().set('settings.locale', 'klingon');
      expect(getLocale()).toBe('en');
    });

    it('SUPPORTED_LOCALES includes both en and ar', () => {
      expect(SUPPORTED_LOCALES).toContain('en');
      expect(SUPPORTED_LOCALES).toContain('ar');
    });
  });

  describe('audio volumes', () => {
    it('returns the spec default (0.8 / 1.0) for unset volumes', () => {
      expect(getMusicVolume()).toBe(0.8);
      expect(getSfxVolume()).toBe(1.0);
    });

    it('round-trips volumes', () => {
      setMusicVolume(0.5);
      expect(getMusicVolume()).toBe(0.5);
      setSfxVolume(0.25);
      expect(getSfxVolume()).toBe(0.25);
    });

    it('clamps out-of-range volumes on write', () => {
      setMusicVolume(2.0);
      expect(getMusicVolume()).toBe(1.0);
      setMusicVolume(-1.0);
      expect(getMusicVolume()).toBe(0);
    });

    it('respects an explicit default override', () => {
      expect(getMusicVolume(0.3)).toBe(0.3);
      expect(getSfxVolume(0.7)).toBe(0.7);
    });

    it('returns default for NaN or out-of-range stored values', () => {
      getMockMmkv().set('settings.audio.music_volume', NaN);
      expect(getMusicVolume(0.9)).toBe(0.9);
      getMockMmkv().set('settings.audio.sfx_volume', 5);
      expect(getSfxVolume(0.4)).toBe(0.4);
    });
  });

  describe('active save id', () => {
    it('returns null when no active save is set', () => {
      expect(getActiveSaveId()).toBeNull();
    });

    it('round-trips an active save id', () => {
      setActiveSaveId('slot_1');
      expect(getActiveSaveId()).toBe('slot_1');
    });

    it('clears the active save when set to null', () => {
      setActiveSaveId('slot_2');
      expect(getActiveSaveId()).toBe('slot_2');
      setActiveSaveId(null);
      expect(getActiveSaveId()).toBeNull();
    });
  });

  describe('IAP ownership', () => {
    it('starts empty', () => {
      expect(getOwnedIapIds()).toEqual([]);
      expect(isIapOwned('olympian_premium_unlock')).toBe(false);
    });

    it('marks and reads a single product as owned', () => {
      addOwnedIapId('olympian_premium_unlock');
      expect(isIapOwned('olympian_premium_unlock')).toBe(true);
      expect(getOwnedIapIds()).toEqual(['olympian_premium_unlock']);
    });

    it('addOwnedIapId is idempotent', () => {
      addOwnedIapId('olympian_premium_unlock');
      addOwnedIapId('olympian_premium_unlock');
      expect(getOwnedIapIds()).toEqual(['olympian_premium_unlock']);
    });

    it('setOwnedIapIds replaces the list', () => {
      addOwnedIapId('a');
      setOwnedIapIds(['b', 'c']);
      expect(getOwnedIapIds().sort()).toEqual(['b', 'c']);
    });

    it('survives a corrupted JSON payload in storage', () => {
      // Simulate a corrupt blob (manual write).
      getMockMmkv().set('iap_owned_ids', 'this is not json');
      expect(getOwnedIapIds()).toEqual([]);
      expect(isIapOwned('anything')).toBe(false);
    });

    it('survives a non-array JSON payload', () => {
      getMockMmkv().set('iap_owned_ids', JSON.stringify({ not: 'array' }));
      expect(getOwnedIapIds()).toEqual([]);
    });
  });

  describe('missing-key semantics (spec 03 §1)', () => {
    it('getBoolean returns undefined for missing key, accessor returns default', () => {
      expect(getMockMmkv().getBoolean('never_set')).toBeUndefined();
      expect(getFlag('enable_haptics')).toBe(true); // spec default
    });

    it('getNumber returns undefined for missing key, accessor returns default', () => {
      expect(getMockMmkv().getNumber('settings.audio.music_volume')).toBeUndefined();
      expect(getMusicVolume(0.42)).toBe(0.42);
    });

    it('getString returns undefined for missing key, accessor returns default', () => {
      expect(getMockMmkv().getString('settings.locale')).toBeUndefined();
      expect(getLocale()).toBe('en');
    });
  });
});
