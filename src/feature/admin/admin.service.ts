import type {
  ProviderStatsRecord,
  ProviderStatsSnapshot,
  StatsSnapshotResponse,
} from "../../shared/signatures";
import { formatStatsDay } from "../../storage/provider-stats.repository";
import { getStatsStoreRepository } from "../../storage/stats-store";

/**
 * Returns today's routing stats snapshot (or one UTC day when given).
 * Active cooldowns are visible as future `cooldown_until` values on today's rows.
 * @param day  Optional UTC day key (YYYY-MM-DD); defaults to today.
 * @returns Snapshot with the UTC day and its provider rows.
 */
export function getStatsSnapshot(day?: string): StatsSnapshotResponse {
  const targetDay = day ?? formatStatsDay(Date.now());
  const records = getStatsStoreRepository().listProviderStats(targetDay);

  return { day: targetDay, data: records.map(toStatsSnapshot) };
}

function toStatsSnapshot(record: ProviderStatsRecord): ProviderStatsSnapshot {
  return {
    provider_id: record.providerId,
    model_family: record.modelFamily,
    day: record.day,
    request_count: record.requestCount,
    token_count: record.tokenCount,
    input_token_count: record.inputTokenCount,
    output_token_count: record.outputTokenCount,
    total_cost_usd: record.totalCostUsd,
    success_count: record.successCount,
    failure_count: record.failureCount,
    rate_limit_count: record.rateLimitCount,
    avg_latency_ms: record.avgLatencyMs ?? null,
    avg_tokens_per_second: record.avgTokensPerSecond ?? null,
    avg_time_to_first_token_ms: record.avgTimeToFirstTokenMs ?? null,
    cooldown_until: record.cooldownUntil ?? null,
  };
}
