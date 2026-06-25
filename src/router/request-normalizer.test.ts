import { describe, expect, test } from "bun:test";

import { normalizeRequest, UnsupportedMessageContentError } from "./request-normalizer";

describe("request normalizer", () => {
  test("normalizes a complete OpenAI request", () => {
    const routerRequest = normalizeRequest({
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 100,
      temperature: 0.5,
      top_p: 0.9,
      stream: true,
      tools: [{ type: "function" }],
      tool_choice: "auto",
      response_format: { type: "json_object" },
      mode: "speed",
    });

    expect(routerRequest.model).toBe("test-model");
    expect(routerRequest.messages).toEqual([{ role: "user", content: "Hello" }]);
    expect(routerRequest.maxTokens).toBe(100);
    expect(routerRequest.temperature).toBe(0.5);
    expect(routerRequest.topP).toBe(0.9);
    expect(routerRequest.stream).toBe(true);
    expect(routerRequest.tools).toEqual([{ type: "function" }]);
    expect(routerRequest.toolChoice).toBe("auto");
    expect(routerRequest.responseFormat).toEqual({ type: "json_object" });
    expect(routerRequest.mode).toBe("speed");
  });

  test("defaults stream to false and mode to balanced", () => {
    const routerRequest = normalizeRequest({
      model: "test",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(routerRequest.stream).toBe(false);
    expect(routerRequest.mode).toBe("balanced");
  });

  test("allows null content for assistant and tool messages", () => {
    expect(() =>
      normalizeRequest({
        model: "test",
        messages: [{ role: "assistant", content: null }],
      })
    ).not.toThrow();

    expect(() =>
      normalizeRequest({
        model: "test",
        messages: [{ role: "tool", content: null, tool_call_id: "call_1" }],
      })
    ).not.toThrow();
  });

  test("rejects null content for user or system messages", () => {
    expect(() =>
      normalizeRequest({
        model: "test",
        messages: [{ role: "user", content: null }],
      })
    ).toThrow();

    expect(() =>
      normalizeRequest({
        model: "test",
        messages: [{ role: "system", content: null }],
      })
    ).toThrow();
  });

  test("normalizes text content parts to a single string", () => {
    const routerRequest = normalizeRequest({
      model: "test",
      messages: [{ role: "user", content: [{ type: "text", text: "Hello " }, { type: "text", text: "world" }] }],
    });

    expect(routerRequest.messages).toEqual([{ role: "user", content: "Hello world" }]);
  });

  test("throws for non-text content parts", () => {
    expect(() =>
      normalizeRequest({
        model: "test",
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/image.png" } }] }],
      })
    ).toThrow(UnsupportedMessageContentError);
  });

  test("throws for non-string text content", () => {
    expect(() =>
      normalizeRequest({
        model: "test",
        messages: [{ role: "user", content: [{ type: "text", text: 123 as unknown as string }] }],
      })
    ).toThrow(UnsupportedMessageContentError);
  });

  test("passes through name, tool_call_id, and tool_calls", () => {
    const routerRequest = normalizeRequest({
      model: "test",
      messages: [
        {
          role: "tool",
          content: "result",
          name: "my_tool",
          tool_call_id: "call_1",
          tool_calls: [{ id: "call_1" }],
        },
      ],
    });

    expect(routerRequest.messages[0]).toEqual({
      role: "tool",
      content: "result",
      name: "my_tool",
      tool_call_id: "call_1",
      tool_calls: [{ id: "call_1" }],
    });
  });
});
