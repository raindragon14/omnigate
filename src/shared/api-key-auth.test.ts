import { describe, expect, test } from "bun:test";
import type { Hono } from "hono";

import { createApp } from "../app";
import { DEFAULT_PORT } from "../config/config-loader";
import { HTTP_STATUS_OK, HTTP_STATUS_UNAUTHORIZED } from "./http-status";

const TEST_API_KEY = "test-api-key-1234567890abcdef";
const TEST_APP_CONFIG = { port: DEFAULT_PORT, omnigateApiKey: TEST_API_KEY, databasePath: ":memory:" };

/** Unit tests for Bearer-token authentication middleware. */
describe("api key auth", () => {
  /** Should allow requests with the correct Bearer token. */
  test("accepts valid api key", async () => {
    const app = createApp(TEST_APP_CONFIG);
    const response = await app.request("/v1/models", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });

    expect(response.status).toBe(HTTP_STATUS_OK);
  });

  /** Should reject requests with no Authorization header. */
  test("rejects missing authorization header", async () => {
    const app = createApp(TEST_APP_CONFIG);
    const response = await app.request("/v1/models");

    expect(response.status).toBe(HTTP_STATUS_UNAUTHORIZED);
  });

  /** Should reject requests with an incorrect Bearer token. */
  test("rejects invalid api key", async () => {
    const app = createApp(TEST_APP_CONFIG);
    const response = await app.request("/v1/models", {
      headers: { Authorization: "Bearer wrong-key" },
    });

    expect(response.status).toBe(HTTP_STATUS_UNAUTHORIZED);
  });

  /** Should reject requests with correct key but wrong prefix. */
  test("rejects key without bearer prefix", async () => {
    const app = createApp(TEST_APP_CONFIG);
    const response = await app.request("/v1/models", {
      headers: { Authorization: TEST_API_KEY },
    });

    expect(response.status).toBe(HTTP_STATUS_UNAUTHORIZED);
  });

  /** Should reject requests where key matches prefix but differs later. */
  test("rejects key with matching prefix but wrong suffix", async () => {
    const app = createApp(TEST_APP_CONFIG);
    const partialKey = `Bearer ${TEST_API_KEY.slice(0, 10)}0000000000000000`;
    const response = await app.request("/v1/models", {
      headers: { Authorization: partialKey },
    });

    expect(response.status).toBe(HTTP_STATUS_UNAUTHORIZED);
  });

  /** Should not require auth for the health endpoint. */
  test("allows unauthenticated health check", async () => {
    const app = createApp(TEST_APP_CONFIG);
    const response = await app.request("/health");

    expect(response.status).toBe(HTTP_STATUS_OK);
  });
});
