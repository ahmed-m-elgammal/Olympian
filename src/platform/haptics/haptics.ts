/**
 * Haptics wrapper — wraps React Native's `Vibration` API.
 *
 * Spec reference: 11 §7 (haptics), 02 §3 (Layer 1: Platform).
 *
 * Uses `Vibration` from `react-native` (not `expo-haptics`, which is not
 * installed). Android supports arbitrary vibration patterns; iOS does not
 * support `Vibration.vibrate` with patterns — both platforms support a
 * single fixed buzz via `Vibration.vibrate()`. We expose a small enum of
 * intent-named helpers so callers don't have to know about platform
 * differences.
 *
 * All calls are no-ops when the user has disabled haptics via the
 * `enable_haptics` MMKV flag (spec 02 §6.2).
 */

import { Platform, Vibration } from 'react-native';

import { logger } from '@/shared/log';
import { getFlag } from '@/platform/storage/mmkv';

/** Vibration duration in ms for the "light" feedback tier. */
const LIGHT_MS = 10;
/** Vibration duration in ms for the "medium" feedback tier. */
const MEDIUM_MS = 20;
/** Vibration duration in ms for the "heavy" feedback tier. */
const HEAVY_MS = 40;

/**
 * Fire a light haptic — used for subtle UI feedback (hover, focus).
 * No-op when `enable_haptics` is false.
 */
export function hapticLight(): void {
  buzz(LIGHT_MS);
}

/**
 * Fire a medium haptic — used for button presses, list item selection.
 * No-op when `enable_haptics` is false.
 */
export function hapticMedium(): void {
  buzz(MEDIUM_MS);
}

/**
 * Fire a heavy haptic — used for impactful events (boss hit, screen shake).
 * No-op when `enable_haptics` is false.
 */
export function hapticHeavy(): void {
  buzz(HEAVY_MS);
}

/**
 * Fire a "success" pattern — two short pulses. Used for puzzle-solved,
 * level-cleared, item-acquired.
 * No-op when `enable_haptics` is false.
 */
export function hapticSuccess(): void {
  if (!isEnabled()) return;
  // [vibrate, pause, vibrate]
  const pattern: number[] = [0, LIGHT_MS, 60, MEDIUM_MS];
  buzzPattern(pattern);
}

/**
 * Fire an "error" pattern — one long pulse. Used for invalid actions,
 * combat damage taken, failed puzzle attempt.
 * No-op when `enable_haptics` is false.
 */
export function hapticError(): void {
  if (!isEnabled()) return;
  const pattern: number[] = [0, HEAVY_MS, 80, HEAVY_MS];
  buzzPattern(pattern);
}

/**
 * Fire a "selection" tick — the shortest possible pulse. Used for
 * picker/segmented-control selection changes.
 * No-op when `enable_haptics` is false.
 */
export function hapticSelection(): void {
  buzz(LIGHT_MS);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function isEnabled(): boolean {
  return getFlag('enable_haptics');
}

function buzz(durationMs: number): void {
  if (!isEnabled()) return;
  try {
    // On iOS, `Vibration.vibrate(duration)` is a no-op (the native module
    // does not support a duration argument and falls back to a default
    // ~400ms buzz). We only call it on Android; on iOS we still call
    // vibrate() to get any feedback at all.
    if (Platform.OS === 'android') {
      Vibration.vibrate(durationMs);
    } else {
      Vibration.vibrate();
    }
  } catch (e) {
    logger.warn('[haptics] vibrate failed', e);
  }
}

function buzzPattern(pattern: number[]): void {
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(pattern, false);
    } else {
      // iOS doesn't support patterns; fall back to a single buzz.
      Vibration.vibrate();
    }
  } catch (e) {
    logger.warn('[haptics] pattern vibrate failed', e);
  }
}
