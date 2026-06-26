import { describe, expect, test } from "bun:test";

import { createApp } from "../../app";
import { DEFAULT_PORT } from "../../config/config-loader";
import { HTTP_STATUS_OK, HTTP_STATUS_UNAUTHORIZED } from "../../shared/http-status";

const MODEL_ROUTE_PATH = "/v1/models";
const EXPECTED_MODEL_LIST_OBJECT = "list";
const EXPECTED_MODEL_IDS = [
  "omnigate/auto-fast",
  "omnigate/auto-quality",
  "omnigate/coding-auto",
  "omnigate/coding-fast",
];
const TEST_OMNIGATE_API_KEY = "test-omnigate-key";
const AUTHORIZATION_HEADER = `Bearer ${TEST_OMNIGATE_API_KEY}`;
const TEST_APP_CONFIG = { port: DEFAULT_PORT, omnigateApiKey: TEST_OMNIGATE_API_KEY, databasePath: ":memory:" };

/** Integration tests for the GET /v1/models endpoint. */
describe("model integration", () => {
  /** Should return 200 with the list of available model aliases. */
  test("handles GET /v1/models", async () => {
    const app = createApp(TEST_APP_CONFIG);
    const response = await app.request(MODEL_ROUTE_PATH, {
      headers: { Authorization: AUTHORIZATION_HEADER },
    });
    const body = await response.json();

    expect(response.status).toBe(HTTP_STATUS_OK);
    expect(body.object).toBe(EXPECTED_MODEL_LIST_OBJECT);
    expect(body.data).toHaveLength(EXPECTED_MODEL_IDS.length);
    expect(body.data.map((model: { id: string }) => model.id)).toEqual(EXPECTED_MODEL_IDS);
  });

  /** Should require OmniGate API key auth for /v1/models. */
  test("requires auth for GET /v1/models", async () => {
    const app = createApp(TEST_APP_CONFIG);
    const response = await app.request(MODEL_ROUTE_PATH);

    expect(response.status).toBe(HTTP_STATUS_UNAUTHORIZED);
  });

  /** Should reject an incorrect OmniGate API key. */
  test("rejects invalid auth for GET /v1/models", async () => {
    const app = createApp(TEST_APP_CONFIG);
    const response = await app.request(MODEL_ROUTE_PATH, {
      headers: { Authorization: "Bearer wrong-key" },
    });

    expect(response.status).toBe(HTTP_STATUS_UNAUTHORIZED);
  });
});
