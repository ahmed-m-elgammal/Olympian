/**
 * Device locale detection — bridges `react-native-localize` to the
 * game's supported-locale list.
 *
 * Spec reference: 10 §2.1 (locale detection), 02 §3 (Layer 1: Platform).
 *
 * Supported locales at MVP: `en`, `ar` (Arabic — full RTL).
 */

import { getLocales, findBestLanguageTag, type Locale } from 'react-native-localize';

import { logger } from '@/shared/log';

/** Locales the game ships translations for. */
export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Languages whose text direction is right-to-left. */
const RTL_LANGUAGES = new Set<string>(['ar', 'he', 'fa', 'ur', 'yi']);

/**
 * Detect the device's preferred locale and map it to one of the supported
 * locales. Returns the BCP-47 language code (lower-case) if the device
 * language is supported; otherwise falls back to 'en' (spec default).
 *
 * Example mappings:
 *   device "en-US" → "en"
 *   device "ar-SA" → "ar"
 *   device "fr-FR" → "en"  (not supported at MVP)
 */
export function getDeviceLocale(): SupportedLocale {
  try {
    const match = findBestLanguageTag(SUPPORTED_LOCALES);
    if (match?.languageTag) {
      return match.languageTag as SupportedLocale;
    }
  } catch (e) {
    logger.warn('[locale] findBestLanguageTag failed', e);
  }

  // Fallback: inspect the first locale from getLocales() and check the
  // language code directly. This protects against react-native-localize
  // behaving oddly in some test/headless environments.
  try {
    const locales = getLocales();
    if (locales.length > 0) {
      const lang = locales[0]!.languageCode.toLowerCase();
      if ((SUPPORTED_LOCALES as readonly string[]).includes(lang)) {
        return lang as SupportedLocale;
      }
    }
  } catch (e) {
    logger.warn('[locale] getLocales failed', e);
  }

  return 'en';
}

/**
 * Return the full list of preferred locales from the device, in priority
 * order. Useful for "next-up" translation suggestions or analytics.
 */
export function getDeviceLocales(): Locale[] {
  try {
    return getLocales();
  } catch (e) {
    logger.warn('[locale] getLocales failed, returning empty array', e);
    return [];
  }
}

/**
 * True if the given locale code maps to an RTL language.
 *
 * Accepts both 2-letter language codes ("ar") and full BCP-47 tags
 * ("ar-SA"). The check is on the language component only.
 *
 * Returns `false` for falsy input (undefined / empty string) so callers
 * don't need to guard against pre-init i18next state where `i18n.language`
 * is not yet set.
 */
export function isRTL(locale: string | undefined | null): boolean {
  if (!locale || typeof locale !== 'string') {
    return false;
  }
  const lang = locale.toLowerCase().split('-')[0]!;
  return RTL_LANGUAGES.has(lang);
}

/** Return the list of locale codes the game ships translations for. */
export function getSupportedLocales(): readonly SupportedLocale[] {
  return SUPPORTED_LOCALES;
}
