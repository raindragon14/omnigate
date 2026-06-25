import type { Database, Statement } from "bun:sqlite";

import type {
  ProviderAttemptStatus,
  ProviderStatsRecord,
  ProviderStatsRepository,
  ProviderStatsUpdate,
} from "../shared/signatures";

const DAY_SLICE_START = 0;
const DAY_SLICE_END = 10;
const STATUS_SUCCESS: ProviderAttemptStatus = "success";
const STATUS_RATE_LIMITED: ProviderAttemptStatus = "rate_limited";

type ProviderStatsRow = {
  provider_id: string;
  model_family: string;
  day: string;
  request_count: number;
  token_count: number;
  success_count: number;
  failure_count: number;
  rate_limit_count: number;
  avg_latency_ms: number | null;
  avg_tokens_per_second: number | null;
  avg_time_to_first_token_ms: number | null;
  cooldown_until: number | null;
};

type PreparedStatements = {
  getStats: Statement<ProviderStatsRow, [string, string, string]>;
  getCooldown: Statement<{ cooldown_until: number | null }, [string, string]>;
  upsertStats: Statement<unknown, [string, string, string, number, number, number, number, number, number | null, number | null, number | null, number | null]>;
};

/**
 * Creates a provider stats repository backed by SQLite.
 * @param database  Open SQLite database connection.
 * @returns A ProviderStatsRepository instance.
 */
export function createProviderStatsRepository(database: Database): ProviderStatsRepository {
  const statements = prepareStatements(database);

  return {
    getProviderStats: (providerId, modelFamily, day) => getProviderStats(statements, providerId, modelFamily, day),
    recordProviderAttempt: (update) => recordProviderAttempt(database, statements, update),
    getCooldownUntil: (providerId, modelFamily) => getCooldownUntil(statements, providerId, modelFamily),
  };
}

function prepareStatements(database: Database): PreparedStatements {
  return {
    getStats: database.query<ProviderStatsRow, [string, string, string]>(`
      SELECT * FROM provider_stats WHERE provider_id = ? AND model_family = ? AND day = ?
    `),
    getCooldown: database.query<{ cooldown_until: number | null }, [string, string]>(`
      SELECT MAX(cooldown_until) AS cooldown_until FROM provider_stats WHERE provider_id = ? AND model_family = ?
    `),
    upsertStats: database.query(`
      INSERT INTO provider_stats (
        provider_id, model_family, day, request_count, token_count, success_count,
        failure_count, rate_limit_count, avg_latency_ms, avg_tokens_per_second,
        avg_time_to_first_token_ms, cooldown_until
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, model_family, day) DO UPDATE SET
        request_count = excluded.request_count,
        token_count = excluded.token_count,
        success_count = excluded.success_count,
        failure_count = excluded.failure_count,
        rate_limit_count = excluded.rate_limit_count,
        avg_latency_ms = excluded.avg_latency_ms,
        avg_tokens_per_second = excluded.avg_tokens_per_second,
        avg_time_to_first_token_ms = excluded.avg_time_to_first_token_ms,
        cooldown_until = excluded.cooldown_until
    `),
  };
}

/**
 * Formats a timestamp as the UTC day key used by provider stats rows.
 * @param nowMs  Timestamp in milliseconds.
 * @returns A YYYY-MM-DD UTC day string.
 */
export function formatStatsDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(DAY_SLICE_START, DAY_SLICE_END);
}

function getProviderStats(
  statements: PreparedStatements,
  providerId: string,
  modelFamily: string,
  day: string,
): ProviderStatsRecord | undefined {
  const row = statements.getStats.get(providerId, modelFamily, day);

  return row === null ? undefined : toStatsRecord(row);
}

function recordProviderAttempt(
  database: Database,
  statements: PreparedStatements,
  update: ProviderStatsUpdate,
): void {
  const day = formatStatsDay(update.nowMs);

  database.transaction(() => {
    const current = getProviderStats(statements, update.providerId, update.modelFamily, day);
    const next = applyStatsUpdate(current, update, day);

    saveProviderStats(statements, next);
  })();
}

function getCooldownUntil(
  statements: PreparedStatements,
  providerId: string,
  modelFamily: string,
): number | undefined {
  const row = statements.getCooldown.get(providerId, modelFamily);

  return row?.cooldown_until ?? undefined;
}

function applyStatsUpdate(
  current: ProviderStatsRecord | undefined,
  update: ProviderStatsUpdate,
  day: string,
): ProviderStatsRecord {
  const requestCount = (current?.requestCount ?? 0) + 1;

  return {
    providerId: update.providerId,
    modelFamily: update.modelFamily,
    day,
    requestCount,
    tokenCount: (current?.tokenCount ?? 0) + (update.tokenCount ?? 0),
    successCount: (current?.successCount ?? 0) + successIncrement(update.status),
    failureCount: (current?.failureCount ?? 0) + failureIncrement(update.status),
    rateLimitCount: (current?.rateLimitCount ?? 0) + rateLimitIncrement(update.status),
    avgLatencyMs: calculateAverage(current?.avgLatencyMs, current?.requestCount ?? 0, update.latencyMs),
    avgTokensPerSecond: calculateAverage(
      current?.avgTokensPerSecond,
      current?.requestCount ?? 0,
      update.tokensPerSecond,
    ),
    avgTimeToFirstTokenMs: calculateAverage(
      current?.avgTimeToFirstTokenMs,
      current?.requestCount ?? 0,
      update.timeToFirstTokenMs,
    ),
    cooldownUntil: update.cooldownUntil ?? current?.cooldownUntil,
  };
}

function saveProviderStats(statements: PreparedStatements, record: ProviderStatsRecord): void {
  statements.upsertStats.run(
    record.providerId,
    record.modelFamily,
    record.day,
    record.requestCount,
    record.tokenCount,
    record.successCount,
    record.failureCount,
    record.rateLimitCount,
    record.avgLatencyMs ?? null,
    record.avgTokensPerSecond ?? null,
    record.avgTimeToFirstTokenMs ?? null,
    record.cooldownUntil ?? null,
  );
}

function toStatsRecord(row: ProviderStatsRow): ProviderStatsRecord {
  return {
    providerId: row.provider_id,
    modelFamily: row.model_family,
    day: row.day,
    requestCount: row.request_count,
    tokenCount: row.token_count,
    successCount: row.success_count,
    failureCount: row.failure_count,
    rateLimitCount: row.rate_limit_count,
    avgLatencyMs: row.avg_latency_ms ?? undefined,
    avgTokensPerSecond: row.avg_tokens_per_second ?? undefined,
    avgTimeToFirstTokenMs: row.avg_time_to_first_token_ms ?? undefined,
    cooldownUntil: row.cooldown_until ?? undefined,
  };
}

function calculateAverage(
  current: number | undefined,
  sampleCount: number,
  sample: number | undefined,
): number | undefined {
  if (sample === undefined) {
    return current;
  }

  return current === undefined ? sample : ((current * sampleCount) + sample) / (sampleCount + 1);
}

function successIncrement(status: ProviderAttemptStatus): number {
  return status === STATUS_SUCCESS ? 1 : 0;
}

function failureIncrement(status: ProviderAttemptStatus): number {
  return status === STATUS_SUCCESS ? 0 : 1;
}

function rateLimitIncrement(status: ProviderAttemptStatus): number {
  return status === STATUS_RATE_LIMITED ? 1 : 0;
}
