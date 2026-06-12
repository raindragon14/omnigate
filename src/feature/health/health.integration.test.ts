import { describe, expect, test } from "bun:test";

import { createApp } from "../../app";
import { HTTP_STATUS_OK } from "../../shared/http-status";

const HEALTH_ROUTE_PATH = "/health";
const EXPECTED_HEALTH_RESPONSE = {
  status: "ok",
  service: "free-model-router",
};

describe("health integration", () => {
  test("handles GET /health", async () => {
    const app = createApp();
    const response = await app.request(HEALTH_ROUTE_PATH);

    expect(response.status).toBe(HTTP_STATUS_OK);
    expect(await response.json()).toEqual(EXPECTED_HEALTH_RESPONSE);
  });
});
