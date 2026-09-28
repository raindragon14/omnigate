import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { Hono } from "hono";

import { createApp } from "../../app";
import { DEFAULT_PORT } from "../../config/config-loader";
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_OK,
  HTTP_STATUS_UNAUTHORIZED,
} from "../../shared/http-status";
import { formatStatsDay } from "../../storage/provider-stats.repository";
import { getStatsStoreRepository } from "../../storage/stats-store";
import { resetChatCompletionRoutingState } from "../chat-completion/chat-completion.service";
import { getStatsSnapshot } from "./admin.service";

const STATS_PATH = "/v1/stats";
const CLEAR_COOLDOWNS_PATH = "/v1/admin/cooldowns/clear";
const RESET_STATS_PATH = "/v1/admin/stats/reset";
const TEST_OMNIGATE_API_KEY = "test-omnigate-key";
const AUTH_HEADERS = {
  Authorization: `Bearer ${TEST_OMNIGATE_API_KEY}`,
  "Content-Type": "application/json",
};
const TEST_APP_CONFIG = {
  port: DEFAULT_PORT,
  omnigateApiKey: TEST_OMNIGATE_API_KEY,
  databasePath: ":memory:",
  logBodies: false,
};
const FIXED_NOW_MS = Date.UTC(2026, 0, 2, 3, 4, 5);
const FIXED_DAY = "2026-01-02";
const SNAPSHOT_PROVIDER_ID = "admin_snapshot_provider";
const CLEAR_PROVIDER_ID = "admin_clear_provider";
const RESET_PROVIDER_ID = "admin_reset_provider";

let app: Hono;

beforeAll(() => {
  app = createApp(TEST_APP_CONFIG);
});

/** Integration tests for stats and admin endpoints. */
describe("admin", () => {
  afterEach(() => {
    resetChatCompletionRoutingState();
  });
  describe("GET /v1/stats", () => {
    /** Should require authentication. */
    test("rejects unauthenticated requests", async () => {
      const response = await app.request(STATS_PATH);

      expect(response.status).toBe(HTTP_STATUS_UNAUTHORIZED);
    });

    /** Should return today's snapshot with snake_case rows. */
    test("returns snapshot rows", async () => {
      getStatsStoreRepository().recordProviderAttempt({
        providerId: SNAPSHOT_PROVIDER_ID,
        modelFamily: "chat-fast",
        status: "success",
        tokenCount: 10,
        inputTokenCount: 4,
        outputTokenCount: 6,
        costUsd: 0.000_001,
        nowMs: FIXED_NOW_MS,
      });

      const response = await app.request(`${STATS_PATH}?day=${FIXED_DAY}`, {
        headers: AUTH_HEADERS,
      });
      const body = await response.json();

      expect(response.status).toBe(HTTP_STATUS_OK);
      expect(response.headers.get("x-request-id")).toBeTruthy();
      expect(body.day).toBe(FIXED_DAY);
      expect(body.data).toContainEqual({
        provider_id: SNAPSHOT_PROVIDER_ID,
        model_family: "chat-fast",
        day: FIXED_DAY,
        request_count: 1,
        token_count: 10,
        input_token_count: 4,
        output_token_count: 6,
        total_cost_usd: 0.000_001,
        success_count: 1,
        failure_count: 0,
        rate_limit_count: 0,
        avg_latency_ms: null,
        avg_tokens_per_second: null,
        avg_time_to_first_token_ms: null,
        cooldown_until: null,
      });
    });

    /** Should reject malformed day parameters. */
    test("rejects invalid day", async () => {
      const response = await app.request(`${STATS_PATH}?day=not-a-day`, { headers: AUTH_HEADERS });

      expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
    });
  });

  describe("POST /v1/admin/cooldowns/clear", () => {
    /** Should clear persisted cooldowns for one provider. */
    test("clears one provider cooldown", async () => {
      getStatsStoreRepository().recordProviderAttempt({
        providerId: CLEAR_PROVIDER_ID,
        modelFamily: "chat-fast",
        status: "rate_limited",
        cooldownUntil: Date.now() + 60_000,
        nowMs: Date.now(),
      });

      const response = await app.request(CLEAR_COOLDOWNS_PATH, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ provider_id: CLEAR_PROVIDER_ID }),
      });
      const body = await response.json();

      expect(response.status).toBe(HTTP_STATUS_OK);
      expect(body).toEqual({ status: "ok", cleared: 1 });
      expect(
        getStatsStoreRepository().getCooldownUntil(CLEAR_PROVIDER_ID, "chat-fast"),
      ).toBeUndefined();
    });

    /** Should reject invalid bodies. */
    test("rejects invalid body", async () => {
      const response = await app.request(CLEAR_COOLDOWNS_PATH, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ provider_id: 42 }),
      });

      expect(response.status).toBe(HTTP_STATUS_BAD_REQUEST);
    });
  });

  describe("POST /v1/admin/stats/reset", () => {
    /** Should delete one day of stats and report the count. */
    test("resets one day of stats", async () => {
      getStatsStoreRepository().recordProviderAttempt({
        providerId: RESET_PROVIDER_ID,
        modelFamily: "chat-fast",
        status: "success",
        nowMs: FIXED_NOW_MS,
      });

      const response = await app.request(RESET_STATS_PATH, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ day: FIXED_DAY }),
      });
      const body = await response.json();

      expect(response.status).toBe(HTTP_STATUS_OK);
      expect(body.status).toBe("ok");
      expect(body.day).toBe(FIXED_DAY);
      expect(body.deleted).toBeGreaterThanOrEqual(1);
      expect(
        getStatsSnapshot(FIXED_DAY).data.some((row) => row.provider_id === RESET_PROVIDER_ID),
      ).toBe(false);
    });

    /** Should default to today when the body is empty. */
    test("defaults to today with an empty body", async () => {
      const response = await app.request(RESET_STATS_PATH, {
        method: "POST",
        headers: AUTH_HEADERS,
      });
      const body = await response.json();

      expect(response.status).toBe(HTTP_STATUS_OK);
      expect(body.day).toBe(formatStatsDay(Date.now()));
      expect(typeof body.deleted).toBe("number");
    });
  });
});
