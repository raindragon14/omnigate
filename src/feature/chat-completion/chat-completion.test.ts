import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import type { ProviderAdapter } from "../../provider/provider-adapter";
import type { OpenAIChatCompletionResponse } from "../../shared/signatures";
import { normalizeRequest } from "../../router/request-normalizer";
import { resetChatCompletionRoutingState, routeChatCompletion, RoutingError } from "./chat-completion.service";

const SUCCESS_RESPONSE: OpenAIChatCompletionResponse = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 1_700_000_000,
  model: "omnigate/auto-fast",
  choices: [{ index: 0, message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
};

const originalEnv: Record<string, string | undefined> = {};

describe("chat completion feature", () => {
  beforeAll(() => {
    originalEnv.PROVIDER_A_API_KEY = Bun.env.PROVIDER_A_API_KEY;
    originalEnv.PROVIDER_B_API_KEY = Bun.env.PROVIDER_B_API_KEY;
    originalEnv.PROVIDER_C_API_KEY = Bun.env.PROVIDER_C_API_KEY;
    originalEnv.PROVIDER_D_API_KEY = Bun.env.PROVIDER_D_API_KEY;
    Bun.env.PROVIDER_A_API_KEY = "test-provider-a-key";
    Bun.env.PROVIDER_B_API_KEY = "test-provider-b-key";
    Bun.env.PROVIDER_C_API_KEY = "test-provider-c-key";
    Bun.env.PROVIDER_D_API_KEY = "test-provider-d-key";
  });

  afterAll(() => {
    Bun.env.PROVIDER_A_API_KEY = originalEnv.PROVIDER_A_API_KEY;
    Bun.env.PROVIDER_B_API_KEY = originalEnv.PROVIDER_B_API_KEY;
    Bun.env.PROVIDER_C_API_KEY = originalEnv.PROVIDER_C_API_KEY;
    Bun.env.PROVIDER_D_API_KEY = originalEnv.PROVIDER_D_API_KEY;
    resetChatCompletionRoutingState();
  });

  beforeEach(() => {
    resetChatCompletionRoutingState();
  });

  test("normalizes OpenAI request to router request", () => {
    const routerRequest = normalizeRequest({
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 100,
      temperature: 0.5,
      top_p: 0.9,
      stream: false,
    });

    expect(routerRequest.model).toBe("test-model");
    expect(routerRequest.messages).toEqual([{ role: "user", content: "Hello" }]);
    expect(routerRequest.maxTokens).toBe(100);
    expect(routerRequest.temperature).toBe(0.5);
    expect(routerRequest.topP).toBe(0.9);
    expect(routerRequest.stream).toBe(false);
    expect(routerRequest.mode).toBe("balanced");
  });

  test("normalizes text-only content parts to string content", () => {
    const routerRequest = normalizeRequest({
      model: "test-model",
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }, { type: "text", text: " world" }] }],
    });

    expect(routerRequest.messages).toEqual([{ role: "user", content: "Hello world" }]);
  });

  test("defaults stream to false when missing", () => {
    const { stream } = normalizeRequest({ model: "test", messages: [{ role: "user", content: "hi" }] });

    expect(stream).toBe(false);
  });

  test("strips unknown fields during normalization", () => {
    const routerRequest = normalizeRequest({
      model: "test",
      messages: [{ role: "user" as const, content: "hi" }],
      extra_body: { thinking: true },
    } as import("../../shared/signatures").OpenAIChatRequest);

    expect(routerRequest.model).toBe("test");
    expect("extra_body" in routerRequest).toBe(false);
  });

  test("passes through tools and response format", () => {
    const routerRequest = normalizeRequest({
      model: "test",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function" }],
      tool_choice: "auto",
      response_format: { type: "json_object" },
    });

    expect(routerRequest.tools).toEqual([{ type: "function" }]);
    expect(routerRequest.toolChoice).toBe("auto");
    expect(routerRequest.responseFormat).toEqual({ type: "json_object" });
  });

  test("throws invalid request for multimodal content parts", async () => {
    try {
      await routeChatCompletion({
        model: "omnigate/auto-fast",
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/image.png" } }] }],
      });

      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RoutingError);
      expect((error as RoutingError).code).toBe("invalid_request");
      expect((error as RoutingError).message).toContain("Only text message content parts are supported");
    }
  });

  test("throws routing error for unknown model", async () => {
    try {
      await routeChatCompletion({ model: "unknown/model", messages: [{ role: "user", content: "hi" }] });

      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RoutingError);
      expect((error as RoutingError).code).toBe("no_provider_available");
    }
  });

  test("returns upstream JSON response through the best provider", async () => {
    const adapter = createMockAdapter({ json: SUCCESS_RESPONSE });
    const result = await routeChatCompletion({
      model: "omnigate/auto-fast",
      messages: [{ role: "user", content: "hi" }],
    }, adapter);

    expect(result.type).toBe("json");
    expect(result.response).toEqual(SUCCESS_RESPONSE);
  });

  test("falls back to the next provider on 429", async () => {
    const adapter = createMockAdapter({
      responses: [
        { status: 429, headers: { "retry-after": "1" }, body: {} },
        { status: 200, headers: {}, body: SUCCESS_RESPONSE },
      ],
    });
    const result = await routeChatCompletion({
      model: "omnigate/coding-auto",
      messages: [{ role: "user", content: "hi" }],
    }, adapter);

    expect(result.type).toBe("json");
    expect(result.response).toEqual(SUCCESS_RESPONSE);
  });
});

type MockAdapterOptions =
  | { json: OpenAIChatCompletionResponse }
  | { responses: Array<{ status: number; headers: Record<string, string>; body: Record<string, unknown> }> };

function createMockAdapter(options: MockAdapterOptions): ProviderAdapter {
  let callCount = 0;

  return {
    id: "mock",
    supports: () => true,
    transformRequest: (request, provider, apiKey) => ({
      url: provider.baseUrl,
      headers: { Authorization: `Bearer ${apiKey}` },
      body: { model: provider.model, messages: request.messages, stream: request.stream },
    }),
    send: async () => {
      if ("json" in options) {
        return { status: 200, headers: {}, body: options.json as unknown as Record<string, unknown> };
      }

      const response = options.responses[callCount++];

      if (response === undefined) {
        throw new Error("Unexpected mock adapter call");
      }

      return response;
    },
    sendStream: async () => {
      throw new Error("Mock adapter configured for JSON; sendStream() should not be called");
    },
  };
}
