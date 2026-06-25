import { describe, expect, test } from "bun:test";

import type { OpenAIChatCompletionResponse, ProviderAdapter, ProviderCandidate, ProviderRequest, ProviderResponse, ProviderStatsRepository, ProviderStatsUpdate, RouterRequest } from "../shared/signatures";
import { classifyProviderError, runProviderFallback, runProviderStreamFallback } from "./fallback-runner";
import { createProviderCooldownStore } from "./provider-cooldown";

const SUCCESS_RESPONSE: OpenAIChatCompletionResponse = {
  id: "mock-id",
  object: "chat.completion",
  created: 12345,
  model: "test-model",
  choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
};

function makeProvider(id: string, priority: number): ProviderCandidate {
  return { id, baseUrl: "https://example.com", model: "test-model", family: "deepseek-v4-flash", priority, qualityScore: 85, enabled: true, paidFallback: false, apiKeyEnv: "KEY_" + id.toUpperCase(), context: 100000, supportsTools: true, supportsJson: true, supportsStreaming: true, rateLimit: {} };
}

function mockAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    id: "test-adapter",
    supports: () => true,
    transformRequest: (request: RouterRequest, provider: ProviderCandidate, apiKey: string): ProviderRequest => ({
      url: provider.baseUrl,
      headers: { Authorization: `Bearer ${apiKey}` },
      body: { model: provider.model },
    }),
    send: async (): Promise<ProviderResponse> => ({ status: 200, body: SUCCESS_RESPONSE as unknown as Record<string, unknown>, headers: {} }),
    sendStream: async () => ({ status: 200, headers: {}, stream: new ReadableStream<Uint8Array>() }),
    ...overrides,
  };
}

function mockStatsRepository(): ProviderStatsRepository & { updates: ProviderStatsUpdate[] } {
  const updates: ProviderStatsUpdate[] = [];

  return {
    updates,
    getProviderStats: () => undefined,
    recordProviderAttempt: (update) => updates.push(update),
    getCooldownUntil: () => undefined,
  };
}

