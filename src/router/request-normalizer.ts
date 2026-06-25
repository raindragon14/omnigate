import type { ChatMessage, ChatMessageContentPart, OpenAIChatRequest, RouterChatMessage, RouterRequest, RoutingMode } from "../shared/signatures";

const DEFAULT_RESPONSE_MODE: RoutingMode = "balanced";
const TEXT_CONTENT_PART_TYPE = "text";

/** Error thrown when a request uses message content this gateway cannot route safely. */
export class UnsupportedMessageContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedMessageContentError";
  }
}

/**
 * Strips unknown provider-specific fields (e.g. extra_body) from an incoming
 * OpenAI-compatible request and converts it into the canonical RouterRequest
 * shape used internally by the routing engine.
 * @param request  The raw incoming request body.
 * @returns A normalised RouterRequest with snake_case converted to camelCase.
 */
export function normalizeRequest(request: OpenAIChatRequest): RouterRequest {
  return {
    messages: request.messages.map(normalizeMessage),
    model: request.model,
    maxTokens: request.max_tokens,
    temperature: request.temperature,
    topP: request.top_p,
    stream: request.stream ?? false,
    tools: request.tools,
    toolChoice: request.tool_choice,
    responseFormat: request.response_format,
    mode: request.mode ?? DEFAULT_RESPONSE_MODE,
  };
}

function normalizeMessage(message: ChatMessage): RouterChatMessage {
  return {
    ...message,
    content: normalizeMessageContent(message.role, message.content),
  };
}

function normalizeMessageContent(role: ChatMessage["role"], content: ChatMessage["content"]): string | null {
  if (content === null && role !== "assistant" && role !== "tool") {
    throw new UnsupportedMessageContentError(`content cannot be null for ${role} messages`);
  }

  if (!Array.isArray(content)) {
    return content;
  }

  return content.map(getTextContentPartText).join("");
}

function getTextContentPartText(part: ChatMessageContentPart): string {
  if (part.type !== TEXT_CONTENT_PART_TYPE) {
    throw new UnsupportedMessageContentError(`Only text message content parts are supported; received "${part.type}".`);
  }

  if (typeof part.text !== "string") {
    throw new UnsupportedMessageContentError("Text message content parts must include string text.");
  }

  return part.text;
}
