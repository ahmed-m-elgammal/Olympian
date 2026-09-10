/**
 * MMKV instance + typed accessors for ephemeral flags and key-value
 * settings (locale, audio volumes, feature flags).
 *
 * Spec reference: 02 §6.2 (Feature flags), 03 §1 ("MMKV holds only
 * ephemeral flags and key-value settings").
 *
 * Why MMKV: JSI-backed, synchronous, ~30× faster than AsyncStorage. Used
 * only for ephemeral/preference data — all durable game state lives in
 * SQLite. On app start, Zustand stores hydrate from MMKV and write back
 * on change.
 */

import { MMKV } from 'react-native-mmkv';

import { logger } from '@/shared/log';

/** Shared MMKV instance. Use this everywhere; do not create additional instances. */
export const mmkv = new MMKV({ id: 'olympian.default' });

// ---------------------------------------------------------------------------
// Feature flags (spec 02 §6.2)
// ---------------------------------------------------------------------------

/**
 * Known feature-flag keys. Defaults follow spec 02 §6.2.
 * Storing them here keeps the surface auditable and lets us type `getFlag`.
 */
export const FLAG_KEYS = [
  'show_paywall_button',
  'enable_haptics',
  'enable_particle_fx',
  'show_analytics',
  'debug_overlay',
] as const;

export type FlagKey = (typeof FLAG_KEYS)[number];

export const FLAG_DEFAULTS: Record<FlagKey, boolean> = {
  show_paywall_button: true,
  enable_haptics: true,
  enable_particle_fx: true,
  show_analytics: false,
  debug_overlay: false,
};

/**
 * Read a boolean feature flag from MMKV. Falls back to the spec-defined
 * default when the key is missing.
 */
export function getFlag(key: FlagKey, defaultValue?: boolean): boolean {
  const fallback = defaultValue ?? FLAG_DEFAULTS[key];
  try {
    const v = mmkv.getBoolean(key);
    return v === undefined ? fallback : v;
  } catch (e) {
    logger.warn(`[mmkv] getFlag("${key}") failed, returning default`, e);
    return fallback;
  }
}

/** Write a boolean feature flag to MMKV. */
export function setFlag(key: FlagKey, value: boolean): void {
  try {
    mmkv.set(key, value);
  } catch (e) {
    logger.warn(`[mmkv] setFlag("${key}", ${value}) failed`, e);
  }
}

// ---------------------------------------------------------------------------
// Typed settings accessors — locale, audio volumes
// ---------------------------------------------------------------------------

/** Supported locale codes (spec 10 §1.1). */
export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_KEY = 'settings.locale';
const MUSIC_VOLUME_KEY = 'settings.audio.music_volume';
const SFX_VOLUME_KEY = 'settings.audio.sfx_volume';
const ACTIVE_SAVE_KEY = 'active_save_id';
const IAP_OWNED_KEY = 'iap_owned_ids';

/** Read the active save slot id (e.g. "slot_1") from MMKV. `null` if no save is active. */
export function getActiveSaveId(): string | null {
  try {
    const v = mmkv.getString(ACTIVE_SAVE_KEY);
    return v ?? null;
  } catch {
    return null;
  }
}

/** Persist the active save slot id to MMKV. */
export function setActiveSaveId(id: string | null): void {
  try {
    if (id === null) {
      mmkv.delete(ACTIVE_SAVE_KEY);
    } else {
      mmkv.set(ACTIVE_SAVE_KEY, id);
    }
  } catch (e) {
    logger.warn(`[mmkv] setActiveSaveId(${id}) failed`, e);
  }
}

/**
 * Read the user-selected locale. Returns the default ('en') when missing
 * or when the stored value isn't one of the supported locales.
 */
export function getLocale(): SupportedLocale {
  try {
    const v = mmkv.getString(LOCALE_KEY);
    if (v && (SUPPORTED_LOCALES as readonly string[]).includes(v)) {
      return v as SupportedLocale;
    }
  } catch {
    /* fall through to default */
  }
  return 'en';
}

/** Persist the user-selected locale. Caller is responsible for validating. */
export function setLocale(locale: SupportedLocale): void {
  mmkv.set(LOCALE_KEY, locale);
}

/**
 * Read a 0..1 audio volume. Returns the provided default when missing or
 * out of range.
 */
export function getMusicVolume(defaultValue = 0.8): number {
  return readVolume(MUSIC_VOLUME_KEY, defaultValue);
}

/** Persist a 0..1 music volume. Clamps out-of-range values. */
export function setMusicVolume(value: number): void {
  mmkv.set(MUSIC_VOLUME_KEY, clamp01(value));
}

/** Read a 0..1 SFX volume. Returns the provided default when missing. */
export function getSfxVolume(defaultValue = 1.0): number {
  return readVolume(SFX_VOLUME_KEY, defaultValue);
}

/** Persist a 0..1 SFX volume. Clamps out-of-range values. */
export function setSfxVolume(value: number): void {
  mmkv.set(SFX_VOLUME_KEY, clamp01(value));
}

// ---------------------------------------------------------------------------
// IAP ownership (persisted across launches; spec 13 §4 + 02 §9)
// ---------------------------------------------------------------------------

/** Read the list of owned IAP product ids (e.g. `olympian_premium_unlock`). */
export function getOwnedIapIds(): string[] {
  try {
    const raw = mmkv.getString(IAP_OWNED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string');
  } catch {
    return [];
  }
}

/** Persist the full set of owned IAP product ids. Replaces any prior list. */
export function setOwnedIapIds(ids: readonly string[]): void {
  const unique = Array.from(new Set(ids));
  mmkv.set(IAP_OWNED_KEY, JSON.stringify(unique));
}

/** Mark a single product id as owned (idempotent). */
export function addOwnedIapId(id: string): void {
  const current = getOwnedIapIds();
  if (!current.includes(id)) {
    setOwnedIapIds([...current, id]);
  }
}

/** True if the given product id is currently marked as owned. */
export function isIapOwned(id: string): boolean {
  return getOwnedIapIds().includes(id);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readVolume(key: string, defaultValue: number): number {
  try {
    const v = mmkv.getNumber(key);
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) {
      return v;
    }
  } catch {
    /* fall through */
  }
  return defaultValue;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
