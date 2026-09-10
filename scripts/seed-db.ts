/**
 * scripts/seed-db.ts
 * DB seed runner per spec 03 §5.1 (task P1.E5.T14: "load seed JSON,
 * insert into DB").
 *
 * Loads `data/seed/*.json`, validates the content, then idempotently
 * seeds a SQLite database file:
 *   - the schema is applied with IF NOT EXISTS (safe on an existing DB),
 *   - catalog rows (items, enemies) are inserted with INSERT OR REPLACE,
 *   - all inserts run inside a single transaction.
 *
 * The target DB defaults to `assets/olympian.db` and can be overridden
 * with the first CLI argument (e.g. `npm run db:seed -- /tmp/test.db`).
 * A missing file is created; an existing file keeps its non-catalog rows.
 *
 * Usage: npm run db:seed [path]
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
  console.log('[seed-db] Seeding database with initial content...');

  const data = loadSeedData();
  const errors = validateSeedData(data);
  if (errors.length > 0) {
    console.error('[seed-db] seed content validation FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const target = process.argv[2] ?? path.join(seedDir(), '..', '..', 'assets', 'olympian.db');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existed = fs.existsSync(target);
  console.log(`[seed-db] target: ${target} (${existed ? 'existing' : 'new'} database)`);

  const db = new DatabaseSync(target);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    applySchemaV1(db);
    const counts = insertCatalog(db, data);
    const row = db.prepare(
      "SELECT (SELECT COUNT(*) FROM items) AS items, (SELECT COUNT(*) FROM enemies) AS enemies",
    ).get() as { items: number; enemies: number };
    console.log(
      `[seed-db] catalog now holds ${row.items} items and ${row.enemies} enemies ` +
        `(inserted ${counts.items}/${counts.enemies} this run)`,
    );
  } finally {
    db.close();
  }

  console.log('[seed-db] DB seeding completed. Exit 0.');
}

main();
