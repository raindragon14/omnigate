import { describe, expect, test } from "bun:test";

import type { ProviderCandidate, RouterRequest } from "../shared/signatures";
import { createOpenAiCompatibleAdapter } from "./openai-compatible-adapter";

const PROVIDER: ProviderCandidate = {
  id: "alpha",
  baseUrl: "https://example.com/v1",
  model: "provider-model",
  family: "deepseek-v4-flash",
  priority: 100,
  enabled: true,
  paidFallback: false,
  apiKeyEnv: "KEY_ALPHA",
  context: 100_000,
  supportsTools: true,
  supportsJson: true,
  supportsStreaming: true,
  rateLimit: {},
};

/** Unit tests for the generic OpenAI-compatible adapter. */
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
});
