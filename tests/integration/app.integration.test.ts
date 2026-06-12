import { describe, expect, test } from "bun:test";

import { createApp } from "../../src/app";
import {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_NOT_FOUND,
} from "../../src/shared/http-status";

const UNKNOWN_ROUTE_PATH = "/unknown-route";
const THROW_ROUTE_PATH = "/throw";
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

describe("app integration", () => {
  test("returns OpenAI-compatible error for unknown route", async () => {
    const app = createApp();
    const response = await app.request(UNKNOWN_ROUTE_PATH);

    expect(response.status).toBe(HTTP_STATUS_NOT_FOUND);
    expect(await response.json()).toEqual(NOT_FOUND_ERROR_RESPONSE);
  });

  test("returns OpenAI-compatible error for unhandled exception", async () => {
    const app = createApp();

    app.get(THROW_ROUTE_PATH, () => {
      throw new Error(UNEXPECTED_FAILURE_MESSAGE);
    });

    const response = await app.request(THROW_ROUTE_PATH);

    expect(response.status).toBe(HTTP_STATUS_INTERNAL_SERVER_ERROR);
    expect(await response.json()).toEqual(INTERNAL_SERVER_ERROR_RESPONSE);
  });
});
