import { describe, expect, test } from "bun:test";

import { createApp } from "../../src/app";
import { DEFAULT_PORT } from "../../src/config/config-loader";
import {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_NOT_FOUND,
} from "../../src/shared/http-status";

const UNKNOWN_ROUTE_PATH = "/unknown-route";
const THROW_ROUTE_PATH = "/throw";
const TEST_APP_CONFIG = { port: DEFAULT_PORT, omnigateApiKey: "test-omnigate-key", databasePath: ":memory:" };
const UNEXPECTED_FAILURE_MESSAGE = "Unexpected failure";
const NOT_FOUND_ERROR_RESPONSE = {
  error: {
    message: "Route not found",
    type: "not_found",
    code: "not_found",
  },
};
const INTERNAL_SERVER_ERROR_RESPONSE = {
  error: {
    message: "Internal server error",
    type: "internal_server_error",
    code: "internal_server_error",
  },
};

/** Cross-feature integration tests verifying app-level error handling. */
describe("app integration", () => {
  /** Should return OpenAI-compatible error for unknown route. */
  test("returns OpenAI-compatible error for unknown route", async () => {
    const app = createApp(TEST_APP_CONFIG);
    const response = await app.request(UNKNOWN_ROUTE_PATH);

    expect(response.status).toBe(HTTP_STATUS_NOT_FOUND);
    expect(await response.json()).toEqual(NOT_FOUND_ERROR_RESPONSE);
  });

  /** Should return OpenAI-compatible error for unhandled exceptions. */
  test("returns OpenAI-compatible error for unhandled exception", async () => {
    const app = createApp(TEST_APP_CONFIG);

    app.get(THROW_ROUTE_PATH, () => {
      throw new Error(UNEXPECTED_FAILURE_MESSAGE);
    });

    const response = await app.request(THROW_ROUTE_PATH);

    expect(response.status).toBe(HTTP_STATUS_INTERNAL_SERVER_ERROR);
    expect(await response.json()).toEqual(INTERNAL_SERVER_ERROR_RESPONSE);
  });
});
