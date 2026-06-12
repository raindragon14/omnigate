import type { OpenAIChatRequest, RouterRequest } from "../shared/signatures";

/**
 * Strips unknown provider-specific fields (e.g. extra_body) from an incoming
 * OpenAI-compatible request and converts it into the canonical RouterRequest
 * shape used internally by the routing engine.
 * @param request  The raw incoming request body.
 * @returns A normalised RouterRequest with snake_case converted to camelCase.
 */
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
