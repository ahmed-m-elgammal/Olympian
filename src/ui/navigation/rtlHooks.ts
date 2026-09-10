/**
 * RTL hooks — React hooks that subscribe to locale-driven RTL state.
 *
 * Spec reference: 10 §4 (RTL strategy), task P1.E3.T16, 05 §7 (RTL behavior).
 *
 * The hooks here are reactive counterparts to the imperative `applyRTL`
 * helper in `@/i18n/applyRTL`. They let React components re-render when the
 * active locale (and therefore RTL state) changes at runtime.
 *
 * Note: this hook does NOT call `I18nManager.forceRTL()` itself — the
 * LanguagePickerScreen does that via `applyRTL(locale)` from `@/i18n/applyRTL`
 * when the user picks a new language. This hook only reports the current
 * state so child components can react (e.g., flip icons, swap padding
 * start/end, mirror text alignment).
 */

import { useTranslation } from 'react-i18next';

import { isRTL } from '@/i18n';

/**
 * Subscribe to locale changes and return whether the active locale is RTL.
 *
 * ```tsx
 * const isRTL = useRTL();
 * // then conditionally apply mirroring / alignment / etc.
 * ```
 */
export function useRTL(): boolean {
  // `useTranslation` subscribes to i18n language changes — when the user
  // calls `changeLocale`, this hook re-runs and we recompute `isRTL`.
  const { i18n } = useTranslation();
  return isRTL(i18n.language);
}

/**
 * Subscribe to locale changes and return the current writing direction
 * string (`'ltr' | 'rtl'`). Convenience wrapper around {@link useRTL} for
 * components that need the RN `writingDirection` value directly.
 */
export function useWritingDirection(): 'ltr' | 'rtl' {
  return useRTL() ? 'rtl' : 'ltr';
}
