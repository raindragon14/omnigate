import { describe, expect, test } from "bun:test";

import { createRequestId, REQUEST_ID_HEADER_NAME } from "./request-id";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Unit tests for request correlation ids. */
describe("request id", () => {
  /** Should expose the documented response header name. */
  test("uses the x-request-id header", () => {
    expect(REQUEST_ID_HEADER_NAME).toBe("x-request-id");
  });

  /** Should generate UUID v4 ids. */
  test("generates uuid v4 ids", () => {
    expect(createRequestId()).toMatch(UUID_V4_PATTERN);
  });

  /** Should generate a unique id per call. */
  test("generates unique ids", () => {
    const seen = new Set([createRequestId(), createRequestId(), createRequestId()]);

    expect(seen.size).toBe(3);
  });
});
