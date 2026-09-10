/**
 * scripts/build-db.ts
 * Bundled DB generation per spec 03 §5.2 (task P1.E1.T2 / P1.E5.T14).
 *
 * Reads all `data/seed/*.json`, validates the content, applies schema v1
 * and inserts the seed catalog, then writes `assets/olympian.db` for
 * bundling with the app. The output DB is byte-for-byte fresh on every
 * run (any previous file is removed first).
 *
 * The in-app migration runner uses the same `schema_version` table shape,
 * so the bundled DB and a runtime-migrated DB are interchangeable.
 *
 * Usage: npm run db:build
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  applySchemaV1,
  insertCatalog,
  loadSeedData,
  seedDir,
  validateSeedData,
} from './seed-data';

function main(): void {
  console.log('[build-db] Starting SQLite seed DB generation...');

  const data = loadSeedData();
  const errors = validateSeedData(data);
  if (errors.length > 0) {
    console.error('[build-db] seed content validation FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `[build-db] seed content OK (items=${data.items.length}, enemies=${data.enemies.length}, ` +
      `companions=${Object.keys(data.companions).length}, acts=${data.acts.length}, ` +
      `iap=${data.iapProducts.length})`,
  );

  const outPath = path.join(seedDir(), '..', '..', 'assets', 'olympian.db');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) {
    fs.unlinkSync(outPath);
  }

  const db = new DatabaseSync(outPath);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    applySchemaV1(db);
    const counts = insertCatalog(db, data);
    console.log(
      `[build-db] inserted ${counts.items} items, ${counts.enemies} enemies (single transaction)`,
    );
  } finally {
    db.close();
  }

  const sizeKb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`[build-db] wrote ${outPath} (${sizeKb} KB)`);
  console.log('[build-db] Database build complete. Exit 0.');
}

main();
