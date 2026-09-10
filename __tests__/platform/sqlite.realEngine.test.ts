/**
 * Migration v1 executed against a REAL SQLite engine (node:sqlite).
 *
 * The other migration tests mock the op-sqlite driver, so they verify
 * statement sequencing but never execute the SQL. This test runs every
 * V1 statement against a genuine SQLite engine, which catches SQL that
 * parses but is invalid — e.g., the original `idx_inventory_unique`
 * partial index used a correlated subquery in its WHERE clause, which
 * SQLite rejects ("queries in partial index WHERE clauses are not
 * allowed"). That bug passed all mocked tests but would have crashed the
 * migration on a real device at first launch.
 *
 * node:sqlite is available in the repo's toolchain (Node ≥ 22.5; the
 * scripts pipeline uses it too — see scripts/build-db.ts).
 */

import { DatabaseSync } from 'node:sqlite';

import { V1_STATEMENTS } from '../../src/platform/storage/migrations/v1';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
  return db;
}

describe('migration v1 against a real SQLite engine', () => {
  it('applies every statement without error', () => {
    const db = freshDb();
    expect(() => {
      for (const stmt of V1_STATEMENTS) {
        db.exec(stmt);
      }
    }).not.toThrow();
    db.close();
  });

  it('creates all 13 tables + schema_version', () => {
    const db = freshDb();
    for (const stmt of V1_STATEMENTS) db.exec(stmt);
    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>
    ).map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'saves',
        'hero_stats',
        'companions',
        'enemies',
        'items',
        'inventory',
        'equipment',
        'progress',
        'bosses',
        'relics',
        'dialogues',
        'event_log',
        'settings',
        'schema_version',
      ]),
    );
    db.close();
  });

  it('enforces foreign keys (item_id must exist in items)', () => {
    const db = freshDb();
    for (const stmt of V1_STATEMENTS) db.exec(stmt);
    db.exec('PRAGMA foreign_keys = ON');

    const now = Date.now();
    db.prepare(
      'INSERT INTO saves (id, hero_name, created_at, updated_at, last_played_at, checksum) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('s1', 'Alexios', now, now, now, 'chk');

    // Inserting inventory for a non-existent item must fail with FK enforcement.
    expect(() => {
      db.prepare(
        'INSERT INTO inventory (save_id, item_id, qty, acquired_at) VALUES (?, ?, ?, ?)',
      ).run('s1', 'no_such_item', 1, now);
    }).toThrow();

    db.close();
  });

  it('the inventory partial unique index blocks duplicate unique items only', () => {
    const db = freshDb();
    for (const stmt of V1_STATEMENTS) db.exec(stmt);
    db.exec('PRAGMA foreign_keys = ON');

    const now = Date.now();
    db.prepare(
      'INSERT INTO saves (id, hero_name, created_at, updated_at, last_played_at, checksum) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('s1', 'Alexios', now, now, now, 'chk');

    // Two catalog items: one unique (legendary), one stackable (common).
    db.prepare(
      "INSERT INTO items (id, name_key, description_key, category, rarity, icon_atlas, icon_id, effects, value_gold, is_unique) VALUES ('relic_x', 'k1', 'k2', 'relic', 'legendary', 'a', 'b', '[]', 0, 1)",
    ).run();
    db.prepare(
      "INSERT INTO items (id, name_key, description_key, category, rarity, icon_atlas, icon_id, effects, value_gold, is_unique) VALUES ('potion_y', 'k3', 'k4', 'consumable', 'common', 'a', 'b', '[]', 5, 0)",
    ).run();

    const inv = db.prepare(
      'INSERT INTO inventory (save_id, item_id, qty, acquired_at, is_unique) VALUES (?, ?, ?, ?, ?)',
    );

    inv.run('s1', 'relic_x', 1, now, 1);
    // Second copy of the unique item in the same save → rejected.
    expect(() => inv.run('s1', 'relic_x', 1, now, 1)).toThrow();

    inv.run('s1', 'potion_y', 1, now, 0);
    // Stackable item can appear twice.
    expect(() => inv.run('s1', 'potion_y', 3, now, 0)).not.toThrow();

    const rows = db
      .prepare('SELECT COUNT(*) as n FROM inventory')
      .get() as { n: number };
    expect(rows.n).toBe(3);

    db.close();
  });

  it('catalog seed rows round-trip through the v1 schema', () => {
    const db = freshDb();
    for (const stmt of V1_STATEMENTS) db.exec(stmt);

    const insertItem = db.prepare(`
      INSERT OR REPLACE INTO items (
        id, name_key, description_key, category, rarity, stack_max,
        icon_atlas, icon_id, effects, value_gold, is_unique
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertItem.run(
      'sword_test',
      'items:sword_test.name',
      'items:sword_test.description',
      'weapon',
      'rare',
      1,
      'atlas_ui_64',
      'sword',
      JSON.stringify([{ type: 'stat_mod', stat: 'atk', value: 5 }]),
      100,
      0,
    );

    const row = db.prepare('SELECT * FROM items WHERE id = ?').get('sword_test') as {
      effects: string;
      rarity: string;
    };
    expect(row.rarity).toBe('rare');
    expect(JSON.parse(row.effects)).toEqual([{ type: 'stat_mod', stat: 'atk', value: 5 }]);

    db.close();
  });
});
