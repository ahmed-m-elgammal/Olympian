# 03 — Data Model & Database

> **DB engine:** op-sqlite 11.x (JSI, sync queries)
> **Schema version:** 1
> **Migrations:** versioning table, up-only

---

## 1. Design principles

1. **All game state is in SQLite.** MMKV holds only ephemeral flags and
   key-value settings (locale, audio volumes, feature flags).
2. **Schema is forward-only.** No destructive migrations. New tables and
   columns use `_v2` suffixes if they replace `_v1` columns.
3. **JSON columns for variable-shape data.** Inventory items, level configs,
   and puzzle states are stored as JSON TEXT. SQLite gives us indexing
   when needed via generated columns.
4. **Every row has `created_at` and `updated_at` integers** (epoch ms).
5. **No foreign-key cascades on game data.** Cascades are explicit in app
   code to keep deletion order obvious.

---

## 2. Database location

- **iOS:** `<Documents>/olympian.db`
- **Android:** `getFilesDir() + /olympian.db`
- Backup rule: on first launch, the bundled `assets/olympian.db` is copied
  to documents. Subsequent launches open the documents copy and run
  migrations.

---

## 3. Migration framework

```typescript
// src/platform/storage/sqlite.ts
const MIGRATIONS: Migration[] = [
  { version: 1, up: (db) => { /* schema v1 */ } },
  // { version: 2, up: (db) => { /* schema v2 */ } },
];

async function migrate(db: SQLiteDB) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
  const current = await db.execute('SELECT MAX(version) as v FROM schema_version');
  // apply each missing migration in order
}
```

**Locked rule:** Never delete a migration. Always add a new one with a
higher version number.

---

## 4. Schema (v1)

### 4.1 `saves` — save slots

The game supports 3 save slots. The active slot is in MMKV under
`active_save_id`.

```sql
CREATE TABLE saves (
  id              TEXT PRIMARY KEY,        -- 'slot_1' | 'slot_2' | 'slot_3'
  hero_name       TEXT NOT NULL,
  hero_level      INTEGER NOT NULL DEFAULT 1,
  hero_xp         INTEGER NOT NULL DEFAULT 0,
  current_act     INTEGER NOT NULL DEFAULT 1,    -- 1..12
  current_area    INTEGER NOT NULL DEFAULT 1,    -- 1..8
  playtime_ms     INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_played_at  INTEGER NOT NULL,
  is_completed    INTEGER NOT NULL DEFAULT 0,    -- boolean
  checksum        TEXT NOT NULL                  -- SHA-256 of serialized state
);

CREATE INDEX idx_saves_last_played ON saves(last_played_at DESC);
```

### 4.2 `hero_stats` — protagonist stats

```sql
CREATE TABLE hero_stats (
  save_id         TEXT PRIMARY KEY REFERENCES saves(id) ON DELETE CASCADE,
  hp_max          INTEGER NOT NULL DEFAULT 100,
  hp_current      INTEGER NOT NULL DEFAULT 100,
  atk             INTEGER NOT NULL DEFAULT 10,
  def             INTEGER NOT NULL DEFAULT 5,
  spd             INTEGER NOT NULL DEFAULT 10,
  int_stat        INTEGER NOT NULL DEFAULT 10,    -- 'int' is reserved
  lck             INTEGER NOT NULL DEFAULT 5,
  gold            INTEGER NOT NULL DEFAULT 0,
  gems            INTEGER NOT NULL DEFAULT 0,
  respec_tokens   INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);
```

**Reserved word note:** `int` is reserved in SQL; column renamed to
`int_stat`. App code uses `intelligence`.

### 4.3 `companions` — companion roster

```sql
CREATE TABLE companions (
  id              TEXT PRIMARY KEY,           -- 'athena' | 'hind' | 'hippolyta' | 'orpheus'
  save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  is_joined       INTEGER NOT NULL DEFAULT 0, -- boolean
  joined_at_act   INTEGER,                    -- nullable, set when is_joined becomes 1
  level           INTEGER NOT NULL DEFAULT 1,
  xp              INTEGER NOT NULL DEFAULT 0,
  slot_index      INTEGER,                    -- 0..2 in active party, null if benched
  base_stats      TEXT NOT NULL,              -- JSON, see 4.3.1
  growth_curve    TEXT NOT NULL,              -- JSON
  equipment       TEXT NOT NULL DEFAULT '{}', -- JSON map of slot → item_id
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_companions_save ON companions(save_id);
CREATE UNIQUE INDEX idx_companions_slot ON companions(save_id, slot_index)
  WHERE slot_index IS NOT NULL;
```

