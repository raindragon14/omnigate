import { describe, expect, test } from "bun:test";

import { normalizeRequest } from "../../router/request-normalizer";
import { routeChatCompletion, RoutingError } from "./chat-completion.service";

/** Unit tests for chat-completion feature: request normalisation and routing. */
describe("chat completion feature", () => {
  /** Should convert an OpenAI-style request into the internal RouterRequest shape. */
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

  /** Should default stream to false when the incoming request omits it. */
  test("defaults stream to false when missing", () => {
    const { stream } = normalizeRequest({ model: "test", messages: [{ role: "user", content: "hi" }] });

    expect(stream).toBe(false);
  });

  /** Should strip unknown fields (e.g. extra_body) during normalisation. */
  test("strips unknown fields during normalization", () => {
    const routerRequest = normalizeRequest({
      model: "test",
      messages: [{ role: "user" as const, content: "hi" }],
      extra_body: { thinking: true },
    } as import("../../shared/signatures").OpenAIChatRequest);

    expect(routerRequest.model).toBe("test");
    expect("extra_body" in routerRequest).toBe(false);
  });

  /** Should pass through tools, tool_choice, and response_format. */
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

  /** Should throw RoutingError when no provider is available for unknown model. */
  test("throws routing error for unknown model", async () => {
    try {
      await routeChatCompletion({ model: "unknown/model", messages: [{ role: "user", content: "hi" }] });

      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RoutingError);
      expect((error as RoutingError).code).toBe("no_provider_available");
    }
  });
});
