/**
 * i18next initialization + locale detection for the Olympian game.
 *
 * Spec reference: 10 §2.1 (i18next configuration), 02 §3 (Layer 2: i18n).
 *
 * Locale priority on app start:
 *   1. Persisted locale (MMKV `settings.locale` key, set by the player)
 *   2. Device locale (`react-native-localize.findBestLanguageTag`)
 *   3. `'en'` fallback (spec default)
 *
 * All translation JSONs are bundled at build time via `require()`/`import`
 * (synchronous, no runtime fetching). Total bundle size is ~150 KB across
 * 4 namespaces × 2 locales — well within budget (spec 10 §9).
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { getLocale, setLocale } from '@/platform/storage/mmkv';
import { getDeviceLocale, isRTL } from '@/platform/locale/locale';
import { logger } from '@/shared/log';

// Translation JSON bundles — bundled at build time (no runtime fetch).
import enCommon from './locales/en/common.json';
import enUi from './locales/en/ui.json';
import enActs from './locales/en/acts.json';
import enTutorial from './locales/en/tutorial.json';
import arCommon from './locales/ar/common.json';
import arUi from './locales/ar/ui.json';
import arActs from './locales/ar/acts.json';
import arTutorial from './locales/ar/tutorial.json';

/**
 * Locales the game ships translations for at MVP. ES and DE are deferred
 * to Phase 4 (spec 10 §1).
 */
export const availableLocales = ['en', 'ar'] as const;
export type Locale = (typeof availableLocales)[number];

/**
 * Fallback locale used when a key or locale is missing. Spec 10 §2.1.
 */
export const defaultLocale: Locale = 'en';

/**
 * Translation namespaces loaded at app start. Spec 10 §1.
 *
 * (items/dialogues are deferred to P1.E5.T9 / later phases — out of scope
 * for the i18n layer itself.)
 */
export const NAMESPACES = ['common', 'ui', 'acts', 'tutorial'] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** Translation resource bundles keyed by locale then namespace. */
export const resources = {
  en: {
    common: enCommon,
    ui: enUi,
    acts: enActs,
    tutorial: enTutorial,
  },
  ar: {
    common: arCommon,
    ui: arUi,
    acts: arActs,
    tutorial: arTutorial,
  },
} as const;

/** Re-export of the platform RTL helper for callers that import via `@/i18n`. */
export { isRTL };

/**
 * Resolve the locale to use at app start.
 *
 * Priority:
 *   1. Persisted locale (MMKV) — if it's in `availableLocales`
 *   2. Device locale — if it's in `availableLocales`
 *   3. `defaultLocale` ('en')
 *
 * Every accessor is wrapped in try/catch so a missing MMKV or a misbehaving
 * react-native-localize never crashes the app — we always fall back to 'en'.
 */
function getInitialLocale(): Locale {
  // 1. Persisted locale
  try {
    const persisted = getLocale();
    if ((availableLocales as readonly string[]).includes(persisted)) {
      return persisted as Locale;
    }
  } catch (e) {
    logger.warn('[i18n] failed to read persisted locale', e);
  }

  // 2. Device locale
  try {
    const device = getDeviceLocale();
    if ((availableLocales as readonly string[]).includes(device)) {
      return device as Locale;
    }
  } catch (e) {
    logger.warn('[i18n] failed to detect device locale', e);
  }

  // 3. Fallback
  return defaultLocale;
}

/**
 * Whether `initI18n()` has been called and the i18n instance is ready.
 * Used to guard against double-init (e.g., in Fast Refresh / HMR).
 */
let initialized = false;

/**
 * Initialize i18next synchronously (resources are already bundled) and
 * wire it to `react-i18next`. Safe to call multiple times — subsequent
 * calls are no-ops and immediately resolve.
 *
 * The caller (typically `App.tsx` or the providers layer) should `await`
 * this before rendering any translated UI:
 *
 * ```ts
 * useEffect(() => { void initI18n(); }, []);
 * ```
 *
 * @returns A Promise that resolves once i18next is ready (or rejects on init error).
 */
export function initI18n(): Promise<void> {
  if (initialized) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    i18n
      .use(initReactI18next)
      .init(
        {
          resources,
          lng: getInitialLocale(),
          fallbackLng: defaultLocale,
          supportedLngs: [...availableLocales],
          ns: [...NAMESPACES],
          defaultNS: 'common',
          // RN handles escaping — disable i18next's HTML-entity escaping.
          interpolation: { escapeValue: false },
          // Return the key (not null/empty) when a translation is missing —
          // makes bugs visually obvious without crashing.
          returnNull: false,
          returnEmptyString: false,
          react: {
            useSuspense: false, // we don't use React suspense for translations
          },
        },
        (err: unknown) => {
          if (err) {
            logger.error('[i18n] init failed', err);
            reject(err);
            return;
          }
          initialized = true;
          logger.info(
            `[i18n] initialized (lng=${i18n.language}, defaultNS=${i18n.options.defaultNS})`,
          );
          resolve();
        },
      );
  });
}

/**
 * Change the active locale at runtime and persist it to MMKV so the next
 * cold start picks it up. Callers should also call `applyRTL(locale)` to
 * keep React Native's I18nManager in sync (spec 10 §4.1).
 *
 * @param locale One of {@link availableLocales}. Unknown locales are rejected.
 * @returns A Promise that resolves once the language change is applied.
 */
export async function changeLocale(locale: Locale): Promise<void> {
  setLocale(locale);
  await i18n.changeLanguage(locale);
  logger.info(`[i18n] locale changed to "${locale}"`);
}

/**
 * The shared i18next instance. Callers should prefer the `useTranslation`
 * hook from `react-i18next` in components; this export is for non-React
 * code (services, ECS systems, error boundaries).
 */
export default i18n;