#### 4.3.1 `base_stats` JSON shape

```json
{
  "hp_max": 80,
  "atk": 12,
  "def": 6,
  "spd": 8,
  "intelligence": 14,
  "lck": 7
}
```

### 4.4 `enemies` — enemy catalog (seeded, read-only at runtime)

```sql
CREATE TABLE enemies (
  id              TEXT PRIMARY KEY,           -- 'nemean_lion' | 'hydra_head' | ...
  name_key        TEXT NOT NULL,              -- i18n key
  biome           TEXT NOT NULL,              -- 'arid_hills' | 'swamp' | ...
  level           INTEGER NOT NULL,           -- base level
  base_stats      TEXT NOT NULL,              -- JSON
  abilities       TEXT NOT NULL,              -- JSON array of ability ids
  loot_table      TEXT NOT NULL,              -- JSON, see 4.4.1
  sprite_atlas    TEXT NOT NULL,              -- 'atlas_creatures_01.png'
  sprite_idle     TEXT NOT NULL,              -- animation key
  sprite_attack   TEXT NOT NULL,
  sprite_hit      TEXT NOT NULL,
  ai_script       TEXT NOT NULL               -- 'aggressive' | 'defensive' | 'support' | 'boss_phase_1'
);
```

#### 4.4.1 `loot_table` JSON shape

```json
{
  "guaranteed": [{ "item": "gold", "qty": [10, 30] }],
  "drops": [
    { "item": "potion_minor", "drop_rate": 0.4 },
    { "item": "boots_traveler", "drop_rate": 0.05 }
  ]
}
```

`qty: [min, max]` is a uniform range.

### 4.5 `items` — item catalog (seeded)

```sql
CREATE TABLE items (
  id              TEXT PRIMARY KEY,           -- 'potion_minor' | 'boots_speed' | ...
  name_key        TEXT NOT NULL,
  description_key TEXT NOT NULL,
  category        TEXT NOT NULL,              -- 'consumable' | 'weapon' | 'helm' |
                                                --  'body' | 'trinket' | 'ring' | 'relic' |
                                                --  'key' | 'currency'
  rarity          TEXT NOT NULL,              -- 'common' | 'rare' | 'epic' | 'legendary'
  stack_max       INTEGER NOT NULL DEFAULT 1,
  icon_atlas      TEXT NOT NULL,
  icon_id         TEXT NOT NULL,
  effects         TEXT NOT NULL DEFAULT '[]', -- JSON array of effect specs
  value_gold      INTEGER NOT NULL DEFAULT 0,
  is_unique       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_items_rarity ON items(rarity);
```

**Effects JSON shape:**

```json
[
  { "type": "stat_mod", "stat": "atk", "value": 5 },
  { "type": "heal_on_hit", "amount": 2, "chance": 0.15 },
  { "type": "resistance", "element": "poison", "value": 0.5 }
]
```

### 4.6 `inventory` — player's items

```sql
CREATE TABLE inventory (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  item_id         TEXT NOT NULL REFERENCES items(id),
  qty             INTEGER NOT NULL DEFAULT 1,
  acquired_at     INTEGER NOT NULL,
  source          TEXT                        -- 'loot' | 'shop' | 'reward' | 'cheat'
);

CREATE INDEX idx_inventory_save ON inventory(save_id);
CREATE UNIQUE INDEX idx_inventory_unique
  ON inventory(save_id, item_id)
  WHERE (SELECT is_unique FROM items WHERE items.id = inventory.item_id) = 1;
```

The unique index enforces "one unique item per save" (e.g., legendary
weapons are unique).

### 4.7 `equipment` — currently equipped items (hero + companions)

