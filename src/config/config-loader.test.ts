import { describe, expect, test } from "bun:test";

import { DEFAULT_PORT, parseAppConfig } from "./config-loader";

const CONFIGURED_PORT_ENV = "3000";
const EXPECTED_CONFIGURED_PORT = 3000;
const INVALID_NON_NUMERIC_PORT = "abc";
const INVALID_LOW_PORT = "0";
const INVALID_HIGH_PORT = "65536";
const INVALID_PORT_MESSAGE = "PORT must be an integer between 1 and 65535";

describe("config loader", () => {
  test("uses default port when PORT is missing", () => {
    expect(parseAppConfig({}).port).toBe(DEFAULT_PORT);
  });

  test("uses configured port", () => {
    expect(parseAppConfig({ PORT: CONFIGURED_PORT_ENV }).port).toBe(EXPECTED_CONFIGURED_PORT);
  });

  test("rejects non-numeric port", () => {
    expect(() => parseAppConfig({ PORT: INVALID_NON_NUMERIC_PORT })).toThrow(INVALID_PORT_MESSAGE);
  });

  test("rejects port outside valid range", () => {
    expect(() => parseAppConfig({ PORT: INVALID_LOW_PORT })).toThrow(INVALID_PORT_MESSAGE);
    expect(() => parseAppConfig({ PORT: INVALID_HIGH_PORT })).toThrow(INVALID_PORT_MESSAGE);
  });
});
