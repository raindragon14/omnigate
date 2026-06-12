import { describe, expect, test } from "bun:test";

import { getHealthStatus } from "./health.service";

const EXPECTED_HEALTH_RESPONSE = {
  status: "ok",
  service: "free-model-router",
} as const;

describe("health feature", () => {
  test("returns service status", () => {
    expect(getHealthStatus()).toEqual(EXPECTED_HEALTH_RESPONSE);
  });
});
