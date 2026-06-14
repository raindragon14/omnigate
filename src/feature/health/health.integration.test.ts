import { describe, expect, test } from "bun:test";

import { createApp } from "../../app";
import { DEFAULT_PORT } from "../../config/config-loader";
import { HTTP_STATUS_OK } from "../../shared/http-status";

const HEALTH_ROUTE_PATH = "/health";
const TEST_APP_CONFIG = { port: DEFAULT_PORT, omnigateApiKey: "test-omnigate-key", databasePath: ":memory:" };
const EXPECTED_HEALTH_RESPONSE = {
  status: "ok",
  service: "omnigate",
};

/** Integration tests for the GET /health endpoint. */
describe("health integration", () => {
  /** Should return 200 with ok status and the service name. */
  test("handles GET /health", async () => {
    const app = createApp(TEST_APP_CONFIG);
    const response = await app.request(HEALTH_ROUTE_PATH);

    expect(response.status).toBe(HTTP_STATUS_OK);
    expect(await response.json()).toEqual(EXPECTED_HEALTH_RESPONSE);
  });
});
