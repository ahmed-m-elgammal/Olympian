import type { Migration, MigrationExecutor } from './types';

/**
 * DDL statements for schema v1.
 *
 * Order matters: `schema_version` is created first (by the migration runner
 * before any migration runs), then `saves` (the parent of all per-save
 * tables), then the catalog tables (`enemies`, `items`) which have no
 * inbound FKs, then the per-save child tables.
 *
 * Every table is created with `IF NOT EXISTS` so that re-running the v1
 * migration on a partially-applied database is safe (idempotent).
 *
 * Spec reference: spec 03 §4.
 */
export const V1_STATEMENTS: readonly string[] = [
  // -----------------------------------------------------------------------
  // 4.1 saves — save slots
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS saves (
    id              TEXT PRIMARY KEY,
    hero_name       TEXT NOT NULL,
    hero_level      INTEGER NOT NULL DEFAULT 1,
    hero_xp         INTEGER NOT NULL DEFAULT 0,
    current_act     INTEGER NOT NULL DEFAULT 1,
    current_area    INTEGER NOT NULL DEFAULT 1,
    playtime_ms     INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    last_played_at  INTEGER NOT NULL,
    is_completed    INTEGER NOT NULL DEFAULT 0,
    checksum        TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_saves_last_played ON saves(last_played_at DESC)`,

  // -----------------------------------------------------------------------
  // 4.2 hero_stats — protagonist stats (1:1 with saves)
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS hero_stats (
    save_id         TEXT PRIMARY KEY REFERENCES saves(id) ON DELETE CASCADE,
    hp_max          INTEGER NOT NULL DEFAULT 100,
    hp_current      INTEGER NOT NULL DEFAULT 100,
    atk             INTEGER NOT NULL DEFAULT 10,
    def             INTEGER NOT NULL DEFAULT 5,
    spd             INTEGER NOT NULL DEFAULT 10,
    int_stat        INTEGER NOT NULL DEFAULT 10,
    lck             INTEGER NOT NULL DEFAULT 5,
    gold            INTEGER NOT NULL DEFAULT 0,
    gems            INTEGER NOT NULL DEFAULT 0,
    respec_tokens   INTEGER NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL
  )`,

  // -----------------------------------------------------------------------
  // 4.3 companions — companion roster (1:N with saves)
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS companions (
    id              TEXT PRIMARY KEY,
    save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
    is_joined       INTEGER NOT NULL DEFAULT 0,
    joined_at_act   INTEGER,
    level           INTEGER NOT NULL DEFAULT 1,
    xp              INTEGER NOT NULL DEFAULT 0,
    slot_index      INTEGER,
    base_stats      TEXT NOT NULL,
    growth_curve    TEXT NOT NULL,
    equipment       TEXT NOT NULL DEFAULT '{}',
    updated_at      INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_companions_save ON companions(save_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_companions_slot
    ON companions(save_id, slot_index)
    WHERE slot_index IS NOT NULL`,

  // -----------------------------------------------------------------------
  // 4.4 enemies — enemy catalog (seeded, read-only at runtime)
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS enemies (
    id              TEXT PRIMARY KEY,
    name_key        TEXT NOT NULL,
    biome           TEXT NOT NULL,
    level           INTEGER NOT NULL,
    base_stats      TEXT NOT NULL,
    abilities       TEXT NOT NULL,
    loot_table      TEXT NOT NULL,
    sprite_atlas    TEXT NOT NULL,
    sprite_idle     TEXT NOT NULL,
    sprite_attack   TEXT NOT NULL,
    sprite_hit      TEXT NOT NULL,
    ai_script       TEXT NOT NULL
  )`,

  // -----------------------------------------------------------------------
  // 4.5 items — item catalog (seeded, read-only at runtime)
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS items (
    id              TEXT PRIMARY KEY,
    name_key        TEXT NOT NULL,
    description_key TEXT NOT NULL,
    category        TEXT NOT NULL,
    rarity          TEXT NOT NULL,
    stack_max       INTEGER NOT NULL DEFAULT 1,
    icon_atlas      TEXT NOT NULL,
    icon_id         TEXT NOT NULL,
    effects         TEXT NOT NULL DEFAULT '[]',
    value_gold      INTEGER NOT NULL DEFAULT 0,
    is_unique       INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)`,
  `CREATE INDEX IF NOT EXISTS idx_items_rarity ON items(rarity)`,

  // -----------------------------------------------------------------------
  // 4.6 inventory — player's items (1:N with saves, N:1 with items)
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS inventory (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
    item_id         TEXT NOT NULL REFERENCES items(id),
    qty             INTEGER NOT NULL DEFAULT 1,
    acquired_at     INTEGER NOT NULL,
    source          TEXT,
    -- Denormalized copy of items.is_unique, written at insert time.
    -- SQLite partial indexes cannot contain subqueries or reference other
    -- tables, so the uniqueness flag must live on this table itself.
    is_unique       INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_save ON inventory(save_id)`,
  // Partial unique index: only enforces uniqueness for items flagged
  // is_unique=1 (legendaries). Multiple unique-item rows for the same
  // (save, item) are forbidden; stacking common items is fine.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_unique
    ON inventory(save_id, item_id)
    WHERE is_unique = 1`,

  // -----------------------------------------------------------------------
  // 4.7 equipment — currently equipped items (hero + companions)
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS equipment (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
    owner_kind      TEXT NOT NULL,
    owner_id        TEXT,
    slot            TEXT NOT NULL,
    item_id         TEXT NOT NULL REFERENCES items(id),
    equipped_at     INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_unique
    ON equipment(save_id, owner_kind, owner_id, slot)`,

  // -----------------------------------------------------------------------
  // 4.8 progress — level completion tracking
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS progress (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
    level_id        TEXT NOT NULL,
    status          TEXT NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    best_time_ms    INTEGER,
    deaths          INTEGER NOT NULL DEFAULT 0,
    hints_used      INTEGER NOT NULL DEFAULT 0,
    first_cleared_at INTEGER,
    last_played_at  INTEGER NOT NULL,
    stars           INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_unique ON progress(save_id, level_id)`,
  `CREATE INDEX IF NOT EXISTS idx_progress_act ON progress(save_id, level_id)`,

  // -----------------------------------------------------------------------
  // 4.9 bosses — boss state
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS bosses (
    save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
    boss_id         TEXT NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    is_defeated     INTEGER NOT NULL DEFAULT 0,
    defeated_at     INTEGER,
    PRIMARY KEY (save_id, boss_id)
  )`,

  // -----------------------------------------------------------------------
  // 4.10 relics — collected relics (per Act)
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS relics (
    save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
    relic_id        TEXT NOT NULL,
    act             INTEGER NOT NULL,
    acquired_at     INTEGER NOT NULL,
    PRIMARY KEY (save_id, relic_id)
  )`,

  // -----------------------------------------------------------------------
  // 4.11 dialogues — dialogue history (for skip/resume)
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS dialogues (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
    dialogue_id     TEXT NOT NULL,
    line_index      INTEGER NOT NULL,
    seen_at         INTEGER NOT NULL,
    skipped         INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dialogues_save ON dialogues(save_id, dialogue_id)`,

  // -----------------------------------------------------------------------
  // 4.12 event_log — append-only event log (for future cloud sync / replays)
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS event_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
    sequence        INTEGER NOT NULL,
    event_type      TEXT NOT NULL,
    payload         TEXT NOT NULL,
    created_at      INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_event_log_seq ON event_log(save_id, sequence)`,
  `CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type)`,

  // -----------------------------------------------------------------------
  // 4.13 settings — per-save settings (audio volumes, language)
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS settings (
    save_id         TEXT PRIMARY KEY REFERENCES saves(id) ON DELETE CASCADE,
    language        TEXT NOT NULL DEFAULT 'en',
    music_volume    REAL NOT NULL DEFAULT 0.8,
    sfx_volume      REAL NOT NULL DEFAULT 1.0,
    haptics_enabled INTEGER NOT NULL DEFAULT 1,
    reduce_motion   INTEGER NOT NULL DEFAULT 0,
    color_blind_mode TEXT NOT NULL DEFAULT 'none',
    one_handed_mode INTEGER NOT NULL DEFAULT 0,
    left_handed     INTEGER NOT NULL DEFAULT 0,
    text_scale      REAL NOT NULL DEFAULT 1.0,
    updated_at      INTEGER NOT NULL
  )`,

  // NOTE: connection-level pragmas (`journal_mode = WAL`,
  // `foreign_keys = ON`, spec 03 §8) are intentionally NOT part of this
  // migration. SQLite cannot change journal mode inside a transaction and
  // silently ignores `foreign_keys` inside one — both pragmas are applied
  // by `openDatabase()` right after the connection is opened, outside any
  // transaction (see sqlite.ts).
];

/**
 * Migration v1 — initial schema. Creates all 14 tables (saves, hero_stats,
 * companions, enemies, items, inventory, equipment, progress, bosses,
 * relics, dialogues, event_log, settings) and 13 indexes per spec 03 §4.
 *
 * `schema_version` is created by the migration runner before this runs.
 * The runner wraps these statements in its own transaction — this
 * function must not open one (SQLite forbids nested transactions).
 */
export const migrationV1: Migration = {
  version: 1,
  description: 'Initial schema — all 14 tables per spec 03 §4',
  async up(tx: MigrationExecutor): Promise<void> {
    for (const stmt of V1_STATEMENTS) {
      await tx.execute(stmt);
    }
  },
};
