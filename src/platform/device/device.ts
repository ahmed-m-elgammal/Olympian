/**
 * Device capability probes — screen size, refresh rate, safe-area insets.
 *
 * Spec reference: 07 §2.2 (device info), 02 §3 (Layer 1: Platform).
 *
 * These accessors wrap React Native's `Dimensions` / `PixelRatio` and
 * `react-native-safe-area-context`'s initial window metrics so non-React
 * modules (engine, render, audio) can query device info without a hook.
 */

import { Dimensions, PixelRatio, Platform } from 'react-native';

import { initialWindowMetrics } from 'react-native-safe-area-context';

import { logger } from '@/shared/log';

/** Screen dimensions in device-independent (dp) units. */
export interface ScreenSize {
  /** Screen width in dp. */
  width: number;
  /** Screen height in dp. */
  height: number;
  /** Device pixel ratio (physical px per dp). */
  scale: number;
  /** Physical pixel width (`width * scale`). */
  physicalWidth: number;
  /** Physical pixel height (`height * scale`). */
  physicalHeight: number;
}

/** Per-edge safe-area insets in dp. All zero on devices without notches. */
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Return the current screen size.
 *
 * `Dimensions.get('window')` reflects the visible app window, not the
 * full device screen — this is what the game cares about for layout.
 */
export function getScreenSize(): ScreenSize {
  const { width, height, scale } = Dimensions.get('window');
  return {
    width,
    height,
    scale,
    physicalWidth: Math.floor(width * scale),
    physicalHeight: Math.floor(height * scale),
  };
}

/**
 * Best-effort refresh-rate probe in Hz.
 *
 * React Native does not expose a stable API for display refresh rate, so
 * we fall back to a 60Hz assumption (the engine's fixed-timestep target).
 * Pro-device reports (e.g. 120Hz ProMotion) are read from native if/when
 * available; until then, the game loop's fixed-timestep (60Hz) drives
 * timing and this value is informational only.
 */
export function getRefreshRate(): number {
  // Future: read from a native module (e.g. react-native-device-info's
  // display refresh rate). For now, default to 60 — the engine's tick rate.
  return 60;
}

/**
 * Return the safe-area insets. Reads from
 * `react-native-safe-area-context`'s `initialWindowMetrics` (available
 * outside React) and falls back to zero insets if unavailable.
 *
 * Note: these are the *initial* insets measured before the first layout.
 * For accurate live insets inside React components, prefer the
 * `useSafeAreaInsets()` hook. This module-level accessor is for engine
 * / render code that needs a reasonable default before first paint.
 */
export function getSafeAreaInsets(): SafeAreaInsets {
  try {
    const metrics = initialWindowMetrics;
    if (metrics?.insets) {
      const { top, right, bottom, left } = metrics.insets;
      return { top, right, bottom, left };
    }
  } catch (e) {
    logger.warn('[device] failed to read safe-area insets', e);
  }
  return ZERO_INSETS;
}

/**
 * Convenience: the smaller screen dimension in dp. Useful for picking
 * sprite-scale breakpoints ("small screen" = min < 360dp).
 */
export function getMinScreenDimension(): number {
  const { width, height } = getScreenSize();
  return Math.min(width, height);
}

/**
 * Convenience: the device pixel ratio. Use this to decide whether to
 * load 1×, 2×, or 3× sprite assets.
 */
export function getPixelRatio(): number {
  return PixelRatio.get();
}

/**
 * Convenience: whether the device is a tablet (rough heuristic —
 * `minScreenDimension >= 600` is the Android Material tablet breakpoint).
 */
export function isTablet(): boolean {
  return getMinScreenDimension() >= 600;
}

/** Convenience: current OS. */
export function getPlatform(): 'ios' | 'android' | 'web' | 'windows' | 'macos' {
  return Platform.OS as 'ios' | 'android' | 'web' | 'windows' | 'macos';
}
