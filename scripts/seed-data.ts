/**
 * Shared seed-data loader + validation + catalog insertion for the
 * Olympian build/seed scripts (spec 03 §5, tasks P1.E5.T9–T14).
 *
 * Used by:
 *   - scripts/build-db.ts        (generate the bundled assets/olympian.db)
 *   - scripts/seed-db.ts         (idempotently seed an existing DB file)
 *   - scripts/validate-content.ts (content validation entry point)
 *
 * Seed files live in `data/seed/` and are READ-ONLY at runtime (spec 03
 * §5). Only the two catalog tables that schema v1 defines as seeded
 * (`items`, `enemies`) are inserted into the database; the remaining
 * files (companions, acts, iap_products) are validated here and read as
 * bundled JSON by the app at runtime.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { V1_STATEMENTS } from '../src/platform/storage/migrations/v1';

// ---------------------------------------------------------------------------
// Types (JSON shape — matches the v1 DB columns for the catalog tables)
// ---------------------------------------------------------------------------

export interface SeedItem {
  id: string;
  name_key: string;
  description_key: string;
  category: string;
  rarity: string;
  stack_max: number;
  icon_atlas: string;
  icon_id: string;
  effects: Array<Record<string, unknown>>;
  value_gold: number;
  is_unique: 0 | 1;
}

export interface SeedEnemy {
  id: string;
  name_key: string;
  biome: string;
  level: number;
  base_stats: { hp: number; atk: number; def: number; spd: number; xp: number };
  abilities: string[];
  loot_table: Array<{ item_id: string; chance: number; qty_min: number; qty_max: number }>;
  sprite_atlas: string;
  sprite_idle: string;
  sprite_attack: string;
  sprite_hit: string;
  ai_script: string;
}

export interface SeedCompanion {
  id: string;
  name_key: string;
  role: string;
  join_act: number;
  join_rule: string;
  base_stats: Record<string, number>;
  growth_per_level: Record<string, number>;
  abilities: string[];
  sprite: { atlasId: string; spriteId: string };
}

export interface SeedAct {
  act_number: number;
  name_key: string;
  subtitle_key: string;
  biome: string;
  boss_id: string;
  relic_item_id: string | null;
  music_track: string;
  ambience_track: string;
  levels: number;
}

export interface SeedIapProduct {
  id: string;
  type: string;
  tier: string;
  defaultPriceUSD: number;
  reward: string;
  platforms: { ios: string; android: string };
}

export interface SeedData {
  items: SeedItem[];
  enemies: SeedEnemy[];
  companions: Record<string, SeedCompanion>;
  acts: SeedAct[];
  iapProducts: SeedIapProduct[];
}

/** Expected catalog sizes per tasks P1.E5.T9–T13. */
export const EXPECTED = {
  items: 50,
  enemies: 14,
  companions: 4,
  acts: 12,
  iapProducts: 2,
} as const;

export const ITEM_CATEGORIES = [
  'consumable',
  'weapon',
  'helm',
  'body',
  'trinket',
  'ring',
  'relic',
  'key',
  'currency',
] as const;

export const ITEM_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;

export const AI_SCRIPTS = [
  'aggressive',
  'defensive',
  'support',
  'boss_phase_1',
  'boss_phase_2',
  'flee_when_low',
] as const;

/** Known effect types from the documented effects JSON shape (03 §4.5). */
export const EFFECT_TYPES = [
  'stat_mod',
  'heal_on_hit',
  'resistance',
  'restore',
  'perk',
] as const;

