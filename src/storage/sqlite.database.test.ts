import { describe, expect, test } from "bun:test";

import { createSqliteDatabase, migrateSqliteDatabase } from "./sqlite.database";

const MEMORY_DATABASE_PATH = ":memory:";

type TableRow = {
  name: string;
};

type ColumnRow = {
  name: string;
};

/** Unit tests for SQLite database setup. */
describe("sqlite database", () => {
  /** Should create the provider_stats table. */
  test("migrates provider stats schema", () => {
    const database = createSqliteDatabase(MEMORY_DATABASE_PATH);

    migrateSqliteDatabase(database);

    const row = database
      .query<TableRow, []>("SELECT name FROM sqlite_master WHERE name = 'provider_stats'")
      .get();

    expect(row?.name).toBe("provider_stats");
    database.close();
  });

  /** Should allow migrations to run more than once. */
  test("migration is idempotent", () => {
    const database = createSqliteDatabase(MEMORY_DATABASE_PATH);

    migrateSqliteDatabase(database);
    migrateSqliteDatabase(database);

    const row = database
      .query<TableRow, []>("SELECT name FROM sqlite_master WHERE name = 'provider_stats'")
      .get();

    expect(row?.name).toBe("provider_stats");
    database.close();
  });

  /** Should include time-to-first-token stats column. */
  test("migrates time to first token column", () => {
    const database = createSqliteDatabase(MEMORY_DATABASE_PATH);

    migrateSqliteDatabase(database);

    const rows = database.query<ColumnRow, []>("PRAGMA table_info(provider_stats)").all();

    expect(rows.some((row) => row.name === "avg_time_to_first_token_ms")).toBe(true);
    database.close();
  });

  /** Should include token-split and cost stats columns. */
  test("migrates token split and cost columns", () => {
    const database = createSqliteDatabase(MEMORY_DATABASE_PATH);

    migrateSqliteDatabase(database);

    const rows = database.query<ColumnRow, []>("PRAGMA table_info(provider_stats)").all();
    const names = rows.map((row) => row.name);

    expect(names).toContain("input_token_count");
    expect(names).toContain("output_token_count");
    expect(names).toContain("total_cost_usd");
    database.close();
  });

  /** Should backfill token-split and cost columns on pre-existing databases. */
  test("backfills token split and cost columns on legacy schema", () => {
    const database = createSqliteDatabase(MEMORY_DATABASE_PATH);

    database.exec(`
      CREATE TABLE provider_stats (
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
      INSERT INTO provider_stats (provider_id, model_family, day, request_count)
        VALUES ('legacy', 'chat-fast', '2026-01-01', 3);
    `);

    migrateSqliteDatabase(database);

    const row = database
      .query<{ input_token_count: number; output_token_count: number; total_cost_usd: number }, []>(
        "SELECT input_token_count, output_token_count, total_cost_usd FROM provider_stats WHERE provider_id = 'legacy'",
      )
      .get();

    expect(row?.input_token_count).toBe(0);
    expect(row?.output_token_count).toBe(0);
    expect(row?.total_cost_usd).toBe(0);
    database.close();
  });
});
