import { describe, expect, test } from "bun:test";

import { getHealthStatus } from "./health.service";

const EXPECTED_HEALTH_RESPONSE = {
  status: "ok",
  service: "omnigate",
} as const;

/** Unit tests for the health feature. */
describe("health feature", () => {
  /** Should return ok status with the service name. */
  test("returns service status", () => {
    expect(getHealthStatus()).toEqual(EXPECTED_HEALTH_RESPONSE);
  });
});
