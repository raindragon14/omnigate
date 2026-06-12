import type { OpenAIChatRequest, RouterRequest, RoutingMode } from "../shared/signatures";

const DEFAULT_RESPONSE_MODE: RoutingMode = "balanced";

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
    tools: request.tools,
    toolChoice: request.tool_choice,
    responseFormat: request.response_format,
    mode: DEFAULT_RESPONSE_MODE,
  };
}
