/**
 * scripts/i18n-coverage.ts
 * Translation coverage analyzer per spec 10 §10 (task P1.E5.T8).
 *
 * For every namespace in `src/i18n/locales/`, verifies that:
 *   - every EN key exists in AR and vice versa (no missing / orphan keys),
 *   - no EN value is empty (AR stubs may hold EN text at MVP but EN must
 *     be the canonical table),
 *   - all four namespaces (common, ui, acts, tutorial) exist for both
 *     locales.
 *
 * Exits non-zero with a report when any check fails.
 *
 * Usage: npm run i18n:coverage
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const NAMESPACES = ['common', 'ui', 'acts', 'tutorial'] as const;
const LOCALES = ['en', 'ar'] as const;

type Json = { [key: string]: Json | string };

/** Flatten nested JSON into "a.b.c" → value map. */
function flatten(obj: Json, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const keyPath = prefix === '' ? k : `${prefix}.${k}`;
    if (v !== null && typeof v === 'object') {
      for (const [kk, vv] of flatten(v as Json, keyPath)) {
        out.set(kk, vv);
      }
    } else {
      out.set(keyPath, String(v));
    }
  }
  return out;
}

function main(): void {
  console.log('[i18n-coverage] Checking translation coverage for locales...');
  const errors: string[] = [];

  const flat: Record<string, Record<string, Map<string, string>>> = {};
  for (const locale of LOCALES) {
    flat[locale] = {};
    for (const ns of NAMESPACES) {
      const file = path.join(LOCALES_DIR, locale, `${ns}.json`);
      if (!fs.existsSync(file)) {
        errors.push(`${locale}/${ns}.json is missing (spec 10 §10 requires all namespaces)`);
        continue;
      }
      let parsed: Json;
      try {
        parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Json;
      } catch (e) {
        errors.push(`${locale}/${ns}.json is not valid JSON — ${String(e)}`);
        continue;
      }
      flat[locale]![ns] = flatten(parsed);
    }
  }

  for (const ns of NAMESPACES) {
    const en = flat.en?.[ns];
    const ar = flat.ar?.[ns];
    if (!en || !ar) continue; // already reported as missing above

    let missingInAr = 0;
    let orphanInAr = 0;
    let emptyEn = 0;

    for (const [key, value] of en) {
      if (!ar.has(key)) {
        missingInAr++;
        errors.push(`${ns}: key "${key}" exists in EN but not in AR`);
      }
      if (value === '') {
        emptyEn++;
        errors.push(`${ns}: EN value for "${key}" is empty`);
      }
    }
    for (const key of ar.keys()) {
      if (!en.has(key)) {
        orphanInAr++;
        errors.push(`${ns}: key "${key}" exists in AR but not in EN (orphan)`);
      }
    }

    console.log(
      `  ${ns}: en=${en.size} keys, ar=${ar.size} keys, missingInAr=${missingInAr}, ` +
        `orphanInAr=${orphanInAr}, emptyEn=${emptyEn}`,
    );
  }

  if (errors.length > 0) {
    console.error(`[i18n-coverage] FAILED with ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log('[i18n-coverage] Translation coverage check passed. Exit 0.');
}

main();
