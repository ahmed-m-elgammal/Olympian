/**
 * Tests for the SQLite migration framework (spec 03 §3).
 *
 * These tests verify that:
 *   1. The v1 migration creates all 14 spec-required tables.
 *   2. The v1 migration creates all 13 spec-required indexes.
 *   3. The migration runner updates `schema_version` to 1 after applying.
 *   4. The migration is idempotent — running `migrate()` twice is a no-op
 *      and the table set stays the same.
 *
 * We mock `@op-engineering/op-sqlite` with a minimal in-memory parser
 * that tracks CREATE TABLE / CREATE INDEX statements and answers the
 * small set of SELECTs the migration runner uses (`MAX(version)`,
 * `sqlite_master`). This lets us assert on the DDL the migration emits
 * without needing a real SQLite native module.
 */

import type {
  DB,
  QueryResult,
  Scalar,
  Transaction,
} from '@op-engineering/op-sqlite';

import { closeDatabase, getDb, migrate, openDatabase } from '@/platform/storage/sqlite';
import { V1_STATEMENTS } from '@/platform/storage/migrations/v1';

// ---------------------------------------------------------------------------
// Expected schema (spec 03 §4)
// ---------------------------------------------------------------------------

const EXPECTED_TABLES = [
  'schema_version', // created by the runner itself
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
] as const;

const EXPECTED_INDEXES = [
  'idx_saves_last_played',
  'idx_companions_save',
  'idx_companions_slot',
  'idx_items_category',
  'idx_items_rarity',
  'idx_inventory_save',
  'idx_inventory_unique',
  'idx_equipment_unique',
  'idx_progress_unique',
  'idx_progress_act',
  'idx_dialogues_save',
  'idx_event_log_seq',
  'idx_event_log_type',
] as const;

// ---------------------------------------------------------------------------
// Fake op-sqlite implementation
// ---------------------------------------------------------------------------

interface FakeRow {
  [key: string]: Scalar;
}

class FakeDB implements DB {
  private tables = new Set<string>();
  private indexes = new Set<string>();
  private schemaVersionRows: Array<{ version: number; applied_at: number }> =
    [];
  private _closed = false;

  /** Captured raw statement list — exposed for white-box assertions. */
  readonly executedStatements: string[] = [];

  get isClosed(): boolean {
    return this._closed;
  }

  // -- Required DB interface methods --------------------------------------

  execute = async (query: string, params?: Scalar[]): Promise<QueryResult> => {
    return this._run(query, params);
  };

  executeSync = (query: string, params?: Scalar[]): QueryResult => {
    return this._run(query, params);
  };

  transaction = async (fn: (tx: Transaction) => Promise<void>): Promise<void> => {
    const tx: Transaction = {
      execute: this.execute,
      commit: async () => ({ rowsAffected: 0, rows: [] }),
      rollback: async () => ({ rowsAffected: 0, rows: [] }),
    };
    await fn(tx);
  };

  close = (): void => {
    this._closed = true;
  };

  // The following methods on the DB interface are unused by the migration
  // runner — stubs are here only to satisfy the type.
  delete = (_location?: string): void => {
    /* no-op */
  };
  attach = (
    _mainDbName: string,
    _dbNameToAttach: string,
    _alias: string,
    _location?: string,
  ): void => {
    /* no-op */
  };
  detach = (_mainDbName: string, _alias: string): void => {
    /* no-op */
  };
  executeWithHostObjects = async (
    _query: string,
    _params?: Scalar[],
  ): Promise<QueryResult> => ({ rowsAffected: 0, rows: [] });
  executeBatch = async (): Promise<{ rowsAffected?: number }> => ({
    rowsAffected: 0,
  });
  loadFile = async (): Promise<{ rowsAffected?: number; commands?: number }> => ({
    rowsAffected: 0,
    commands: 0,
  });
  updateHook = (): void => {
    /* no-op */
  };
  commitHook = (): void => {
    /* no-op */
  };
  rollbackHook = (): void => {
    /* no-op */
  };
  prepareStatement = (): {
    bind: (_params: unknown[]) => Promise<void>;
    execute: () => Promise<QueryResult>;
  } => ({
    bind: async () => undefined,
    execute: async () => ({ rowsAffected: 0, rows: [] }),
  });
  loadExtension = (): void => {
    /* no-op */
  };
  executeRaw = async (): Promise<unknown[]> => [];
  getDbPath = (_location?: string): string => '/tmp/olympian.db';
  reactiveExecute = (): (() => void) => () => undefined;
  sync = (): void => {
    /* no-op */
  };
  flushPendingReactiveQueries = async (): Promise<void> => undefined;

  // -- Internal SQL parser ------------------------------------------------

