/**
 * i18n coverage tests (spec 10 §10).
 *
 * Verifies:
 *   - Every key path in `en/<ns>.json` exists in `ar/<ns>.json` (no missing
 *     translations) and vice versa (no orphan keys). Deep key-set comparison.
 *   - Every locale in `availableLocales` has a non-empty file for every
 *     namespace in `NAMESPACES`.
 *   - The exported `availableLocales` / `defaultLocale` / `NAMESPACES`
 *     constants match the spec'd MVP set (en, ar / en / common+ui+acts+tutorial).
 *
 * This runs in CI and blocks release if any Arabic key is missing (spec 10 §10).
 *
 * Mocks: `react-native-mmkv` (so the @/i18n import doesn't crash without a
 * native module) and `react-native-localize` (its native TurboModule
 * invariants on import; the spec'd Jest mock helper is unavailable in this
 * repo's setup, so we provide a minimal in-memory mock here).
 */

// ---------------------------------------------------------------------------
// Mocks — must run before any import of @/i18n (jest hoists these calls).
// ---------------------------------------------------------------------------

jest.mock('react-native-mmkv', () => {
  // Mirror the surface used by src/platform/storage/mmkv.ts so that
  // importing @/i18n does not crash. Tests don't read/write locale here.
  const store = new Map<string, boolean | string | number>();
  return {
    MMKV: class {
      set(k: string, v: boolean | string | number): void {
        store.set(k, v);
      }
      getBoolean(k: string): boolean | undefined {
        const v = store.get(k);
        return typeof v === 'boolean' ? v : undefined;
      }
      getString(k: string): string | undefined {
        const v = store.get(k);
        return typeof v === 'string' ? v : undefined;
      }
      getNumber(k: string): number | undefined {
        const v = store.get(k);
        return typeof v === 'number' ? v : undefined;
      }
      contains(k: string): boolean {
        return store.has(k);
      }
      delete(k: string): void {
        store.delete(k);
      }
      getAllKeys(): string[] {
        return Array.from(store.keys());
      }
      clearAll(): void {
        store.clear();
      }
    },
  };
});

jest.mock('react-native-localize', () => {
  // Provide the two functions src/platform/locale/locale.ts actually uses.
  // Returning a stable device locale of 'en' is fine — the coverage tests
  // never inspect the resolved locale.
  const locale = {
    languageCode: 'en',
    languageTag: 'en-US',
    countryCode: 'US',
    isRTL: false,
  };
  return {
    getLocales: () => [locale],
    findBestLanguageTag: () => ({ languageTag: 'en', isRTL: false }),
  };
});

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { availableLocales, defaultLocale, NAMESPACES } from '@/i18n';
import enCommon from '@/i18n/locales/en/common.json';
import enUi from '@/i18n/locales/en/ui.json';
import enActs from '@/i18n/locales/en/acts.json';
import enTutorial from '@/i18n/locales/en/tutorial.json';
import arCommon from '@/i18n/locales/ar/common.json';
import arUi from '@/i18n/locales/ar/ui.json';
import arActs from '@/i18n/locales/ar/acts.json';
import arTutorial from '@/i18n/locales/ar/tutorial.json';

// ---------------------------------------------------------------------------
// Static resource registry — keyed by locale then namespace.
// ---------------------------------------------------------------------------

const EN_RESOURCES: Record<string, Record<string, unknown>> = {
  common: enCommon as Record<string, unknown>,
  ui: enUi as Record<string, unknown>,
  acts: enActs as Record<string, unknown>,
  tutorial: enTutorial as Record<string, unknown>,
};

const AR_RESOURCES: Record<string, Record<string, unknown>> = {
  common: arCommon as Record<string, unknown>,
  ui: arUi as Record<string, unknown>,
  acts: arActs as Record<string, unknown>,
  tutorial: arTutorial as Record<string, unknown>,
};

/**
 * Collect every leaf path (a.b.c where the value at `a.b.c` is a primitive,
 * not an object) from a translation JSON tree. Used to deep-compare key
 * sets between English and Arabic.
 *
 * Arrays are treated as leaves at their indexed positions
 * (e.g., `arr.0`, `arr.1`) — currently none of our translations use
 * arrays, but the code handles them defensively.
 */
function collectLeafPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') {
    return [];
  }
  if (Array.isArray(obj)) {
    return obj.map((_, i) => (prefix ? `${prefix}.${i}` : String(i)));
  }
  const out: string[] = [];
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const v = (obj as Record<string, unknown>)[k]!;
    if (v !== null && typeof v === 'object') {
      out.push(...collectLeafPaths(v, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('i18n — exported constants', () => {
  it('availableLocales matches the spec MVP set (en, ar)', () => {
    expect([...availableLocales]).toEqual(['en', 'ar']);
  });

  it('defaultLocale is "en"', () => {
    expect(defaultLocale).toBe('en');
  });

  it('NAMESPACES covers common, ui, acts, tutorial', () => {
    expect([...NAMESPACES]).toEqual(['common', 'ui', 'acts', 'tutorial']);
  });
});

describe('i18n — locale/namespace file coverage', () => {
  it.each([...availableLocales])(
    'locale "%s" has a non-empty file for every namespace',
    (locale) => {
      const registry =
        locale === 'en' ? EN_RESOURCES : locale === 'ar' ? AR_RESOURCES : null;
      expect(registry).not.toBeNull();
      for (const ns of NAMESPACES) {
        const file = registry![ns]!;
        expect(file).toBeDefined();
        expect(Object.keys(file).length).toBeGreaterThan(0);
      }
    },
  );
});

describe('i18n — Arabic mirrors every English key (deep)', () => {
  it.each([...NAMESPACES])(
    'namespace "%s" — every EN key exists in AR (no missing translations)',
    (ns) => {
      const en = EN_RESOURCES[ns]!;
      const ar = AR_RESOURCES[ns]!;
      const enKeys = new Set(collectLeafPaths(en));
      const arKeys = new Set(collectLeafPaths(ar));

      expect(enKeys.size).toBeGreaterThan(0);
      expect(arKeys.size).toBeGreaterThan(0);

      const missing = [...enKeys].filter((k) => !arKeys.has(k));
      expect(missing).toEqual([]);
    },
  );

  it.each([...NAMESPACES])(
    'namespace "%s" — AR has no orphan keys not present in EN',
    (ns) => {
      const en = EN_RESOURCES[ns]!;
      const ar = AR_RESOURCES[ns]!;
      const enKeys = new Set(collectLeafPaths(en));
      const arKeys = new Set(collectLeafPaths(ar));

      const extra = [...arKeys].filter((k) => !enKeys.has(k));
      expect(extra).toEqual([]);
    },
  );

  it.each([...NAMESPACES])(
    'namespace "%s" — AR key count equals EN key count',
    (ns) => {
      const en = EN_RESOURCES[ns]!;
      const ar = AR_RESOURCES[ns]!;
      expect(collectLeafPaths(en).length).toBe(collectLeafPaths(ar).length);
    },
  );
});

describe('i18n — interpolation placeholders are mirrored', () => {
  /**
   * For every EN value with a `{{x}}` placeholder, the AR value at the same
   * key must contain the same set of placeholder names — otherwise the
   * rendered string in Arabic would leak `undefined` or omit a variable
   * (spec 10 §3.2).
   */
  function collectPlaceholders(value: string): string[] {
    const re = /\{\{\s*([\w]+)\s*\}\}/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) {
      out.push(m[1]!);
    }
    return out.sort();
  }

  function walkLeaves(
    obj: unknown,
    prefix: string,
    visit: (path: string, value: string) => void,
  ): void {
    if (obj === null || typeof obj !== 'object') {
      if (typeof obj === 'string') {
        visit(prefix, obj);
      }
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => walkLeaves(v, prefix ? `${prefix}.${i}` : String(i), visit));
      return;
    }
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      walkLeaves((obj as Record<string, unknown>)[k]!, path, visit);
    }
  }

  it.each([...NAMESPACES])(
    'namespace "%s" — every EN placeholder appears in the AR counterpart',
    (ns) => {
      const en = EN_RESOURCES[ns]!;
      const ar = AR_RESOURCES[ns]!;

      walkLeaves(en, '', (path, enValue) => {
        const enPlaceholders = collectPlaceholders(enValue);
        if (enPlaceholders.length === 0) {
          return; // nothing to check
        }
        // Resolve the AR value at the same dotted path.
        const segments = path.split('.');
        let cursor: unknown = ar;
        for (const seg of segments) {
          if (cursor && typeof cursor === 'object' && !Array.isArray(cursor)) {
            cursor = (cursor as Record<string, unknown>)[seg];
          } else {
            cursor = undefined;
            break;
          }
        }
        expect(typeof cursor).toBe('string');
        const arValue = cursor as string;
        const arPlaceholders = collectPlaceholders(arValue);
        expect(arPlaceholders).toEqual(enPlaceholders);
      });
    },
  );
});
