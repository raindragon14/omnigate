import { describe, expect, test } from "bun:test";

import { createApp } from "../../app";
import { HTTP_STATUS_OK } from "../../shared/http-status";

const MODEL_ROUTE_PATH = "/v1/models";
const EXPECTED_MODEL_LIST_OBJECT = "list";
const EXPECTED_MODEL_IDS = [
  "omnigate/deepseek-v4-flash-auto",
  "omnigate/mimo-v2.5-auto",
  "omnigate/coding-balanced",
  "omnigate/coding-fast",
  "omnigate/emergency-paid",
];

describe("model integration", () => {
  test("handles GET /v1/models", async () => {
    const app = createApp();
    const response = await app.request(MODEL_ROUTE_PATH);
    const body = await response.json();

    expect(response.status).toBe(HTTP_STATUS_OK);
    expect(body.object).toBe(EXPECTED_MODEL_LIST_OBJECT);
    expect(body.data).toHaveLength(EXPECTED_MODEL_IDS.length);
    expect(body.data.map((model: { id: string }) => model.id)).toEqual(EXPECTED_MODEL_IDS);
  });
});
