import { afterEach, describe, expect, test } from "bun:test";

import { loadProviderRegistry, parseProviderRegistry, resetProviderRegistry, resolveApiKey } from "./provider-loader";

const VALID_REGISTRY = {
  providers: [
    {
      id: "provider_a",
      base_url: "https://api.provider-a.example/v1",
      model: "provider-a-model",
      api_key_env: "PROVIDER_A_API_KEY",
      family: "chat-fast",
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
    "omnigate/auto-fast": { families: ["chat-fast"] },
  },
};

const REGISTRY_ERROR_MESSAGE = "Invalid provider registry";

describe("provider loader", () => {
  afterEach(() => {
    resetProviderRegistry();
  });

  test("parses a valid provider registry", () => {
    const registry = parseProviderRegistry(VALID_REGISTRY);
    const provider = registry.providers[0];

    expect(provider).toBeDefined();
    expect(provider!.qualityScore).toBe(90);
    expect(provider!.speedScore).toBe(85);
    expect(provider!.paidFallback).toBe(false);
  });

  test("rejects missing providers", () => {
    expect(() => parseProviderRegistry({ aliases: VALID_REGISTRY.aliases })).toThrow(REGISTRY_ERROR_MESSAGE);
  });

  test("rejects missing quality score", () => {
    const provider = { ...VALID_REGISTRY.providers[0] } as Record<string, unknown>;

    delete provider.quality_score;

    expect(() => parseProviderRegistry({ ...VALID_REGISTRY, providers: [provider] })).toThrow(REGISTRY_ERROR_MESSAGE);
  });

  test("rejects invalid score range", () => {
    const provider = { ...VALID_REGISTRY.providers[0], quality_score: 101 };

    expect(() => parseProviderRegistry({ ...VALID_REGISTRY, providers: [provider] })).toThrow(REGISTRY_ERROR_MESSAGE);
  });

  test("rejects empty alias families", () => {
    const aliases = { "omnigate/auto-fast": { families: [] } };

    expect(() => parseProviderRegistry({ ...VALID_REGISTRY, aliases })).toThrow(REGISTRY_ERROR_MESSAGE);
  });

  test("loads registry from the YAML file", () => {
    const registry = loadProviderRegistry();

    expect(registry.providers.length).toBeGreaterThan(0);
    expect(Object.keys(registry.aliases).length).toBeGreaterThan(0);
  });

  test("caches the loaded registry", () => {
    const first = loadProviderRegistry();
    const second = loadProviderRegistry();

    expect(second).toBe(first);
  });

  test("resetProviderRegistry forces a reload", () => {
    const first = loadProviderRegistry();

    resetProviderRegistry();

    const second = loadProviderRegistry();

    expect(second).not.toBe(first);
    expect(second.providers.map((p) => p.id)).toEqual(first.providers.map((p) => p.id));
  });

  test("resolveApiKey reads from Bun.env", () => {
    const original = Bun.env.PROVIDER_LOADER_TEST_KEY;

    Bun.env.PROVIDER_LOADER_TEST_KEY = "secret";

    try {
      expect(resolveApiKey("PROVIDER_LOADER_TEST_KEY")).toBe("secret");
      expect(resolveApiKey("MISSING_PROVIDER_LOADER_TEST_KEY")).toBeUndefined();
    } finally {
      if (original === undefined) {
        delete Bun.env.PROVIDER_LOADER_TEST_KEY;
      } else {
        Bun.env.PROVIDER_LOADER_TEST_KEY = original;
      }
    }
  });
});
