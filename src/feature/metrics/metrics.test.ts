import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";

import type { ProviderStatsRecord } from "../../shared/signatures";
import { createApp } from "../../app";
import { DEFAULT_PORT } from "../../config/config-loader";
import { HTTP_STATUS_OK, HTTP_STATUS_UNAUTHORIZED } from "../../shared/http-status";
import { formatStatsDay } from "../../storage/provider-stats.repository";
import { getStatsStoreRepository } from "../../storage/stats-store";
import { resetChatCompletionRoutingState } from "../chat-completion/chat-completion.service";
import { formatPrometheusMetrics } from "./metrics.service";

const METRICS_PATH = "/metrics";
const TEST_OMNIGATE_API_KEY = "test-omnigate-key";
const AUTH_HEADERS = { Authorization: `Bearer ${TEST_OMNIGATE_API_KEY}` };
const TEST_APP_CONFIG = {
  port: DEFAULT_PORT,
  omnigateApiKey: TEST_OMNIGATE_API_KEY,
  databasePath: ":memory:",
  logBodies: false,
};
const SEEDED_PROVIDER_ID = "metrics_test_provider";
const DAY = "2026-01-02";

function makeRecord(overrides: Partial<ProviderStatsRecord> = {}): ProviderStatsRecord {
  return {
    providerId: SEEDED_PROVIDER_ID,
    modelFamily: "chat-fast",
    day: DAY,
    requestCount: 4,
    tokenCount: 100,
    inputTokenCount: 60,
    outputTokenCount: 40,
    totalCostUsd: 0.000_01,
    successCount: 3,
    failureCount: 1,
    rateLimitCount: 0,
    avgLatencyMs: 250,
    avgTokensPerSecond: 40,
    avgTimeToFirstTokenMs: 50,
    cooldownUntil: undefined,
    ...overrides,
  };
}

/** Unit and integration tests for Prometheus metrics. */
describe("metrics", () => {
  describe("formatPrometheusMetrics", () => {
    /** Should expose per-provider counters with bounded labels. */
    test("exposes provider counters", () => {
      const text = formatPrometheusMetrics([makeRecord()], DAY);

      expect(text).toContain(
        `omnigate_provider_requests_total{provider_id="${SEEDED_PROVIDER_ID}",model_family="chat-fast"} 4`,
      );
      expect(text).toContain(
        `omnigate_provider_cost_usd_total{provider_id="${SEEDED_PROVIDER_ID}",model_family="chat-fast"} 0.00001`,
      );
      expect(text).toContain(`omnigate_scrape_info{day="${DAY}"} 1`);
      expect(text.endsWith("\n")).toBe(true);
    });

    /** Should skip series without a recorded value. */
    test("skips undefined averages", () => {
      const text = formatPrometheusMetrics([makeRecord({ avgLatencyMs: undefined })], DAY);

      expect(text).not.toContain("omnigate_provider_avg_latency_ms{");
      expect(text).toContain("# HELP omnigate_provider_avg_latency_ms");
    });

    /** Should escape label values. */
    test("escapes label values", () => {
      const text = formatPrometheusMetrics([makeRecord({ providerId: 'we"ird' })], DAY);

      expect(text).toContain('provider_id="we\\"ird"');
    });
  });

  describe("GET /metrics", () => {
    let app: Hono;

    beforeAll(() => {
      app = createApp(TEST_APP_CONFIG);
    });

    afterEach(() => {
      resetChatCompletionRoutingState();
    });

    /** Should require authentication. */
    test("rejects unauthenticated scrapes", async () => {
      const response = await app.request(METRICS_PATH);

      expect(response.status).toBe(HTTP_STATUS_UNAUTHORIZED);
    });

    /** Should serve exposition format with today's stats. */
    test("serves metrics with the request id header", async () => {
      getStatsStoreRepository().recordProviderAttempt({
        providerId: SEEDED_PROVIDER_ID,
        modelFamily: "chat-fast",
        status: "success",
        latencyMs: 100,
        tokenCount: 10,
        nowMs: Date.now(),
      });

      const response = await app.request(METRICS_PATH, { headers: AUTH_HEADERS });
      const today = formatStatsDay(Date.now());

      expect(response.status).toBe(HTTP_STATUS_OK);
      expect(response.headers.get("content-type")).toContain("text/plain; version=0.0.4");
      expect(response.headers.get("x-request-id")).toBeTruthy();

      const text = await response.text();

      expect(text).toContain(`omnigate_scrape_info{day="${today}"} 1`);
      expect(text).toContain(
        `omnigate_provider_requests_total{provider_id="${SEEDED_PROVIDER_ID}",model_family="chat-fast"} 1\n`,
      );
    });
  });
});
