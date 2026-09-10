import type { QueryResult, Scalar } from '@op-engineering/op-sqlite';

/**
 * Minimal SQL executor surface a migration may use.
 *
 * Deliberately NOT the full `DB` type: migrations receive either the
 * connection's active `Transaction` (from the migration runner) — so a
 * migration can never open its own nested `db.transaction()` (SQLite
 * forbids nested `BEGIN`, and op-sqlite issues `BEGIN TRANSACTION;` per
 * `transaction()` call).
 */
export interface MigrationExecutor {
  execute(query: string, params?: Scalar[]): Promise<QueryResult>;
}

/**
 * A single forward-only schema migration.
 *
 * Migrations are *up-only*: once a version is applied, it is never removed
 * or re-run. To change schema, add a new migration with a higher version
 * number. See spec 03 §3 ("Locked rule: Never delete a migration").
 */
export interface Migration {
  /** Monotonically increasing version number. Starts at 1. */
  readonly version: number;
  /** Human-readable description of what this migration does. */
  readonly description: string;
  /**
   * Apply this migration. Should be idempotent (use `IF NOT EXISTS`) so
   * that re-runs on partially-migrated databases don't blow up.
   *
   * The migration runner executes `up()` inside a single transaction and
   * records the schema version in that SAME transaction — so each
   * migration's DDL + version bump commit or roll back atomically.
   * Implementations must NOT open their own transactions: just run
   * statements against the passed executor.
   */
  up: (tx: MigrationExecutor) => Promise<void>;
}
