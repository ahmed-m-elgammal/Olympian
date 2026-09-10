/**
 * op-sqlite wrapper — single shared DB connection + forward-only migration runner.
 *
 * Spec reference: 03 §3 (Migration framework), 02 §3 (Layer 1: Platform),
 * 03 §8 (WAL journal mode).
 *
 * Usage:
 *   import { openDatabase, getDb, closeDatabase } from '@/platform/storage/sqlite';
 *   await openDatabase();          // open + set pragmas + migrate
 *   const db = getDb();             // synchronous accessor; throws if not open
 *   const res = db.executeSync('SELECT 1 as n');
 *   await closeDatabase();
 */

import { open, type DB, type QueryResult, type Scalar } from '@op-engineering/op-sqlite';

import { logger } from '@/shared/log';
import { err, ok, type Result } from '@/shared/result';

import { MIGRATIONS } from './migrations';

/** Logical DB file name (without extension). The actual file is `olympian.db`. */
export const DATABASE_NAME = 'olympian';

/** Schema-versioning table name. Created lazily by the migration runner. */
const SCHEMA_VERSION_TABLE = 'schema_version';

/** Tracks whether a connection is currently open. */
let _db: DB | null = null;

/**
 * Open the database connection (creating the file if needed), apply
 * connection-level pragmas, and run any pending migrations. Idempotent:
 * calling twice is a no-op (returns the existing handle).
 *
 * Pragmas (spec 03 §8):
 *   - `journal_mode = WAL` — better read/write concurrency. Must run
 *     OUTSIDE a transaction (SQLite refuses to switch journal modes
 *     inside one).
 *   - `foreign_keys = ON` — enforce FK constraints (per-connection
 *     setting; SQLite defaults to OFF and silently ignores this pragma
 *     inside a transaction, so it is applied here on every open).
 *
 * @returns Result with the open DB handle on success, or an Error on failure.
 */
export async function openDatabase(
  options?: { name?: string; location?: string },
): Promise<Result<DB, Error>> {
  if (_db) {
    return ok(_db);
  }

  try {
    const name = options?.name ?? DATABASE_NAME;
    const db = open({ name, location: options?.location });
    _db = db;
    logger.info(`[sqlite] opened database "${name}"`);

    const pragmaResult = await applyConnectionPragmas(db);
    if (!pragmaResult.ok) {
      try {
        db.close();
      } catch (closeErr) {
        logger.warn('[sqlite] failed to close after pragma failure', closeErr);
      }
      _db = null;
      return pragmaResult;
    }

    const migrateResult = await migrate(db);
    if (!migrateResult.ok) {
      // Close the partially-opened handle so a subsequent openDatabase()
      // call can try again cleanly.
      try {
        db.close();
      } catch (closeErr) {
        logger.warn('[sqlite] failed to close after failed migration', closeErr);
      }
      _db = null;
      return migrateResult;
    }

    return ok(db);
  } catch (e) {
    _db = null;
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Apply connection-level pragmas. MUST be called before any transaction
 * is active on the connection (see doc comment on {@link openDatabase}).
 */
async function applyConnectionPragmas(db: DB): Promise<Result<true, Error>> {
  try {
    const walResult = await db.execute('PRAGMA journal_mode = WAL');
    const row = (walResult.rows ?? [])[0] as Record<string, Scalar> | undefined;
    const mode = typeof row?.journal_mode === 'string' ? row.journal_mode : String(row?.journal_mode ?? '?');
    if (mode.toLowerCase() !== 'wal') {
      logger.warn(`[sqlite] journal_mode is "${mode}" (expected wal)`);
    }
    await db.execute('PRAGMA foreign_keys = ON');
    logger.info('[sqlite] pragmas applied (journal_mode=wal, foreign_keys=on)');
    return ok(true);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger.error('[sqlite] failed to apply connection pragmas', error);
    return err(error);
  }
}

/**
 * Run all pending migrations forward. Idempotent: re-running on a fully
 * migrated database is a no-op.
 *
 * Algorithm (spec 03 §3):
 *   1. CREATE TABLE IF NOT EXISTS schema_version (version, applied_at)
 *   2. SELECT MAX(version) FROM schema_version  →  currentVersion
 *   3. For each migration whose version > currentVersion:
 *        BEGIN TRANSACTION
 *          run migration's `up()` statements
 *          INSERT INTO schema_version
 *        COMMIT (or ROLLBACK on failure)
 *
 * Each migration runs in its OWN transaction, and the schema-version row
 * is recorded inside that same transaction — so a migration's DDL and its
 * version bump commit or roll back atomically. A failed migration aborts
 * the run; earlier migrations stay applied (the DB is left at the last
 * good version, and a later retry resumes from there).
 *
 * Migrations must not open nested transactions — the `Migration.up()`
 * signature only accepts a plain statement executor, so nesting is
 * impossible by construction.
 */
export async function migrate(db: DB): Promise<Result<number, Error>> {
  try {
    // 1. Ensure schema_version table exists.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA_VERSION_TABLE} (
        version    INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    // 2. Read the current applied version.
    const currentResult = await db.execute(
      `SELECT MAX(version) as v FROM ${SCHEMA_VERSION_TABLE}`,
    );
    const currentVersion = readMaxVersion(currentResult);

    // 3. Determine pending migrations.
    const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
    if (pending.length === 0) {
      logger.info(`[sqlite] no pending migrations (at v${currentVersion})`);
      return ok(currentVersion);
    }

    // 4. Apply each pending migration in its own transaction.
    for (const m of pending) {
      logger.info(`[sqlite] applying migration v${m.version} — ${m.description}`);
      await db.transaction(async (tx) => {
        await m.up(tx);
        await tx.execute(
          `INSERT INTO ${SCHEMA_VERSION_TABLE} (version, applied_at) VALUES (?, ?)`,
          [m.version, Date.now()],
        );
      });
    }

    const finalVersion = pending[pending.length - 1]!.version;
    logger.info(`[sqlite] migrations complete (at v${finalVersion})`);
    return ok(finalVersion);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    logger.error('[sqlite] migration failed', error);
    return err(error);
  }
}

/**
 * Synchronous accessor for the open DB handle. Throws if `openDatabase()`
 * has not been called (or has been closed). Intended for hot-path reads
 * via `executeSync()` — see spec 03 §8 ("Reads are synchronous via JSI").
 */
export function getDb(): DB {
  if (!_db) {
    throw new Error(
      'Database is not open. Call await openDatabase() before getDb().',
    );
  }
  return _db;
}

/** True if a DB connection is currently open. */
export function isDbOpen(): boolean {
  return _db !== null;
}

/** Close the current DB connection (if any). Safe to call when not open. */
export function closeDatabase(): void {
  if (_db) {
    try {
      _db.close();
    } catch (e) {
      logger.warn('[sqlite] error closing database', e);
    }
    _db = null;
    logger.info('[sqlite] database closed');
  }
}

/**
 * Read the highest applied schema version from a
 * `SELECT MAX(version) as v FROM schema_version` query result.
 *
 * op-sqlite returns rows as an array of plain objects, so we look for the
 * `v` field on the first row. Returns 0 if the table is empty or the query
 * returned no rows.
 */
function readMaxVersion(result: QueryResult): number {
  const rows = result.rows ?? [];
  if (rows.length === 0) {
    return 0;
  }
  const first = rows[0] as Record<string, Scalar> | undefined;
  const value = first?.v;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 0;
}
