import { describe, expect, test } from "bun:test";

import type { ProviderCandidate, RouterRequest } from "../shared/signatures";
import { createOpenAiCompatibleAdapter } from "./openai-compatible-adapter";

const PROVIDER: ProviderCandidate = {
  id: "alpha",
  baseUrl: "https://example.com/v1",
  model: "provider-model",
  family: "deepseek-v4-flash",
  priority: 100,
  qualityScore: 90,
  speedScore: 85,
  enabled: true,
  paidFallback: false,
  apiKeyEnv: "KEY_ALPHA",
  context: 100_000,
  supportsTools: true,
  supportsJson: true,
  supportsStreaming: true,
  rateLimit: {},
};

describe("openai-compatible adapter", () => {
  test("forwards tool and JSON request fields", () => {
    const adapter = createOpenAiCompatibleAdapter();
    const request: RouterRequest = {
      model: "omnigate/deepseek-v4-flash-auto",
      messages: [{ role: "user", content: "Return JSON" }],
      stream: false,
      mode: "balanced",
      tools: [{ type: "function" }],
      toolChoice: "auto",
      responseFormat: { type: "json_object" },
    };

    const providerRequest = adapter.transformRequest(request, PROVIDER, "sk-test");

    expect(providerRequest.body.model).toBe("provider-model");
    expect(providerRequest.body.tools).toEqual([{ type: "function" }]);
    expect(providerRequest.body.tool_choice).toBe("auto");
    expect(providerRequest.body.response_format).toEqual({ type: "json_object" });
  });

  test("returns unconsumed streaming response", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode("data: ok\n\n"));
        controller.close();
      },
    });

    const mockFetch = (async () =>
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })) as unknown as typeof fetch;

    const adapter = createOpenAiCompatibleAdapter({ fetch: mockFetch });
    const response = await adapter.sendStream({ url: "https://example.com", headers: {}, body: {} });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.stream).toBeDefined();
  });

  test("returns JSON response for non-streaming request", async () => {
    const mockResponse = {
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1_700_000_000,
      model: "provider-model",
      choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };

    const mockFetch = (async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    const adapter = createOpenAiCompatibleAdapter({ fetch: mockFetch });
    const response = await adapter.send({ url: "https://example.com", headers: {}, body: {} });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockResponse);
    expect(response.isMalformed).toBe(false);
  });

  test("marks malformed JSON responses", async () => {
    const mockFetch = (async () =>
      new Response("not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    const adapter = createOpenAiCompatibleAdapter({ fetch: mockFetch });
    const response = await adapter.send({ url: "https://example.com", headers: {}, body: {} });

    expect(response.status).toBe(200);
    expect(response.isMalformed).toBe(true);
  });
});