  private _run(query: string, params?: Scalar[]): QueryResult {
    this.executedStatements.push(query);
    const q = query.trim();

    // CREATE TABLE
    const createTable = q.match(
      /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(["`[]?)(\w+)\1/i,
    );
    if (createTable) {
      this.tables.add(createTable[2]!.toLowerCase());
      return { rowsAffected: 0, rows: [] };
    }

    // CREATE [UNIQUE] INDEX
    const createIndex = q.match(
      /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(["`[]?)(\w+)\1/i,
    );
    if (createIndex) {
      this.indexes.add(createIndex[2]!.toLowerCase());
      return { rowsAffected: 0, rows: [] };
    }

    // INSERT INTO schema_version
    if (/^INSERT\s+INTO\s+schema_version/i.test(q)) {
      const version = (params?.[0] as number) ?? 0;
      const appliedAt = (params?.[1] as number) ?? Date.now();
      this.schemaVersionRows.push({ version, applied_at: appliedAt });
      return {
        rowsAffected: 1,
        insertId: this.schemaVersionRows.length,
        rows: [],
      };
    }

    // SELECT MAX(version) as v FROM schema_version
    if (/^SELECT\s+MAX\s*\(\s*version\s*\)\s+as\s+v\s+FROM\s+schema_version/i.test(q)) {
      const maxV = this.schemaVersionRows.reduce(
        (m, r) => Math.max(m, r.version),
        0,
      );
      return { rowsAffected: 0, rows: [{ v: maxV }] as FakeRow[] };
    }

    // SELECT name FROM sqlite_master WHERE type = ?
    if (/^SELECT\s+.*\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*\?/i.test(q)) {
      const type = (params?.[0] as string) ?? 'table';
      const names =
        type === 'table'
          ? Array.from(this.tables)
          : Array.from(this.indexes);
      return {
        rowsAffected: 0,
        rows: names.map((name) => ({ name })) as FakeRow[],
      };
    }

    // PRAGMA / BEGIN / COMMIT / ROLLBACK / SET
    if (/^(PRAGMA|BEGIN|COMMIT|ROLLBACK|SET)\b/i.test(q)) {
      return { rowsAffected: 0, rows: [] };
    }

    // Default: return empty result so unknown queries don't crash.
    return { rowsAffected: 0, rows: [] };
  }

  // -- Test-only introspection -------------------------------------------

  getTables(): string[] {
    return Array.from(this.tables);
  }

  getIndexes(): string[] {
    return Array.from(this.indexes);
  }

  getAppliedVersion(): number {
    return this.schemaVersionRows.reduce((m, r) => Math.max(m, r.version), 0);
  }
}

// ---------------------------------------------------------------------------
// jest mock setup
// ---------------------------------------------------------------------------

// Jest hoists jest.mock() calls above imports. The mock factory may not
// reference out-of-scope variables, *except* those prefixed with `mock`.
// We expose the singleton via a getter that reads from `globalThis` so
// the factory can stay clean.
const mockFakeDb = new FakeDB();
(globalThis as unknown as { __mockOpSqliteDb: FakeDB }).__mockOpSqliteDb =
  mockFakeDb;

jest.mock('@op-engineering/op-sqlite', () => ({
  open: (_opts: { name: string; location?: string }): DB =>
    (globalThis as unknown as { __mockOpSqliteDb: FakeDB }).__mockOpSqliteDb,
}));

// Reset state between tests. Order matters: call `closeDatabase()` first
// (which may call `mockFakeDb.close()` and set `_closed = true`), THEN
// reset the mock's internal fields.
beforeEach(() => {
  closeDatabase();
  (mockFakeDb as unknown as { tables: Set<string> }).tables = new Set();
  (mockFakeDb as unknown as { indexes: Set<string> }).indexes = new Set();
  (
    mockFakeDb as unknown as {
      schemaVersionRows: Array<{ version: number; applied_at: number }>;
    }
  ).schemaVersionRows = [];
  (mockFakeDb as unknown as { executedStatements: string[] }).executedStatements.length = 0;
  (mockFakeDb as unknown as { _closed: boolean })._closed = false;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SQLite migration runner (spec 03 §3, §4)', () => {
  it('creates all 14 spec-required tables on a fresh database', async () => {
    const result = await openDatabase();
    expect(result.ok).toBe(true);

    const tables = mockFakeDb.getTables();
    for (const t of EXPECTED_TABLES) {
      expect(tables).toContain(t.toLowerCase());
    }
    // Exactly the spec tables (+schema_version) — no extras.
    expect(tables.sort()).toEqual(
      Array.from(EXPECTED_TABLES).map((t) => t.toLowerCase()).sort(),
    );
  });

  it('creates all 13 spec-required indexes', async () => {
    const result = await openDatabase();
    expect(result.ok).toBe(true);

    const indexes = mockFakeDb.getIndexes();
    for (const idx of EXPECTED_INDEXES) {
      expect(indexes).toContain(idx.toLowerCase());
    }
    expect(indexes.length).toBe(EXPECTED_INDEXES.length);
  });

  it('updates schema_version to 1 after the v1 migration applies', async () => {
    const result = await openDatabase();
    expect(result.ok).toBe(true);
    expect(mockFakeDb.getAppliedVersion()).toBe(1);
  });

  it('is idempotent — running migrate() twice does not duplicate tables', async () => {
    const first = await migrate(mockFakeDb);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value).toBe(1);
    }
    const tablesAfterFirst = mockFakeDb.getTables().slice().sort();
    const indexesAfterFirst = mockFakeDb.getIndexes().slice().sort();

    const second = await migrate(mockFakeDb);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value).toBe(1); // still 1, no new migrations applied
    }

    const tablesAfterSecond = mockFakeDb.getTables().slice().sort();
    const indexesAfterSecond = mockFakeDb.getIndexes().slice().sort();

    expect(tablesAfterSecond).toEqual(tablesAfterFirst);
    expect(indexesAfterSecond).toEqual(indexesAfterFirst);
  });

  it('schema_version table itself is created before the first migration runs', async () => {
    await openDatabase();
    expect(mockFakeDb.getTables()).toContain('schema_version');
  });

  it('the v1 migration emits exactly one statement per DDL line', async () => {
    await openDatabase();
    // Count of CREATE TABLE + CREATE INDEX statements. Expected:
    //   - 1 from the runner (schema_version)
    //   - 13 tables + 13 indexes from v1 = 26
    //   - Total: 27 CREATE statements.
    const createCount = mockFakeDb.executedStatements.filter((s) =>
      /^\s*CREATE\s+(TABLE|UNIQUE\s+INDEX|INDEX)\b/i.test(s),
    ).length;
    expect(createCount).toBe(27);
    // And the v1 statements array itself contains exactly 26 entries
    // (13 tables + 13 indexes). Connection pragmas are applied by
    // openDatabase(), NOT by the migration — pragmas cannot run inside
    // a transaction (journal_mode would fail, foreign_keys is a no-op).
    expect(V1_STATEMENTS.length).toBe(26);
    expect(V1_STATEMENTS.some((s) => /^\s*PRAGMA/i.test(s))).toBe(false);
  });

  it('applies connection pragmas on open, before any transaction', async () => {
    await openDatabase();
    const statements = mockFakeDb.executedStatements;
    const walIdx = statements.findIndex((s) => /PRAGMA\s+journal_mode\s*=\s*WAL/i.test(s));
    const fkIdx = statements.findIndex((s) => /PRAGMA\s+foreign_keys\s*=\s*ON/i.test(s));
    expect(walIdx).toBeGreaterThanOrEqual(0);
    expect(fkIdx).toBeGreaterThan(walIdx); // WAL first, then foreign_keys

    // Both pragmas must run BEFORE the migration transaction's DDL
    // (the first CREATE TABLE). Regressions here reproduce the bug where
    // `foreign_keys = ON` inside a transaction was silently ignored.
    const firstCreateIdx = statements.findIndex((s) => /^\s*CREATE\s+TABLE/i.test(s));
    expect(fkIdx).toBeLessThan(firstCreateIdx);
  });

  it('never nests transactions — each migration runs in exactly one', async () => {
    // The migration runner passes its `Transaction` executor to up();
    // migrations must not call `transaction()` themselves (SQLite
    // forbids nested BEGIN). We assert structurally: the v1 migration
    // receives an executor, and the fake DB sees no second BEGIN issued
    // by migration code (op-sqlite would throw on a real device).
    let transactionCalls = 0;
    const originalTransaction = mockFakeDb.transaction.bind(mockFakeDb);
    Object.defineProperty(mockFakeDb, 'transaction', {
      value: async (fn: (tx: unknown) => Promise<void>) => {
        transactionCalls += 1;
        return originalTransaction(fn as never);
      },
      configurable: true,
    });
    try {
      const result = await openDatabase();
      expect(result.ok).toBe(true);
      // Exactly one transaction for the single v1 migration.
      expect(transactionCalls).toBe(1);
    } finally {
      Object.defineProperty(mockFakeDb, 'transaction', {
        value: originalTransaction,
        configurable: true,
      });
    }
  });

  it('records the schema version inside the migration transaction', async () => {
    await openDatabase();
    const statements = mockFakeDb.executedStatements;
    // The INSERT INTO schema_version for v1 must come after all v1 DDL
    // (it's part of the same transaction callback).
    const lastCreateIdx = statements.reduce((last, s, i) => (/^\s*CREATE\s+TABLE/i.test(s) ? i : last), -1);
    const insertIdx = statements.findIndex((s) => /^INSERT\s+INTO\s+schema_version/i.test(s));
    expect(insertIdx).toBeGreaterThan(lastCreateIdx);
  });

  it('getDb() throws when the database has not been opened', () => {
    closeDatabase();
    expect(() => {
      getDb();
    }).toThrow(/not open/i);
  });

  it('getDb() returns the open handle after openDatabase() succeeds', async () => {
    await openDatabase();
    const db = getDb();
    expect(db).toBe(mockFakeDb);
  });

  it('closeDatabase() closes the underlying connection', async () => {
    await openDatabase();
    expect(mockFakeDb.isClosed).toBe(false);
    closeDatabase();
    expect(mockFakeDb.isClosed).toBe(true);
  });
});