```sql
CREATE TABLE equipment (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  owner_kind      TEXT NOT NULL,              -- 'hero' | 'companion'
  owner_id        TEXT,                       -- null when owner_kind='hero', companion id otherwise
  slot            TEXT NOT NULL,              -- 'weapon' | 'helm' | 'body' | 'trinket' | 'ring' | 'relic'
  item_id         TEXT NOT NULL REFERENCES items(id),
  equipped_at     INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_equipment_unique
  ON equipment(save_id, owner_kind, owner_id, slot);
```

### 4.8 `progress` — level completion tracking

```sql
CREATE TABLE progress (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  level_id        TEXT NOT NULL,              -- 'act1_area3_room2'
  status          TEXT NOT NULL,              -- 'unlocked' | 'cleared' | 'mastered'
  attempts        INTEGER NOT NULL DEFAULT 0,
  best_time_ms    INTEGER,
  deaths          INTEGER NOT NULL DEFAULT 0,
  hints_used      INTEGER NOT NULL DEFAULT 0,
  first_cleared_at INTEGER,
  last_played_at  INTEGER NOT NULL,
  stars           INTEGER NOT NULL DEFAULT 0  -- 0..3
);

CREATE UNIQUE INDEX idx_progress_unique ON progress(save_id, level_id);
CREATE INDEX idx_progress_act ON progress(save_id, level_id);
```

**Star rules:**
- 0 stars: cleared with 0–1 stars of performance
- 1 star: cleared in 1 attempt
- 2 stars: cleared with 0 deaths
- 3 stars: cleared with 0 deaths, 0 hints, <par time

(Par time is per-level in the level JSON; see level schema below.)

### 4.9 `bosses` — boss state

```sql
CREATE TABLE bosses (
  save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  boss_id         TEXT NOT NULL,              -- 'nemean_lion' | 'minotaur' | ...
  attempts        INTEGER NOT NULL DEFAULT 0,
  is_defeated     INTEGER NOT NULL DEFAULT 0,
  defeated_at     INTEGER,
  PRIMARY KEY (save_id, boss_id)
);
```

### 4.10 `relics` — collected relics (per Act)

```sql
CREATE TABLE relics (
  save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  relic_id        TEXT NOT NULL,              -- 'pelt_nemea' | 'hydra_bile' | ...
  act             INTEGER NOT NULL,
  acquired_at     INTEGER NOT NULL,
  PRIMARY KEY (save_id, relic_id)
);
```

### 4.11 `dialogues` — dialogue history (for skip/resume)

```sql
CREATE TABLE dialogues (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  dialogue_id     TEXT NOT NULL,
  line_index      INTEGER NOT NULL,
  seen_at         INTEGER NOT NULL,
  skipped         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_dialogues_save ON dialogues(save_id, dialogue_id);
```

### 4.12 `event_log` — append-only event log (for future cloud sync / replays)

```sql
CREATE TABLE event_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id         TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  sequence        INTEGER NOT NULL,           -- monotonic per save
  event_type      TEXT NOT NULL,              -- 'level_cleared' | 'item_acquired' | ...
  payload         TEXT NOT NULL,              -- JSON
  created_at      INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_event_log_seq ON event_log(save_id, sequence);
CREATE INDEX idx_event_log_type ON event_log(event_type);
```

**Why this exists even with no server:** It's the seam for future cloud
sync. When sync is added, the client can ship this log to a server and
the server can replay or merge it. Until then, it powers the in-game
"recent activity" feed and is rotated when it exceeds 10,000 rows.

### 4.13 `settings` — per-save settings (audio volumes, language)

```sql
CREATE TABLE settings (
  save_id         TEXT PRIMARY KEY REFERENCES saves(id) ON DELETE CASCADE,
  language        TEXT NOT NULL DEFAULT 'en',  -- 'en' | 'ar' | ...
  music_volume    REAL NOT NULL DEFAULT 0.8,   -- 0.0..1.0
  sfx_volume      REAL NOT NULL DEFAULT 1.0,
  haptics_enabled INTEGER NOT NULL DEFAULT 1,
  reduce_motion   INTEGER NOT NULL DEFAULT 0,
  color_blind_mode TEXT NOT NULL DEFAULT 'none', -- 'none'|'protan'|'deutan'|'tritan'
  one_handed_mode INTEGER NOT NULL DEFAULT 0,
  left_handed     INTEGER NOT NULL DEFAULT 0,
  text_scale      REAL NOT NULL DEFAULT 1.0,   -- 1.0/1.25/1.5/2.0
  updated_at      INTEGER NOT NULL
);
```

