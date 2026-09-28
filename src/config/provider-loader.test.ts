import { afterEach, describe, expect, test } from "bun:test";

import {
  loadProviderRegistry,
  parseProviderRegistry,
  resetProviderRegistry,
  resolveApiKey,
} from "./provider-loader";

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

  test("defaults profiles to an empty record", () => {
    const registry = parseProviderRegistry(VALID_REGISTRY);

    expect(registry.profiles).toEqual({});
  });

  test("parses alias profiles with categories and quality ratio", () => {
    const registry = parseProviderRegistry({
      ...VALID_REGISTRY,
      profiles: {
        "omnigate/auto-fast": { categories: ["knowledge"], min_quality_ratio: 0.8 },
      },
    });
    const profile = registry.profiles["omnigate/auto-fast"];

    expect(profile).toBeDefined();
    expect(profile!.categories).toEqual(["knowledge"]);
    expect(profile!.minQualityRatio).toBe(0.8);
  });

  test("rejects empty profile categories", () => {
    expect(() =>
      parseProviderRegistry({
        ...VALID_REGISTRY,
        profiles: { "omnigate/auto-fast": { categories: [] } },
      }),
    ).toThrow(REGISTRY_ERROR_MESSAGE);
  });

  test("rejects out-of-range profile quality ratio", () => {
    expect(() =>
      parseProviderRegistry({
        ...VALID_REGISTRY,
        profiles: { "omnigate/auto-fast": { categories: ["coding"], min_quality_ratio: 3 } },
      }),
    ).toThrow(REGISTRY_ERROR_MESSAGE);
  });

  test("parses supports_reasoning and max_tokens_field", () => {
    const registry = parseProviderRegistry({
      ...VALID_REGISTRY,
      providers: [
        {
          ...VALID_REGISTRY.providers[0],
          supports_reasoning: true,
          max_tokens_field: "max_completion_tokens",
        },
      ],
    });
    const provider = registry.providers[0];

    expect(provider!.supportsReasoning).toBe(true);
    expect(provider!.maxTokensField).toBe("max_completion_tokens");
  });

  test("defaults supportsReasoning to false and maxTokensField to undefined", () => {
    const provider = parseProviderRegistry(VALID_REGISTRY).providers[0];

    expect(provider!.supportsReasoning).toBe(false);
    expect(provider!.maxTokensField).toBeUndefined();
  });

  test("parses provider cost tariffs", () => {
    const registry = parseProviderRegistry({
      ...VALID_REGISTRY,
      providers: [
        {
          ...VALID_REGISTRY.providers[0],
          cost: { input_per_1m: 0.15, output_per_1m: 0.6, source: "vendor pricing" },
        },
      ],
    });
    const provider = registry.providers[0];

    expect(provider!.cost).toEqual({
      inputPer1m: 0.15,
      outputPer1m: 0.6,
      source: "vendor pricing",
    });
  });

  test("defaults missing cost to unknown (empty tariff)", () => {
    const provider = parseProviderRegistry(VALID_REGISTRY).providers[0];

    expect(provider!.cost).toEqual({});
  });

  test("rejects negative cost tariffs", () => {
    const provider = { ...VALID_REGISTRY.providers[0], cost: { input_per_1m: -1 } };

    expect(() => parseProviderRegistry({ ...VALID_REGISTRY, providers: [provider] })).toThrow(
      REGISTRY_ERROR_MESSAGE,
    );
  });

  test("rejects invalid max_tokens_field", () => {
    const provider = { ...VALID_REGISTRY.providers[0], max_tokens_field: "tokens" };

    expect(() => parseProviderRegistry({ ...VALID_REGISTRY, providers: [provider] })).toThrow(
      REGISTRY_ERROR_MESSAGE,
    );
  });

  test("rejects missing providers", () => {
    expect(() => parseProviderRegistry({ aliases: VALID_REGISTRY.aliases })).toThrow(
      REGISTRY_ERROR_MESSAGE,
    );
  });

  test("rejects missing quality score", () => {
    const provider = { ...VALID_REGISTRY.providers[0] } as Record<string, unknown>;

    delete provider.quality_score;

    expect(() => parseProviderRegistry({ ...VALID_REGISTRY, providers: [provider] })).toThrow(
      REGISTRY_ERROR_MESSAGE,
    );
  });

  test("rejects invalid score range", () => {
    const provider = { ...VALID_REGISTRY.providers[0], quality_score: 101 };

    expect(() => parseProviderRegistry({ ...VALID_REGISTRY, providers: [provider] })).toThrow(
      REGISTRY_ERROR_MESSAGE,
    );
  });

  test("rejects empty alias families", () => {
    const aliases = { "omnigate/auto-fast": { families: [] } };

    expect(() => parseProviderRegistry({ ...VALID_REGISTRY, aliases })).toThrow(
      REGISTRY_ERROR_MESSAGE,
    );
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