/** Resolve the seed directory relative to this file (`<repo>/data/seed`). */
export function seedDir(): string {
  return path.join(__dirname, '..', 'data', 'seed');
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

function readJson<T>(file: string): T {
  const full = path.join(seedDir(), file);
  const raw = fs.readFileSync(full, 'utf8');
  return JSON.parse(raw) as T;
}

/**
 * Load and return all seed JSON files. Throws (with a clear message) if a
 * file is missing or is not valid JSON — the build should fail loudly.
 */
export function loadSeedData(): SeedData {
  const itemsDoc = readJson<{ version: number; items: SeedItem[] }>('items.json');
  const enemiesDoc = readJson<{ version: number; enemies: SeedEnemy[] }>('enemies.json');
  const companionsDoc = readJson<{ version: number; companions: Record<string, SeedCompanion> }>(
    'companions.json',
  );
  const actsDoc = readJson<{ version: number; acts: SeedAct[] }>('acts.json');
  const iapDoc = readJson<{ version: number; products: SeedIapProduct[] }>('iap_products.json');

  return {
    items: itemsDoc.items,
    enemies: enemiesDoc.enemies,
    companions: companionsDoc.companions,
    acts: actsDoc.acts,
    iapProducts: iapDoc.products,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate seed content. Returns a list of human-readable error strings —
 * empty means the content is valid. Checks:
 *   - expected row counts per task P1.E5
 *   - unique ids
 *   - enum membership (category / rarity / ai_script / effect types)
 *   - numeric ranges (stack_max, chance, level)
 *   - i18n key format
 *   - cross-file references (enemy loot → items, act boss/relic → ids)
 */
export function validateSeedData(data: SeedData): string[] {
  const errors: string[] = [];
  const err = (msg: string): void => {
    errors.push(msg);
  };

  // ---- items ----
  if (data.items.length !== EXPECTED.items) {
    err(`items.json: expected ${EXPECTED.items} items, found ${data.items.length}`);
  }
  const itemIds = new Set<string>();
  for (const it of data.items) {
    if (itemIds.has(it.id)) err(`items.json: duplicate id "${it.id}"`);
    itemIds.add(it.id);
    if (!it.name_key || !it.name_key.startsWith('items:')) {
      err(`items.json: "${it.id}" name_key must be an "items:<id>.name" i18n key`);
    }
    if (!it.description_key || !it.description_key.startsWith('items:')) {
      err(`items.json: "${it.id}" description_key must be an "items:<id>.description" i18n key`);
    }
    if (!(ITEM_CATEGORIES as readonly string[]).includes(it.category)) {
      err(`items.json: "${it.id}" has unknown category "${it.category}"`);
    }
    if (!(ITEM_RARITIES as readonly string[]).includes(it.rarity)) {
      err(`items.json: "${it.id}" has unknown rarity "${it.rarity}"`);
    }
    if (!Number.isInteger(it.stack_max) || it.stack_max < 1) {
      err(`items.json: "${it.id}" stack_max must be a positive integer`);
    }
    if (!it.icon_atlas || !it.icon_id) {
      err(`items.json: "${it.id}" missing icon_atlas/icon_id`);
    }
    if (!Array.isArray(it.effects)) {
      err(`items.json: "${it.id}" effects must be a JSON array`);
    } else {
      for (const fx of it.effects) {
        if (!fx || typeof fx.type !== 'string') {
          err(`items.json: "${it.id}" has an effect without a "type" field`);
        } else if (!(EFFECT_TYPES as readonly string[]).includes(fx.type)) {
          err(`items.json: "${it.id}" effect type "${fx.type}" is not a registered effect`);
        }
      }
    }
    if (!Number.isFinite(it.value_gold) || it.value_gold < 0) {
      err(`items.json: "${it.id}" value_gold must be >= 0`);
    }
    if (it.is_unique !== 0 && it.is_unique !== 1) {
      err(`items.json: "${it.id}" is_unique must be 0 or 1`);
    }
    if (it.rarity === 'legendary' && it.is_unique !== 1) {
      err(`items.json: "${it.id}" is legendary but not unique (spec 09 §4.2 unique perk)`);
    }
  }

  // ---- enemies ----
  if (data.enemies.length !== EXPECTED.enemies) {
    err(`enemies.json: expected ${EXPECTED.enemies} enemies, found ${data.enemies.length}`);
  }
  const enemyIds = new Set<string>();
  for (const en of data.enemies) {
    if (enemyIds.has(en.id)) err(`enemies.json: duplicate id "${en.id}"`);
    enemyIds.add(en.id);
    if (!en.name_key || !en.name_key.startsWith('enemies:')) {
      err(`enemies.json: "${en.id}" name_key must be an "enemies:<id>.name" i18n key`);
    }
    if (!en.biome) err(`enemies.json: "${en.id}" missing biome`);
    if (!Number.isInteger(en.level) || en.level < 1 || en.level > 50) {
      err(`enemies.json: "${en.id}" level must be an integer in [1, 50]`);
    }
    const bs = en.base_stats;
    if (
      !bs ||
      [bs.hp, bs.atk, bs.def, bs.spd, bs.xp].some(
        (v) => !Number.isFinite(v) || (v as number) < 0,
      )
    ) {
      err(`enemies.json: "${en.id}" base_stats must be non-negative {hp,atk,def,spd,xp}`);
    }
    if (!Array.isArray(en.abilities) || en.abilities.length === 0) {
      err(`enemies.json: "${en.id}" must have at least one ability`);
    }
    if (!(AI_SCRIPTS as readonly string[]).includes(en.ai_script)) {
      err(`enemies.json: "${en.id}" has unknown ai_script "${en.ai_script}"`);
    }
    for (const s of [en.sprite_idle, en.sprite_attack, en.sprite_hit]) {
      if (!s) {
        err(`enemies.json: "${en.id}" missing sprite frame(s)`);
        break;
      }
    }
    if (!Array.isArray(en.loot_table)) {
      err(`enemies.json: "${en.id}" loot_table must be an array`);
    } else {
      for (const drop of en.loot_table) {
        if (!itemIds.has(drop.item_id)) {
          err(`enemies.json: "${en.id}" drops unknown item "${drop.item_id}"`);
        }
        if (drop.chance < 0 || drop.chance > 1) {
          err(`enemies.json: "${en.id}" drop "${drop.item_id}" chance must be in [0, 1]`);
        }
        if (drop.qty_min < 1 || drop.qty_max < drop.qty_min) {
          err(`enemies.json: "${en.id}" drop "${drop.item_id}" has invalid qty range`);
        }
      }
    }
  }

  // ---- companions ----
  const companionIds = Object.keys(data.companions);
  if (companionIds.length !== EXPECTED.companions) {
    err(
      `companions.json: expected ${EXPECTED.companions} companions, found ${companionIds.length}`,
    );
  }
  for (const cid of companionIds) {
    const c = data.companions[cid]!;
    if (c.id !== cid) {
      err(`companions.json: key "${cid}" does not match embedded id "${c.id}"`);
    }
    if (!c.name_key || !c.name_key.startsWith('companions.')) {
      err(`companions.json: "${cid}" name_key must be a "companions.<id>.name" i18n key`);
    }
    if (!c.base_stats || !c.growth_per_level) {
      err(`companions.json: "${cid}" missing base_stats / growth_per_level`);
    }
    if (!c.sprite || !c.sprite.atlasId || !c.sprite.spriteId) {
      err(`companions.json: "${cid}" missing sprite {atlasId, spriteId}`);
    }
  }

  // ---- acts ----
  if (data.acts.length !== EXPECTED.acts) {
    err(`acts.json: expected ${EXPECTED.acts} acts, found ${data.acts.length}`);
  }
  const actNumbers = new Set<number>();
  for (const act of data.acts) {
    if (actNumbers.has(act.act_number)) {
      err(`acts.json: duplicate act_number ${act.act_number}`);
    }
    actNumbers.add(act.act_number);
    if (!act.name_key.startsWith(`acts:act_${act.act_number}.title`)) {
      err(
        `acts.json: act ${act.act_number} name_key "${act.name_key}" does not match the i18n key pattern`,
      );
    }
    if (!enemyIds.has(act.boss_id)) {
      err(`acts.json: act ${act.act_number} references unknown boss "${act.boss_id}"`);
    }
    if (act.relic_item_id !== null && !itemIds.has(act.relic_item_id)) {
      err(`acts.json: act ${act.act_number} references unknown relic "${act.relic_item_id}"`);
    }
    if (!/^act\d+_explore$|^tutorial$/.test(act.music_track)) {
      err(`acts.json: act ${act.act_number} has unexpected music_track "${act.music_track}"`);
    }
    if (!/^amb_act\d+$/.test(act.ambience_track)) {
      err(`acts.json: act ${act.act_number} has unexpected ambience_track "${act.ambience_track}"`);
    }
  }

  // ---- iap products ----
  if (data.iapProducts.length !== EXPECTED.iapProducts) {
    err(
      `iap_products.json: expected ${EXPECTED.iapProducts} products, found ${data.iapProducts.length}`,
    );
  }
  const productIds = new Set<string>();
  const rewards = new Set<string>();
  for (const p of data.iapProducts) {
    if (productIds.has(p.id)) err(`iap_products.json: duplicate product id "${p.id}"`);
    productIds.add(p.id);
    if (rewards.has(p.reward)) err(`iap_products.json: duplicate reward "${p.reward}"`);
    rewards.add(p.reward);
    if (p.type !== 'non_consumable') {
      err(`iap_products.json: "${p.id}" type must be non_consumable at MVP (13 §3.1)`);
    }
    if (!p.platforms?.ios || !p.platforms?.android) {
      err(`iap_products.json: "${p.id}" missing platform store ids`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Catalog insertion (shared by build-db and seed-db)
// ---------------------------------------------------------------------------

export interface Dblike {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
  };
}

/**
 * Apply schema v1 idempotently (all statements use IF NOT EXISTS) and
 * record the schema version if not already recorded. Mirrors the in-app
 * migration runner's `schema_version` shape so the bundled DB and a
 * runtime-migrated DB are interchangeable.
 */
export function applySchemaV1(db: Dblike): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
  for (const stmt of V1_STATEMENTS) {
    db.exec(stmt);
  }
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as {
    v: number | null;
  };
  if (row.v === null || row.v === undefined) {
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      1,
      Date.now(),
    );
  }
}

/**
 * Insert the seed catalog (items + enemies) with INSERT OR REPLACE so
 * re-seeding an existing DB is idempotent. Returns the row counts.
 */
export function insertCatalog(db: Dblike, data: SeedData): { items: number; enemies: number } {
  db.exec('BEGIN TRANSACTION');
  try {
    const insertItem = db.prepare(`
      INSERT OR REPLACE INTO items (
        id, name_key, description_key, category, rarity, stack_max,
        icon_atlas, icon_id, effects, value_gold, is_unique
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const it of data.items) {
      insertItem.run(
        it.id,
        it.name_key,
        it.description_key,
        it.category,
        it.rarity,
        it.stack_max,
        it.icon_atlas,
        it.icon_id,
        JSON.stringify(it.effects),
        it.value_gold,
        it.is_unique,
      );
    }

    const insertEnemy = db.prepare(`
      INSERT OR REPLACE INTO enemies (
        id, name_key, biome, level, base_stats, abilities, loot_table,
        sprite_atlas, sprite_idle, sprite_attack, sprite_hit, ai_script
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const en of data.enemies) {
      insertEnemy.run(
        en.id,
        en.name_key,
        en.biome,
        en.level,
        JSON.stringify(en.base_stats),
        JSON.stringify(en.abilities),
        JSON.stringify(en.loot_table),
        en.sprite_atlas,
        en.sprite_idle,
        en.sprite_attack,
        en.sprite_hit,
        en.ai_script,
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { items: data.items.length, enemies: data.enemies.length };
}
