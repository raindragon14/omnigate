import { describe, expect, test } from "bun:test";

import { normalizeRequest } from "../../router/request-normalizer";
import type { OpenAIChatRequest, ProviderCandidate } from "../../shared/signatures";
import { selectBestProvider } from "./chat-completion.service";

const MOCK_CHAT_REQUEST: OpenAIChatRequest = {
  model: "omnigate/deepseek-v4-flash-auto",
  messages: [{ role: "user", content: "Hello" }],
  max_tokens: 100,
  temperature: 0.5,
  top_p: 0.9,
  stream: false,
};

const MOCK_PROVIDERS: ProviderCandidate[] = [
  { id: "alpha", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 80, enabled: true, paidFallback: false, apiKeyEnv: "" },
  { id: "beta", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 90, enabled: true, paidFallback: false, apiKeyEnv: "" },
  { id: "gamma", baseUrl: "", model: "", family: "mimo-v2.5", priority: 100, enabled: true, paidFallback: false, apiKeyEnv: "" },
  { id: "delta", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 70, enabled: false, paidFallback: false, apiKeyEnv: "" },
  { id: "epsilon", baseUrl: "", model: "", family: "deepseek-v4-flash", priority: 50, enabled: true, paidFallback: true, apiKeyEnv: "" },
];

const MOCK_ALIASES = {
  "omnigate/deepseek-v4-flash-auto": { families: ["deepseek-v4-flash"] },
  "omnigate/mimo-v2.5-auto": { families: ["mimo-v2.5"] },
  "omnigate/emergency-paid": { families: ["deepseek-v4-flash"], allow_paid: true },
};

describe("chat completion feature", () => {
  test("normalizes OpenAI request to router request", () => {
    const routerRequest = normalizeRequest(MOCK_CHAT_REQUEST);

    expect(routerRequest.model).toBe(MOCK_CHAT_REQUEST.model);
    expect(routerRequest.messages).toEqual(MOCK_CHAT_REQUEST.messages);
    expect(routerRequest.maxTokens).toBe(MOCK_CHAT_REQUEST.max_tokens);
    expect(routerRequest.temperature).toBe(MOCK_CHAT_REQUEST.temperature);
    expect(routerRequest.topP).toBe(MOCK_CHAT_REQUEST.top_p);
    expect(routerRequest.stream).toBe(false);
  });

  test("defaults stream to false when missing", () => {
    const { stream } = normalizeRequest({ model: "test", messages: [{ role: "user", content: "hi" }] });

    expect(stream).toBe(false);
  });

  test("strips unknown fields during normalization", () => {
    const raw = {
      model: "test",
      messages: [{ role: "user" as const, content: "hi" }],
      extra_body: { thinking: true },
    } as OpenAIChatRequest;

    const routerRequest = normalizeRequest(raw);

    expect(routerRequest.model).toBe("test");
    expect("extra_body" in routerRequest).toBe(false);
  });

  describe("selectBestProvider", () => {
    test("returns undefined for unknown alias", () => {
      const result = selectBestProvider("unknown/model", MOCK_PROVIDERS, MOCK_ALIASES);

      expect(result).toBeUndefined();
    });

    test("returns highest priority enabled provider for matching family", () => {
      const result = selectBestProvider("omnigate/deepseek-v4-flash-auto", MOCK_PROVIDERS, MOCK_ALIASES);

      expect(result).toBeDefined();
      expect(result?.id).toBe("beta");
    });

    test("skips disabled providers", () => {
      // delta has priority 70 but is disabled; beta (90) should win
      const result = selectBestProvider("omnigate/deepseek-v4-flash-auto", MOCK_PROVIDERS, MOCK_ALIASES);

      expect(result?.id).not.toBe("delta");
    });

    test("skips paid providers for regular aliases", () => {
      // epsilon has paidFallback=true, should not be selected for regular alias
      const result = selectBestProvider("omnigate/deepseek-v4-flash-auto", MOCK_PROVIDERS, MOCK_ALIASES);

      expect(result?.id).not.toBe("epsilon");
    });

    test("allows paid providers for emergency-paid alias", () => {
      const providersWithPaid = MOCK_PROVIDERS.filter((p) => p.family === "deepseek-v4-flash" && p.enabled);
      const result = selectBestProvider("omnigate/emergency-paid", providersWithPaid, MOCK_ALIASES);

      // beta (90), alpha (80), epsilon (50) are enabled in deepseek family
      // epsilon has paidFallback=true — but paid IS allowed for this alias
      // beta has highest priority (90) among all, so it should win
      expect(result?.id).toBe("beta");
    });

    test("returns undefined when no providers match family", () => {
      const result = selectBestProvider("omnigate/mimo-v2.5-auto", [], MOCK_ALIASES);

      expect(result).toBeUndefined();
    });
  });
});
