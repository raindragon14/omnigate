import type { Database } from "bun:sqlite";

import type { ProviderStatsRepository } from "../shared/signatures";
import { DEFAULT_DATABASE_PATH } from "../config/config-loader";
import { createProviderStatsRepository } from "./provider-stats.repository";
import { createSqliteDatabase, migrateSqliteDatabase } from "./sqlite.database";

let configuredDatabasePath = DEFAULT_DATABASE_PATH;
let cachedDatabase: Database | undefined;
let cachedRepository: ProviderStatsRepository | undefined;

/**
 * Points the shared stats store at a SQLite database path, closing any
 * previously opened database. Used by every feature that reads routing stats.
 * @param databasePath  SQLite database path from AppConfig.
 */
export function configureStatsStore(databasePath: string): void {
  if (databasePath === configuredDatabasePath && cachedRepository !== undefined) {
    return;
  }

  if (cachedDatabase !== undefined) {
    cachedDatabase.close();
  }

  configuredDatabasePath = databasePath;
  cachedDatabase = undefined;
  cachedRepository = undefined;
}

/**
 * Returns the shared provider stats repository, opening and migrating the
 * configured database on first use.
 * @returns The shared ProviderStatsRepository instance.
 */
export function getStatsStoreRepository(): ProviderStatsRepository {
  if (cachedRepository !== undefined) {
    return cachedRepository;
  }

  const database = createSqliteDatabase(configuredDatabasePath);

  migrateSqliteDatabase(database);
  cachedDatabase = database;
  cachedRepository = createProviderStatsRepository(database);
  return cachedRepository;
}

/**
 * Closes the shared stats database and drops cached handles.
 * Intended for tests; not needed in normal production use.
 */
export function resetStatsStore(): void {
  if (cachedDatabase !== undefined) {
    cachedDatabase.close();
  }

  cachedDatabase = undefined;
  cachedRepository = undefined;
}