/** Unit tests for provider fallback and error classification. */
describe("fallback runner", () => {
  describe("runProviderFallback", () => {
    test("returns first provider response on success", async () => {
      const repository = mockStatsRepository();
      let nowMs = 1_000;
      const result = await runProviderFallback({
        request: { messages: [], model: "test", stream: false, mode: "balanced" },
        providers: [makeProvider("alpha", 90), makeProvider("beta", 80)],
        adapter: mockAdapter(),
        resolveApiKey: () => "sk-mock",
        cooldownStore: createProviderCooldownStore(),
        providerStatsRepository: repository,
        nowMs: () => nowMs += 100,
      });

      expect(result.id).toBe("mock-id");
      expect(repository.updates[0]?.status).toBe("success");
      expect(repository.updates[0]?.tokenCount).toBe(10);
    });

    test("falls back when first provider returns 429", async () => {
      let callCount = 0;

      const adapter = mockAdapter({
        send: async (): Promise<ProviderResponse> => {
          callCount++;

          if (callCount === 1) {
            return { status: 429, body: {}, headers: { "retry-after": "1" } };
          }

          return { status: 200, body: SUCCESS_RESPONSE as unknown as Record<string, unknown>, headers: {} };
        },
      });

      const cooldownStore = createProviderCooldownStore();
      const repository = mockStatsRepository();
      const nowMs = Date.now();

      const result = await runProviderFallback({
        request: { messages: [], model: "test", stream: false, mode: "balanced" },
        providers: [makeProvider("alpha", 90), makeProvider("beta", 80)],
        adapter,
        resolveApiKey: () => "sk-mock",
        cooldownStore,
        providerStatsRepository: repository,
        nowMs: () => nowMs,
      });

      expect(result.id).toBe("mock-id");
      expect(callCount).toBe(2);
      expect(cooldownStore.isProviderCoolingDown("alpha", nowMs)).toBe(true);
      expect(repository.updates[0]?.status).toBe("rate_limited");
      expect(repository.updates[0]?.cooldownUntil).toBeGreaterThan(nowMs);
    });

    test("falls back when first provider returns 500", async () => {
      let callCount = 0;

      const adapter = mockAdapter({
        send: async (): Promise<ProviderResponse> => {
          callCount++;

          if (callCount === 1) {
            return { status: 500, body: {}, headers: {} };
          }

          return { status: 200, body: SUCCESS_RESPONSE as unknown as Record<string, unknown>, headers: {} };
        },
      });

      const result = await runProviderFallback({
        request: { messages: [], model: "test", stream: false, mode: "balanced" },
        providers: [makeProvider("alpha", 90), makeProvider("beta", 80)],
        adapter,
        resolveApiKey: () => "sk-mock",
        cooldownStore: createProviderCooldownStore(),
        nowMs: () => Date.now(),
      });

      expect(result.id).toBe("mock-id");
      expect(callCount).toBe(2);
    });

    test("records failure stats when provider returns 500", async () => {
      const repository = mockStatsRepository();
      const adapter = mockAdapter({
        send: async (): Promise<ProviderResponse> => ({ status: 500, body: {}, headers: {} }),
      });

      try {
        await runProviderFallback({
          request: { messages: [], model: "test", stream: false, mode: "balanced" },
          providers: [makeProvider("alpha", 90)],
          adapter,
          resolveApiKey: () => "sk-mock",
          cooldownStore: createProviderCooldownStore(),
          providerStatsRepository: repository,
          nowMs: () => Date.now(),
        });

        expect.unreachable("should have thrown after provider failure");
      } catch {
        expect(repository.updates[0]?.status).toBe("failure");
      }
    });

    test("skips auth error and tries next provider", async () => {
      let callCount = 0;

      const adapter = mockAdapter({
        send: async (): Promise<ProviderResponse> => {
          callCount++;

          if (callCount === 1) {
            return { status: 401, body: {}, headers: {} };
          }

          return { status: 200, body: SUCCESS_RESPONSE as unknown as Record<string, unknown>, headers: {} };
        },
      });

      const result = await runProviderFallback({
        request: { messages: [], model: "test", stream: false, mode: "balanced" },
        providers: [makeProvider("alpha", 90), makeProvider("beta", 80)],
        adapter,
        resolveApiKey: () => "sk-mock",
        cooldownStore: createProviderCooldownStore(),
        nowMs: () => Date.now(),
      });

      expect(result.id).toBe("mock-id");
      expect(callCount).toBe(2);
    });

    test("skips providers without API key", async () => {
      let callCount = 0;

      const adapter = mockAdapter({
        send: async (): Promise<ProviderResponse> => {
          callCount++;

          return { status: 200, body: SUCCESS_RESPONSE as unknown as Record<string, unknown>, headers: {} };
        },
      });

      const result = await runProviderFallback({
        request: { messages: [], model: "test", stream: false, mode: "balanced" },
        providers: [makeProvider("alpha", 90), makeProvider("beta", 80)],
        adapter,
        resolveApiKey: (envVar: string) => envVar === "KEY_BETA" ? "sk" : undefined,
        cooldownStore: createProviderCooldownStore(),
        nowMs: () => Date.now(),
      });

      expect(result.id).toBe("mock-id");
      expect(callCount).toBe(1);
    });

    test("falls back when first provider returns malformed 200 response", async () => {
      let callCount = 0;

      const adapter = mockAdapter({
        send: async (): Promise<ProviderResponse> => {
          callCount++;

          if (callCount === 1) {
            return { status: 200, body: {}, headers: {}, isMalformed: true };
          }

          return { status: 200, body: SUCCESS_RESPONSE as unknown as Record<string, unknown>, headers: {} };
        },
      });

      const result = await runProviderFallback({
        request: { messages: [], model: "test", stream: false, mode: "balanced" },
        providers: [makeProvider("alpha", 90), makeProvider("beta", 80)],
        adapter,
        resolveApiKey: () => "sk-mock",
        cooldownStore: createProviderCooldownStore(),
        nowMs: () => Date.now(),
      });

      expect(result.id).toBe("mock-id");
      expect(callCount).toBe(2);
    });

    test("throws when all providers fail", async () => {
      const adapter = mockAdapter({
        send: async (): Promise<ProviderResponse> => ({ status: 500, body: {}, headers: {} }),
      });

      try {
        await runProviderFallback({
          request: { messages: [], model: "test", stream: false, mode: "balanced" },
          providers: [makeProvider("alpha", 90)],
          adapter,
          resolveApiKey: () => "sk-mock",
          cooldownStore: createProviderCooldownStore(),
          nowMs: () => Date.now(),
        });

        expect.unreachable("should have thrown");
      } catch (error) {
        const typed = error as Error & { code: string };

        expect(typed.code).toBe("provider_server_error");
      }
    });

    test("throws when provider list is empty", async () => {
      try {
        await runProviderFallback({
          request: { messages: [], model: "test", stream: false, mode: "balanced" },
          providers: [],
          adapter: mockAdapter(),
          resolveApiKey: () => "sk-mock",
          cooldownStore: createProviderCooldownStore(),
          nowMs: () => Date.now(),
        });

        expect.unreachable("should have thrown");
      } catch (error) {
        const typed = error as Error & { code: string };

        expect(typed.code).toBe("no_provider_available");
      }
    });
  });

  describe("runProviderStreamFallback", () => {
    test("returns first provider stream on success", async () => {
      const result = await runProviderStreamFallback({
        request: { messages: [], model: "test", stream: true, mode: "balanced" },
        providers: [makeProvider("alpha", 90)],
        adapter: mockAdapter({ sendStream: async () => ({ status: 200, headers: {}, stream: streamFromText("data: ok\n\n") }) }),
        resolveApiKey: () => "sk-mock",
        cooldownStore: createProviderCooldownStore(),
        nowMs: () => Date.now(),
      });

      expect(await new Response(result.stream).text()).toBe("data: ok\n\n");
    });

    test("falls back before stream starts on 429", async () => {
      let callCount = 0;
      const cooldownStore = createProviderCooldownStore();
      const nowMs = Date.now();
      const result = await runProviderStreamFallback({
        request: { messages: [], model: "test", stream: true, mode: "balanced" },
        providers: [makeProvider("alpha", 90), makeProvider("beta", 80)],
        adapter: mockAdapter({ sendStream: async () => nextStreamResponse(++callCount) }),
        resolveApiKey: () => "sk-mock",
        cooldownStore,
        nowMs: () => nowMs,
      });

      expect(await new Response(result.stream).text()).toBe("data: ok\n\n");
      expect(callCount).toBe(2);
      expect(cooldownStore.isProviderCoolingDown("alpha", nowMs)).toBe(true);
    });

    test("throws when all stream providers fail before stream starts", async () => {
      try {
        await runProviderStreamFallback({
          request: { messages: [], model: "test", stream: true, mode: "balanced" },
          providers: [makeProvider("alpha", 90)],
          adapter: mockAdapter({ sendStream: async () => ({ status: 500, headers: {} }) }),
          resolveApiKey: () => "sk-mock",
          cooldownStore: createProviderCooldownStore(),
          nowMs: () => Date.now(),
        });

        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as Error & { code: string }).code).toBe("provider_server_error");
      }
    });

    test("records time to first token when stream is consumed", async () => {
      const repository = mockStatsRepository();
      let nowMs = 1_000;
      const result = await runProviderStreamFallback({
        request: { messages: [], model: "test", stream: true, mode: "balanced" },
        providers: [makeProvider("alpha", 90)],
        adapter: mockAdapter({ sendStream: async () => ({ status: 200, headers: {}, stream: streamFromText("data: ok\n\n") }) }),
        resolveApiKey: () => "sk-mock",
        cooldownStore: createProviderCooldownStore(),
        providerStatsRepository: repository,
        nowMs: () => nowMs += 50,
      });

      await new Response(result.stream).text();

      expect(repository.updates[0]?.status).toBe("success");
      expect(repository.updates[0]?.timeToFirstTokenMs).toBeGreaterThan(0);
      expect(repository.updates[0]?.latencyMs).toBeUndefined();
    });
  });

  describe("classifyProviderError", () => {
    test("classifies 429 as rate_limited", () => {
      expect(classifyProviderError({ status: 429, body: {}, headers: {} }, undefined)).toBe("provider_rate_limited");
    });

    test("classifies 401 as auth_error", () => {
      expect(classifyProviderError({ status: 401, body: {}, headers: {} }, undefined)).toBe("provider_auth_error");
    });

    test("classifies 403 as auth_error", () => {
      expect(classifyProviderError({ status: 403, body: {}, headers: {} }, undefined)).toBe("provider_auth_error");
    });

    test("classifies 500 as server_error", () => {
      expect(classifyProviderError({ status: 500, body: {}, headers: {} }, undefined)).toBe("provider_server_error");
    });

    test("classifies malformed 200 as malformed_response", () => {
      expect(classifyProviderError({ status: 200, body: {}, headers: {}, isMalformed: true }, undefined)).toBe("provider_malformed_response");
    });

    test("classifies AbortError as timeout", () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");

      expect(classifyProviderError(undefined, abortError)).toBe("provider_timeout");
    });

    test("classifies fetch TypeError as network_error", () => {
      const fetchError = new TypeError("fetch failed");

      expect(classifyProviderError(undefined, fetchError)).toBe("provider_network_error");
    });
  });
});

function streamFromText(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function nextStreamResponse(callCount: number) {
  if (callCount === 1) {
    return { status: 429, headers: { "retry-after": "1" } };
  }

  return { status: 200, headers: {}, stream: streamFromText("data: ok\n\n") };
}
