import { describe, expect, test } from "bun:test";

import type { ProviderCandidate, ProviderSelectionInput } from "../shared/signatures";
import { createProviderCooldownStore } from "./provider-cooldown";
import { selectProviderCandidates } from "./provider-selector";

const ALL_PROVIDERS: ProviderCandidate[] = [
  { id: "alpha", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 80, qualityScore: 80, enabled: true, paidFallback: false, apiKeyEnv: "KEY_A", context: 100000, supportsTools: true, supportsJson: true, supportsStreaming: true, rateLimit: {} },
  { id: "beta", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 90, qualityScore: 90, enabled: true, paidFallback: false, apiKeyEnv: "KEY_B", context: 100000, supportsTools: true, supportsJson: true, supportsStreaming: true, rateLimit: {} },
  { id: "gamma", baseUrl: "", model: "", family: "mimo-v2.5", priority: 100, qualityScore: 85, enabled: true, paidFallback: false, apiKeyEnv: "KEY_C", context: 100000, supportsTools: true, supportsJson: true, supportsStreaming: true, rateLimit: {} },
  { id: "delta", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 70, qualityScore: 70, enabled: false, paidFallback: false, apiKeyEnv: "KEY_D", context: 100000, supportsTools: true, supportsJson: true, supportsStreaming: true, rateLimit: {} },
  { id: "epsilon", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 50, qualityScore: 50, enabled: true, paidFallback: true, apiKeyEnv: "KEY_E", context: 100000, supportsTools: true, supportsJson: true, supportsStreaming: true, rateLimit: {} },
  { id: "zeta", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 60, qualityScore: 60, enabled: true, paidFallback: false, apiKeyEnv: "KEY_F", context: 100000, supportsTools: false, supportsJson: true, supportsStreaming: true, rateLimit: {} },
  { id: "eta", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 55, qualityScore: 55, enabled: true, paidFallback: false, apiKeyEnv: "KEY_G", context: 100000, supportsTools: true, supportsJson: false, supportsStreaming: true, rateLimit: {} },
  { id: "theta", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 45, qualityScore: 45, enabled: true, paidFallback: false, apiKeyEnv: "KEY_H", context: 100000, supportsTools: true, supportsJson: true, supportsStreaming: false, rateLimit: {} },
  { id: "iota", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 35, qualityScore: 35, enabled: true, paidFallback: false, apiKeyEnv: "KEY_I", context: 100000, supportsTools: true, supportsJson: true, supportsStreaming: true, rateLimit: {} },
];

const MOCK_ALIASES = {
  "omnigate/deepseek-v4-flash-auto": { families: ["deepseek-v4-flash"] },
  "omnigate/mimo-v2.5-auto": { families: ["mimo-v2.5"] },
};

const NOW_MS = 1_000_000;

function makeInput(overrides: Partial<ProviderSelectionInput> = {}): ProviderSelectionInput {
  return {
    request: { model: "omnigate/deepseek-v4-flash-auto", messages: [{ role: "user", content: "hi" }], stream: false, mode: "balanced" },
    providers: ALL_PROVIDERS,
    aliases: MOCK_ALIASES,
    cooldownStore: createProviderCooldownStore(),
    resolveApiKey: () => "sk-mock",
    nowMs: NOW_MS,
    ...overrides,
  };
}

/** Unit tests for provider candidate selection filtering. */
describe("selectProviderCandidates", () => {
  test("returns empty list for unknown alias", () => {
    const result = selectProviderCandidates(makeInput({
      request: { model: "unknown/model", messages: [], stream: false, mode: "balanced" },
    }));

    expect(result).toHaveLength(0);
  });

  test("includes all enabled providers with keys for known alias", () => {
    const result = selectProviderCandidates(makeInput());

    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.some((provider) => provider.id === "alpha")).toBe(true);
    expect(result.some((provider) => provider.id === "beta")).toBe(true);
  });

  test("excludes disabled providers", () => {
    const result = selectProviderCandidates(makeInput());

    expect(result.every((provider) => provider.enabled)).toBe(true);
    expect(result.some((provider) => provider.id === "delta")).toBe(false);
  });

  test("excludes providers outside alias family", () => {
    const result = selectProviderCandidates(makeInput({
      request: { model: "omnigate/deepseek-v4-flash-auto", messages: [], stream: false, mode: "balanced" },
    }));

    expect(result.some((provider) => provider.id === "gamma")).toBe(false);
  });

  test("excludes providers with missing API key", () => {
    const result = selectProviderCandidates(makeInput({
      resolveApiKey: () => undefined,
    }));

    expect(result).toHaveLength(0);
  });

  test("excludes paid fallback providers by default", () => {
    const result = selectProviderCandidates(makeInput());

    expect(result.some((provider) => provider.id === "epsilon")).toBe(false);
  });

  test("excludes providers in active cooldown", () => {
    const cooldownStore = createProviderCooldownStore();

    cooldownStore.setCooldown("alpha", NOW_MS + 60_000);

    const result = selectProviderCandidates(makeInput({ cooldownStore }));

    expect(result.some((provider) => provider.id === "alpha")).toBe(false);
  });

  test("includes providers with expired cooldown", () => {
    const cooldownStore = createProviderCooldownStore();

    cooldownStore.setCooldown("alpha", NOW_MS - 1);

    const result = selectProviderCandidates(makeInput({ cooldownStore, nowMs: NOW_MS }));

    expect(result.some((provider) => provider.id === "alpha")).toBe(true);
  });

  test("excludes providers without tool support when request has tools", () => {
    const result = selectProviderCandidates(makeInput({
      request: { model: "omnigate/deepseek-v4-flash-auto", messages: [], stream: false, mode: "balanced", tools: [{ type: "function" }] },
    }));

    expect(result.some((provider) => provider.id === "zeta")).toBe(false);
    expect(result.some((provider) => provider.id === "alpha")).toBe(true);
  });

  test("excludes providers without JSON support when request has response_format", () => {
    const result = selectProviderCandidates(makeInput({
      request: { model: "omnigate/deepseek-v4-flash-auto", messages: [], stream: false, mode: "balanced", responseFormat: { type: "json_object" } },
    }));

    expect(result.some((provider) => provider.id === "eta")).toBe(false);
    expect(result.some((provider) => provider.id === "alpha")).toBe(true);
  });

  test("excludes providers without streaming support when request is streaming", () => {
    const result = selectProviderCandidates(makeInput({
      request: { model: "omnigate/deepseek-v4-flash-auto", messages: [], stream: true, mode: "balanced" },
    }));

    expect(result.some((provider) => provider.id === "theta")).toBe(false);
    expect(result.some((provider) => provider.id === "alpha")).toBe(true);
  });

  test("matches correct family", () => {
    const result = selectProviderCandidates(makeInput({
      request: { model: "omnigate/mimo-v2.5-auto", messages: [], stream: false, mode: "balanced" },
    }));

    expect(result.every((provider) => provider.family === "mimo-v2.5")).toBe(true);
    expect(result.some((provider) => provider.id === "gamma")).toBe(true);
  });
});
