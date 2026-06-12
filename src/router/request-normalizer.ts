import type { OpenAIChatRequest, RouterRequest } from "../shared/signatures";

/** Strips unknown provider-specific fields and converts to internal RouterRequest. */
export function normalizeRequest(request: OpenAIChatRequest): RouterRequest {
  return {
    messages: request.messages,
    model: request.model,
    maxTokens: request.max_tokens,
    temperature: request.temperature,
    topP: request.top_p,
    stream: request.stream ?? false,
  };
}
