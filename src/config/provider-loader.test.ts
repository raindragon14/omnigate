import { describe, expect, test } from "bun:test";

import { parseProviderRegistry } from "./provider-loader";

const VALID_REGISTRY = {
  providers: [
    {
      id: "opencode_zen_deepseek",
      base_url: "https://opencode.ai/zen/v1",
      model: "opencode/deepseek-v4-flash-free",
      api_key_env: "OPENCODE_API_KEY",
      family: "deepseek-v4-flash",
      priority: 100,
      quality_score: 90,
      speed_score: 85,
      enabled: true,
      supports_tools: true,
      supports_json: true,
      supports_streaming: true,
      rate_limit: { rpm: 10 },
    },
  ],
  aliases: {
    "omnigate/deepseek-v4-flash-auto": { families: ["deepseek-v4-flash"] },
  },
};

const REGISTRY_ERROR_MESSAGE = "Invalid provider registry";

/** Unit tests for provider registry validation and conversion. */
describe("provider loader", () => {
  /** Should parse a valid provider registry into runtime candidates. */
  test("parses a valid provider registry", () => {
    const registry = parseProviderRegistry(VALID_REGISTRY);

    expect(registry.providers[0]!.qualityScore).toBe(90);
    expect(registry.providers[0]!.speedScore).toBe(85);
    expect(registry.providers[0]!.paidFallback).toBe(false);
  });

  /** Should reject registry data without a providers array. */
  test("rejects missing providers", () => {
    expect(() => parseProviderRegistry({ aliases: VALID_REGISTRY.aliases })).toThrow(REGISTRY_ERROR_MESSAGE);
  });

  /** Should reject providers missing a configured quality score. */
  test("rejects missing quality score", () => {
    const provider = { ...VALID_REGISTRY.providers[0] } as Record<string, unknown>;

    delete provider.quality_score;

    expect(() => parseProviderRegistry({ ...VALID_REGISTRY, providers: [provider] })).toThrow(REGISTRY_ERROR_MESSAGE);
  });

  /** Should reject score values outside the 0-100 range. */
  test("rejects invalid score range", () => {
    const provider = { ...VALID_REGISTRY.providers[0], quality_score: 101 };

    expect(() => parseProviderRegistry({ ...VALID_REGISTRY, providers: [provider] })).toThrow(REGISTRY_ERROR_MESSAGE);
  });

  /** Should reject aliases that do not map to at least one family. */
  test("rejects empty alias families", () => {
    const aliases = { "omnigate/deepseek-v4-flash-auto": { families: [] } };

    expect(() => parseProviderRegistry({ ...VALID_REGISTRY, aliases })).toThrow(REGISTRY_ERROR_MESSAGE);
  });
});
