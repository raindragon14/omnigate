import { describe, expect, test } from "bun:test";

import { DEFAULT_DATABASE_PATH, DEFAULT_PORT, parseAppConfig } from "./config-loader";

const CONFIGURED_PORT_ENV = "3000";
const EXPECTED_CONFIGURED_PORT = 3000;
const INVALID_NON_NUMERIC_PORT = "abc";
const INVALID_LOW_PORT = "0";
const INVALID_HIGH_PORT = "65536";
const INVALID_PORT_MESSAGE = "PORT must be an integer between 1 and 65535";
const OMNIGATE_API_KEY = "test-omnigate-key";
const MISSING_API_KEY_MESSAGE = "OMNIGATE_API_KEY is required";
const CONFIGURED_DATABASE_PATH = ":memory:";

/** Unit tests for the config-loader module. */
describe("config loader", () => {
  /** Should fall back to the default port when PORT is not set in the environment. */
  test("uses default port when PORT is missing", () => {
    expect(parseAppConfig({ OMNIGATE_API_KEY }).port).toBe(DEFAULT_PORT);
  });

  /** Should use the port value provided in the environment. */
  test("uses configured port", () => {
    expect(parseAppConfig({ PORT: CONFIGURED_PORT_ENV, OMNIGATE_API_KEY }).port).toBe(EXPECTED_CONFIGURED_PORT);
  });

  /** Should read the OmniGate API key from the environment. */
  test("uses configured OmniGate API key", () => {
    expect(parseAppConfig({ OMNIGATE_API_KEY }).omnigateApiKey).toBe(OMNIGATE_API_KEY);
  });

  /** Should fall back to the default database path when OMNIGATE_DB_PATH is missing or blank. */
  test("uses default database path", () => {
    expect(parseAppConfig({ OMNIGATE_API_KEY }).databasePath).toBe(DEFAULT_DATABASE_PATH);
    expect(parseAppConfig({ OMNIGATE_API_KEY, OMNIGATE_DB_PATH: " " }).databasePath).toBe(DEFAULT_DATABASE_PATH);
  });

  /** Should use the configured SQLite database path. */
  test("uses configured database path", () => {
    expect(parseAppConfig({ OMNIGATE_API_KEY, OMNIGATE_DB_PATH: CONFIGURED_DATABASE_PATH }).databasePath)
      .toBe(CONFIGURED_DATABASE_PATH);
  });

  /** Should throw when OMNIGATE_API_KEY is missing or blank. */
  test("rejects missing OmniGate API key", () => {
    expect(() => parseAppConfig({})).toThrow(MISSING_API_KEY_MESSAGE);
    expect(() => parseAppConfig({ OMNIGATE_API_KEY: " " })).toThrow(MISSING_API_KEY_MESSAGE);
  });

  /** Should throw when PORT is a non-numeric string. */
  test("rejects non-numeric port", () => {
    expect(() => parseAppConfig({ PORT: INVALID_NON_NUMERIC_PORT, OMNIGATE_API_KEY })).toThrow(INVALID_PORT_MESSAGE);
  });

  /** Should throw when PORT is outside the valid 1-65535 range. */
  test("rejects port outside valid range", () => {
    expect(() => parseAppConfig({ PORT: INVALID_LOW_PORT, OMNIGATE_API_KEY })).toThrow(INVALID_PORT_MESSAGE);
    expect(() => parseAppConfig({ PORT: INVALID_HIGH_PORT, OMNIGATE_API_KEY })).toThrow(INVALID_PORT_MESSAGE);
  });
});