### 4.14 Schema summary

```
saves (1) ──┬── hero_stats (1:1)
            ├── companions (1:N)
            ├── inventory (1:N)
            ├── equipment (1:N)
            ├── progress (1:N)
            ├── bosses (1:N)
            ├── relics (1:N)
            ├── dialogues (1:N)
            ├── event_log (1:N)
            └── settings (1:1)

items (catalog, no FK to save)
enemies (catalog, no FK to save)
```

---

## 5. Seed data

Seed data is **read-only** at runtime. It is loaded from
`data/seed/*.json` and inserted on first launch (when the bundled DB is
copied to documents). Updates to seed data require an app update.

### 5.1 Seed files

```
data/seed/
├── items.json           # ~120 items
├── enemies.json         # ~30 enemy types
├── companions.json      # 4 companions
├── levels.json          # level metadata (tilemap refs, etc.)
├── puzzles.json         # puzzle configs
├── acts.json            # act metadata
├── dialogues.json       # dialogue scripts
└── iap_products.json    # placeholder products
```

### 5.2 Bundled DB generation

```bash
yarn db:build    # scripts/build-db.ts
```

Reads all `data/seed/*.json`, runs schema migrations, outputs
`assets/olympian.db` for bundling.

---

## 6. Common queries

### 6.1 Hydrate save on load

```sql
-- 1. Get save
SELECT * FROM saves WHERE id = ?;

-- 2. Get hero stats
SELECT * FROM hero_stats WHERE save_id = ?;

-- 3. Get joined companions
SELECT * FROM companions WHERE save_id = ? AND is_joined = 1;

-- 4. Get inventory
SELECT i.*, it.name_key, it.category, it.rarity, it.icon_atlas
FROM inventory i JOIN items it ON it.id = i.item_id
WHERE i.save_id = ?;

-- 5. Get equipment
SELECT e.*, it.name_key, it.effects
FROM equipment e JOIN items it ON it.id = e.item_id
WHERE e.save_id = ?;

-- 6. Get progress
SELECT * FROM progress WHERE save_id = ?;

-- 7. Get settings
SELECT * FROM settings WHERE save_id = ?;
```

