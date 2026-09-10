import type { DB } from '@op-engineering/op-sqlite';

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
   * Implementations should run their DDL inside a transaction for
   * atomicity; the migration runner wraps each `up()` in its own
   * transaction as well so partial failures roll back cleanly.
   */
  up: (db: DB) => Promise<void>;
}
