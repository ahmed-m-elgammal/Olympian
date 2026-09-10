/**
 * scripts/validate-content.ts
 * Content validation runner per spec 01 §12 (task P1.E5 AC: "seed JSON
 * validates").
 *
 * Checks the `data/seed/*.json` files for:
 *   - expected row counts (50 items / 14 enemies / 4 companions / 12 acts /
 *     2 IAP products — tasks P1.E5.T9–T13)
 *   - required fields, enums, numeric ranges, unique ids
 *   - cross-file references (enemy loot → items, act boss/relic → ids)
 *   - acts ↔ i18n parity: every act's `name_key`/`subtitle_key` must exist
 *     in BOTH the EN and AR acts.json translation files
 *
 * Exits non-zero with a report if anything fails.
 *
 * Usage: npm run content:validate
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { loadSeedData, seedDir, validateSeedData } from './seed-data';

function loadI18nActs(locale: 'en' | 'ar'): Map<string, string> {
  const file = path.join(
    seedDir(),
    '..',
    '..',
    'src',
    'i18n',
    'locales',
    locale,
    'acts.json',
  );
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
    string,
    Record<string, string>
  >;
  const map = new Map<string, string>();
  for (const [actKey, fields] of Object.entries(raw)) {
    for (const [field, value] of Object.entries(fields)) {
      map.set(`${actKey}.${field}`, value);
    }
  }
  return map;
}

function main(): void {
  console.log('[validate-content] Validating level data and JSON schemas...');

  const data = loadSeedData();
  const errors = validateSeedData(data);

  // Cross-check act name/subtitle keys against BOTH locales (spec 10 §10).
  let enActs: Map<string, string> | null = null;
  try {
    enActs = loadI18nActs('en');
  } catch (e) {
    errors.push(`i18n: failed to read en/acts.json — ${String(e)}`);
  }
  let arActs: Map<string, string> | null = null;
  try {
    arActs = loadI18nActs('ar');
  } catch (e) {
    errors.push(`i18n: failed to read ar/acts.json — ${String(e)}`);
  }

  if (enActs && arActs) {
    for (const act of data.acts) {
      const nameShort = act.name_key.replace(/^acts:/, '');
      const subtitleShort = act.subtitle_key.replace(/^acts:/, '');
      for (const key of [nameShort, subtitleShort]) {
        if (!enActs.has(key)) {
          errors.push(`acts.json: act ${act.act_number} key "${key}" missing in en/acts.json`);
        }
        if (!arActs.has(key)) {
          errors.push(`acts.json: act ${act.act_number} key "${key}" missing in ar/acts.json`);
        }
      }
    }
    // And the reverse: every acts.json i18n act group should be referenced
    // by the seed (catches orphan act translations).
    const seededGroups = new Set(data.acts.map((a) => `act_${a.act_number}`));
    const i18nGroups = new Set(
      [...enActs.keys()].map((k) => k.split('.')[0]!),
    );
    for (const group of i18nGroups) {
      if (!seededGroups.has(group)) {
        errors.push(`i18n acts.json: group "${group}" has no matching seed act`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`[validate-content] FAILED with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(
    `[validate-content] OK — items=${data.items.length}, enemies=${data.enemies.length}, ` +
      `companions=${Object.keys(data.companions).length}, acts=${data.acts.length}, ` +
      `iap=${data.iapProducts.length}; acts ↔ i18n parity verified (en, ar)`,
  );
  console.log('[validate-content] Content validation passed. Exit 0.');
}

main();
