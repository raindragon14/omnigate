import { mkdirSync } from "fs";
import { dirname } from "path";
import { Database } from "bun:sqlite";

const MEMORY_DATABASE_PATH = ":memory:";
const PROVIDER_STATS_TABLE = "provider_stats";
const TTFT_COLUMN = "avg_time_to_first_token_ms";
const BUSY_TIMEOUT_MS = 5_000;

type TableColumnRow = {
  name: string;
};

/**
 * Opens a SQLite database and creates its parent directory when file-backed.
 * @param databasePath  SQLite database path or `:memory:` for tests.
 * @returns An open Bun SQLite Database instance.
 */
export function createSqliteDatabase(databasePath: string): Database {
  ensureDatabaseDirectory(databasePath);

  const database = new Database(databasePath);

  configureSqlite(database);

  return database;
}

function configureSqlite(database: Database): void {
  database.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);

  if (database.filename === MEMORY_DATABASE_PATH) {
    return;
  }

  database.exec("PRAGMA journal_mode = WAL");
}

/**
 * Applies idempotent SQLite schema migrations required by OmniGate.
 * @param database  Open SQLite database connection.
 */
export function migrateSqliteDatabase(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS provider_stats (
      provider_id TEXT NOT NULL,
      model_family TEXT NOT NULL,
      day TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      token_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      rate_limit_count INTEGER NOT NULL DEFAULT 0,
      avg_latency_ms REAL,
      avg_tokens_per_second REAL,
      avg_time_to_first_token_ms REAL,
      cooldown_until INTEGER,
      PRIMARY KEY (provider_id, model_family, day)
    );

    CREATE INDEX IF NOT EXISTS idx_provider_stats_cooldown
      ON provider_stats(provider_id, model_family, cooldown_until);
  `);

  ensureColumn(database, PROVIDER_STATS_TABLE, TTFT_COLUMN, `${TTFT_COLUMN} REAL`);
}

function ensureColumn(database: Database, tableName: string, columnName: string, definition: string): void {
  if (hasColumn(database, tableName, columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
}

function hasColumn(database: Database, tableName: string, columnName: string): boolean {
  const rows = database.query<TableColumnRow, []>(`PRAGMA table_info(${tableName})`).all();

  return rows.some((row) => row.name === columnName);
}

function ensureDatabaseDirectory(databasePath: string): void {
  if (databasePath === MEMORY_DATABASE_PATH) {
    return;
  }

  mkdirSync(dirname(databasePath), { recursive: true });
}
