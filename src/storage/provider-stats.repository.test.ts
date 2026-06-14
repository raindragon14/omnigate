import { describe, expect, test } from "bun:test";

import { createProviderStatsRepository, formatStatsDay } from "./provider-stats.repository";
import { createSqliteDatabase, migrateSqliteDatabase } from "./sqlite.database";

const MEMORY_DATABASE_PATH = ":memory:";
const NOW_MS = Date.UTC(2026, 0, 2, 3, 4, 5);
const PROVIDER_ID = "opencode_zen_deepseek";
const MODEL_FAMILY = "deepseek-v4-flash";

/** Unit tests for SQLite-backed provider stats repository. */
describe("provider stats repository", () => {
  /** Should format provider stats day in UTC. */
  test("formats stats day", () => {
    expect(formatStatsDay(NOW_MS)).toBe("2026-01-02");
  });

  /** Should record a successful provider attempt. */
  test("records success attempt", () => {
    const { repository, close } = createRepository();

    repository.recordProviderAttempt({ providerId: PROVIDER_ID, modelFamily: MODEL_FAMILY, status: "success", latencyMs: 100, tokenCount: 50, tokensPerSecond: 75, nowMs: NOW_MS });

    const stats = repository.getProviderStats(PROVIDER_ID, MODEL_FAMILY, "2026-01-02");

    expect(stats?.requestCount).toBe(1);
    expect(stats?.successCount).toBe(1);
    expect(stats?.tokenCount).toBe(50);
    expect(stats?.avgTokensPerSecond).toBe(75);
    close();
  });

  /** Should record failure attempts separately from successes. */
  test("records failure attempt", () => {
    const { repository, close } = createRepository();

    repository.recordProviderAttempt({ providerId: PROVIDER_ID, modelFamily: MODEL_FAMILY, status: "failure", latencyMs: 200, nowMs: NOW_MS });

    const stats = repository.getProviderStats(PROVIDER_ID, MODEL_FAMILY, "2026-01-02");

    expect(stats?.failureCount).toBe(1);
    expect(stats?.successCount).toBe(0);
    close();
  });

  /** Should record rate limits and cooldowns. */
  test("records rate limit and cooldown", () => {
    const { repository, close } = createRepository();
    const cooldownUntil = NOW_MS + 60_000;

    repository.recordProviderAttempt({ providerId: PROVIDER_ID, modelFamily: MODEL_FAMILY, status: "rate_limited", latencyMs: 50, cooldownUntil, nowMs: NOW_MS });

    const stats = repository.getProviderStats(PROVIDER_ID, MODEL_FAMILY, "2026-01-02");

    expect(stats?.failureCount).toBe(1);
    expect(stats?.rateLimitCount).toBe(1);
    expect(repository.getCooldownUntil(PROVIDER_ID, MODEL_FAMILY)).toBe(cooldownUntil);
    close();
  });

  /** Should update cumulative averages across attempts. */
  test("updates cumulative averages", () => {
    const { repository, close } = createRepository();

    repository.recordProviderAttempt({ providerId: PROVIDER_ID, modelFamily: MODEL_FAMILY, status: "success", latencyMs: 100, tokensPerSecond: 80, nowMs: NOW_MS });
    repository.recordProviderAttempt({ providerId: PROVIDER_ID, modelFamily: MODEL_FAMILY, status: "success", latencyMs: 300, tokensPerSecond: 40, nowMs: NOW_MS });

    const stats = repository.getProviderStats(PROVIDER_ID, MODEL_FAMILY, "2026-01-02");

    expect(stats?.avgLatencyMs).toBe(200);
    expect(stats?.avgTokensPerSecond).toBe(60);
    close();
  });

  /** Should update cumulative time-to-first-token averages across attempts. */
  test("records time to first token average", () => {
    const { repository, close } = createRepository();

    repository.recordProviderAttempt({ providerId: PROVIDER_ID, modelFamily: MODEL_FAMILY, status: "success", latencyMs: 100, timeToFirstTokenMs: 40, nowMs: NOW_MS });
    repository.recordProviderAttempt({ providerId: PROVIDER_ID, modelFamily: MODEL_FAMILY, status: "success", latencyMs: 200, timeToFirstTokenMs: 80, nowMs: NOW_MS });

    const stats = repository.getProviderStats(PROVIDER_ID, MODEL_FAMILY, "2026-01-02");

    expect(stats?.avgTimeToFirstTokenMs).toBe(60);
    close();
  });

  /** Should store provider stats separately by UTC day. */
  test("separates stats by day", () => {
    const { repository, close } = createRepository();

    repository.recordProviderAttempt({ providerId: PROVIDER_ID, modelFamily: MODEL_FAMILY, status: "success", latencyMs: 100, nowMs: NOW_MS });
    repository.recordProviderAttempt({ providerId: PROVIDER_ID, modelFamily: MODEL_FAMILY, status: "success", latencyMs: 100, nowMs: NOW_MS + 86_400_000 });

    expect(repository.getProviderStats(PROVIDER_ID, MODEL_FAMILY, "2026-01-02")?.requestCount).toBe(1);
    expect(repository.getProviderStats(PROVIDER_ID, MODEL_FAMILY, "2026-01-03")?.requestCount).toBe(1);
    close();
  });
});

function createRepository() {
  const database = createSqliteDatabase(MEMORY_DATABASE_PATH);

  migrateSqliteDatabase(database);

  return {
    repository: createProviderStatsRepository(database),
    close: () => database.close(),
  };
}
