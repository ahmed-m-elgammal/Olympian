/**
 * Apply RTL (right-to-left) layout configuration to React Native's
 * `I18nManager` based on the active locale.
 *
 * Spec reference: 10 §4.1 (RTL Activation), 02 §3 (Layer 2: i18n).
 *
 * React Native's `I18nManager.forceRTL()` controls the entire app's
 * layout direction (flexbox row reversal, text alignment defaults,
 * icon mirroring via `swapLeftAndRightInRTL`). Changes take effect on
 * the next app restart — the caller is responsible for telling the user
 * "Restarting to apply changes" and re-launching the app (spec 10 §4.1).
 *
 * Usage (from the locale picker or settings screen):
 *
 * ```ts
 * import { applyRTL } from '@/i18n/applyRTL';
 * import { changeLocale } from '@/i18n';
 *
 * await changeLocale('ar');
 * applyRTL('ar');
 * // then trigger an app reload (e.g., React Native's Restart package)
 * ```
 */

import { I18nManager } from 'react-native';

import { isRTL } from '@/platform/locale/locale';
import { logger } from '@/shared/log';

/**
 * Force React Native into RTL or LTR mode based on the given locale.
 *
 * Calls `I18nManager.forceRTL(rtl)` and
 * `I18nManager.swapLeftAndRightInRTL(rtl)` — the latter flips
 * left/right style props and icon transforms in RTL layouts (spec 10 §4.2).
 *
 * Wrapped in try/catch: in some test/headless environments I18nManager
 * may not be available; the function degrades gracefully and logs a warning.
 *
 * @param locale A BCP-47 language tag or 2-letter code (e.g., `"ar"`,
 *   `"ar-SA"`, `"en"`). Only the language component is consulted.
 */
export function applyRTL(locale: string): void {
  const rtl = isRTL(locale);
  try {
    I18nManager.forceRTL(rtl);
    I18nManager.swapLeftAndRightInRTL(rtl);
    logger.info(`[i18n] applyRTL: locale="${locale}", rtl=${rtl}`);
  } catch (e) {
    logger.warn(`[i18n] applyRTL failed for locale "${locale}"`, e);
  }
}
