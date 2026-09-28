import type { ProviderStatsRecord } from "../../shared/signatures";
import { formatStatsDay } from "../../storage/provider-stats.repository";
import { getStatsStoreRepository } from "../../storage/stats-store";

type MetricFamily = {
  name: string;
  help: string;
  value: (record: ProviderStatsRecord) => number | undefined;
};

const METRIC_FAMILIES: MetricFamily[] = [
  {
    name: "omnigate_provider_requests_total",
    help: "Total routing attempts recorded today (UTC).",
    value: (record) => record.requestCount,
  },
  {
    name: "omnigate_provider_success_total",
    help: "Successful routing attempts recorded today (UTC).",
    value: (record) => record.successCount,
  },
  {
    name: "omnigate_provider_failure_total",
    help: "Failed routing attempts recorded today (UTC).",
    value: (record) => record.failureCount,
  },
  {
    name: "omnigate_provider_rate_limit_total",
    help: "Rate-limited routing attempts recorded today (UTC).",
    value: (record) => record.rateLimitCount,
  },
  {
    name: "omnigate_provider_input_tokens_total",
    help: "Total upstream input tokens recorded today (UTC).",
    value: (record) => record.inputTokenCount,
  },
  {
    name: "omnigate_provider_output_tokens_total",
    help: "Total upstream output tokens recorded today (UTC).",
    value: (record) => record.outputTokenCount,
  },
  {
    name: "omnigate_provider_cost_usd_total",
    help: "Total upstream cost in USD recorded today (UTC); only attempts with known tariffs and usage.",
    value: (record) => record.totalCostUsd,
  },
  {
    name: "omnigate_provider_avg_latency_ms",
    help: "Average end-to-end latency in milliseconds recorded today (UTC).",
    value: (record) => record.avgLatencyMs,
  },
  {
    name: "omnigate_provider_avg_tokens_per_second",
    help: "Average completion throughput recorded today (UTC).",
    value: (record) => record.avgTokensPerSecond,
  },
  {
    name: "omnigate_provider_avg_time_to_first_token_ms",
    help: "Average streaming time to first token in milliseconds recorded today (UTC).",
    value: (record) => record.avgTimeToFirstTokenMs,
  },
];

/**
 * Returns Prometheus metrics for today's routing stats.
 * @returns Metrics exposition text for GET /metrics.
 */
export function getPrometheusMetrics(): string {
  const day = formatStatsDay(Date.now());
  const records = getStatsStoreRepository().listProviderStats(day);

  return formatPrometheusMetrics(records, day);
}

/**
 * Formats provider stats rows as Prometheus text exposition format.
 * Only request_id-free, bounded-cardinality labels are used
 * (provider_id, model_family).
 * @param records  Provider stats rows to expose.
 * @param day      UTC day the rows cover, exposed as a scrape annotation.
 * @returns Metrics text with `text/plain; version=0.0.4` semantics.
 */
export function formatPrometheusMetrics(records: ProviderStatsRecord[], day: string): string {
  const lines: string[] = [];

  for (const family of METRIC_FAMILIES) {
    lines.push(`# HELP ${family.name} ${family.help}`, `# TYPE ${family.name} gauge`);

    for (const record of records) {
      const value = family.value(record);

      if (value === undefined) {
        continue;
      }

      lines.push(
        `${family.name}{provider_id="${escapeLabelValue(record.providerId)}",model_family="${escapeLabelValue(record.modelFamily)}"} ${value}`,
      );
    }
  }

  lines.push(
    "# HELP omnigate_scrape_info UTC day covered by this scrape.",
    "# TYPE omnigate_scrape_info gauge",
    `omnigate_scrape_info{day="${escapeLabelValue(day)}"} 1`,
  );

  return `${lines.join("\n")}\n`;
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
