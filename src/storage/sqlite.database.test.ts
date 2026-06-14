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

    const row = database.query<TableRow, []>("SELECT name FROM sqlite_master WHERE name = 'provider_stats'").get();

    expect(row?.name).toBe("provider_stats");
    database.close();
  });

  /** Should allow migrations to run more than once. */
  test("migration is idempotent", () => {
    const database = createSqliteDatabase(MEMORY_DATABASE_PATH);

    migrateSqliteDatabase(database);
    migrateSqliteDatabase(database);

    const row = database.query<TableRow, []>("SELECT name FROM sqlite_master WHERE name = 'provider_stats'").get();

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
});