Hydration returns a single `SaveSnapshot` object. See
[`04-state-management.md`](./04-state-management.md#save-snapshot).

### 6.2 Mark level cleared

```sql
INSERT INTO progress (save_id, level_id, status, attempts, deaths,
                      hints_used, first_cleared_at, last_played_at, stars)
VALUES (?, ?, 'cleared', ?, ?, ?, ?, ?, ?)
ON CONFLICT (save_id, level_id) DO UPDATE SET
  status = 'cleared',
  attempts = attempts + excluded.attempts,
  deaths = deaths + excluded.deaths,
  hints_used = hints_used + excluded.hints_used,
  last_played_at = excluded.last_played_at,
  stars = MAX(stars, excluded.stars);

INSERT INTO event_log (save_id, sequence, event_type, payload, created_at)
VALUES (?, ?, 'level_cleared', ?, ?);
```

### 6.3 Get next level to recommend

```sql
SELECT l.id FROM levels l
WHERE l.act = ? AND l.area = ? AND l.room = ?
  AND NOT EXISTS (
    SELECT 1 FROM progress p
    WHERE p.save_id = ? AND p.level_id = l.id AND p.status = 'cleared'
  )
ORDER BY l.room ASC LIMIT 1;
```

---

## 7. JSON schemas (for validation)

### 7.1 Level schema (`data/schemas/level.schema.json`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "version", "act", "area", "room", "biome", "type",
               "difficulty_tier", "tilemap", "sprite_atlas", "music_track",
               "spawn_point", "exit_point"],
  "properties": {
    "id": { "type": "string", "pattern": "^act\\d+_area\\d+_room\\d+$" },
    "version": { "type": "integer", "minimum": 1 },
    "act": { "type": "integer", "minimum": 1, "maximum": 12 },
    "area": { "type": "integer", "minimum": 1, "maximum": 8 },
    "room": { "type": "integer", "minimum": 1, "maximum": 4 },
    "biome": { "type": "string", "enum": [
      "arid_hills", "swamp", "forest", "snowy_mountain", "stables",
      "reed_marsh", "labyrinth", "thracian_stables", "amazon_territory",
      "three_islands", "twilight_garden", "underworld", "hub_town"
    ] },
    "type": { "type": "string", "enum": ["puzzle", "boss", "treasure", "story"] },
    "mechanics": { "type": "array", "items": { "type": "string",
      "enum": ["reflex", "sequence", "path", "timing", "logic", "maze"] } },
    "difficulty_tier": { "type": "integer", "minimum": 1, "maximum": 3 },
    "tilemap": { "type": "string" },
    "sprite_atlas": { "type": "string" },
    "music_track": { "type": "string" },
    "ambience": { "type": "string" },
    "spawn_point": { "type": "object", "required": ["x", "y"],
      "properties": { "x": { "type": "integer" }, "y": { "type": "integer" } } },
    "exit_point": { "type": "object", "required": ["x", "y"],
      "properties": { "x": { "type": "integer" }, "y": { "type": "integer" } } },
    "par_time_ms": { "type": "integer", "minimum": 1000 },
    "puzzle": { "type": "object" },
    "loot": { "type": "array" },
    "first_clear_rewards": { "type": "object" }
  },
  "additionalProperties": false
}
```

### 7.2 Item schema (subset, see `data/schemas/item.schema.json`)

```json
{
  "type": "object",
  "required": ["id", "name_key", "description_key", "category", "rarity",
               "icon_atlas", "icon_id"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z][a-z0-9_]{1,40}$" },
    "name_key": { "type": "string", "pattern": "^items\\." },
    "description_key": { "type": "string", "pattern": "^items\\." },
    "category": { "type": "string", "enum": [
      "consumable", "weapon", "helm", "body", "trinket", "ring",
      "relic", "key", "currency"
    ] },
    "rarity": { "type": "string", "enum": ["common","rare","epic","legendary"] },
    "stack_max": { "type": "integer", "minimum": 1, "maximum": 99 },
    "icon_atlas": { "type": "string" },
    "icon_id": { "type": "string" },
    "effects": { "type": "array" },
    "value_gold": { "type": "integer", "minimum": 0 },
    "is_unique": { "type": "boolean" }
  },
  "additionalProperties": false
}
```

---

## 8. Performance considerations

- All hot-path queries are indexed (see CREATE INDEX).
- Use `db.execute()` for writes, `db.executeSync()` for reads on the JS thread
  (op-sqlite supports both). **Reads are synchronous via JSI** — no
  Promise overhead.
- `inventory` and `equipment` use composite unique indexes for atomicity.
- `event_log` is append-only with a unique index on (save_id, sequence) —
  bulk inserts are batched with a single transaction every 100 events.
- DB file is opened with `WAL` journal mode (better concurrency).
- Vacuum on app start if free page count > 20% of total.

---

## 9. Backup & restore

- **iOS:** documents folder is backed up to iCloud by default. We opt out
  via `NSURLIsExcludedFromBackupKey` so save files don't pollute user
  iCloud backups (a single-player game save is not a "document" in the
  user sense).
- **Android:** `getNoBackupFilesDir()` is used so the DB is excluded from
  auto-backup.

Restore flow: if a user reinstalls, they lose their save. **No cloud
restore at MVP** (deferred).

---

## 10. Limits & bounds

| Limit | Value | Enforced where |
|---|---|---|
| Max save slots | 3 | App code |
| Max inventory items | 200 | App code (32 grid slots + 168 stash) |
| Max equipment per slot | 1 | Unique index |
| Max companions in party | 3 (1 hero + 2 companions) | App code |
| Max events in event_log | 10,000 | App code (rotation) |
| Max level id length | 32 chars | Schema regex |
| Max item id length | 40 chars | Schema regex |
| Max JSON payload in event_log | 4 KB | App code |

---

## 11. Future extensions (deferred)

- `social` table for friends/leaderboards (cloud)
- `daily_quest` table for daily content
- `purchase_receipt` table for IAP audit trail
- `analytics_event` table (pre-aggregated, for opt-in analytics)

These are **out of MVP scope** but their absence must not require schema
rewrites. Each can be added as a separate table without modifying existing
ones.
