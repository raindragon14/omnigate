import { describe, expect, test } from "bun:test";

import { DEFAULT_PORT, parseAppConfig } from "./config-loader";

const CONFIGURED_PORT_ENV = "3000";
const EXPECTED_CONFIGURED_PORT = 3000;
const INVALID_NON_NUMERIC_PORT = "abc";
const INVALID_LOW_PORT = "0";
const INVALID_HIGH_PORT = "65536";
const INVALID_PORT_MESSAGE = "PORT must be an integer between 1 and 65535";

/** Unit tests for the config-loader module. */
describe("config loader", () => {
  /** Should fall back to the default port when PORT is not set in the environment. */
  test("uses default port when PORT is missing", () => {
    expect(parseAppConfig({}).port).toBe(DEFAULT_PORT);
  });

  /** Should use the port value provided in the environment. */
  test("uses configured port", () => {
    expect(parseAppConfig({ PORT: CONFIGURED_PORT_ENV }).port).toBe(EXPECTED_CONFIGURED_PORT);
  });

  /** Should throw when PORT is a non-numeric string. */
  test("rejects non-numeric port", () => {
    expect(() => parseAppConfig({ PORT: INVALID_NON_NUMERIC_PORT })).toThrow(INVALID_PORT_MESSAGE);
  });

  /** Should throw when PORT is outside the valid 1-65535 range. */
  test("rejects port outside valid range", () => {
    expect(() => parseAppConfig({ PORT: INVALID_LOW_PORT })).toThrow(INVALID_PORT_MESSAGE);
    expect(() => parseAppConfig({ PORT: INVALID_HIGH_PORT })).toThrow(INVALID_PORT_MESSAGE);
  });
});
