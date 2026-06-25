import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { ProviderAdapter } from "../../provider/provider-adapter";
import { chatCompletionRequestSchema } from "./chat-completion.schema";
import { routeChatCompletion, RoutingError } from "./chat-completion.service";
import { HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_INTERNAL_SERVER_ERROR } from "../../shared/http-status";
import type { ChatCompletionResponse, OpenAIChatStreamResponse } from "../../shared/signatures";

const INVALID_REQUEST_CODE = "invalid_request";
const INTERNAL_ERROR_CODE = "internal_server_error";
const INTERNAL_ERROR_MESSAGE = "Internal server error";
const MALFORMED_JSON_MESSAGE = "Malformed JSON request body";
const STREAM_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

const CLIENT_ERROR_CODES = new Set<string>(["no_provider_available", "no_api_key", "invalid_request"]);

/**
 * Handles POST /v1/chat/completions requests.  Validates the body with Zod,
 * delegates to routeChatCompletion, and maps errors to appropriate HTTP
 * responses (400 for client errors, 500 for server errors).
 * @param context  Hono request context.
 * @returns A JSON Response containing either the completion or an error shape.
 */
export async function handleChatCompletion(
  context: Context,
  adapter?: ProviderAdapter,
): Promise<Response> {
  let body: unknown;

  try {
    body = await context.req.json();
  } catch {
    return sendBadRequestError(context, MALFORMED_JSON_MESSAGE);
  }

  const parseResult = chatCompletionRequestSchema.safeParse(body);

  if (!parseResult.success) {
    return sendBadRequestError(context, parseResult.error.message);
  }

  try {
    const result = await routeChatCompletion(parseResult.data, adapter);

    if (result.type === "stream") {
      return sendStreamResponse(result.response);
    }

    return context.json(result.response);
  } catch (error) {
    if (error instanceof RoutingError && CLIENT_ERROR_CODES.has(error.code)) {
      return sendBadRequestError(context, error.message);
    }

    return sendInternalError(context);
  }
}

function sendStreamResponse(response: OpenAIChatStreamResponse): Response {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(STREAM_RESPONSE_HEADERS)) {
    headers.set(key, value);
  }

  return new Response(response.stream, { headers });
}

function sendBadRequestError(context: Context, message: string): Response {
  return context.json(
    {
      error: {
        message,
        type: INVALID_REQUEST_CODE,
        code: INVALID_REQUEST_CODE,
      },
    } satisfies ChatCompletionResponse,
    HTTP_STATUS_BAD_REQUEST as ContentfulStatusCode,
  );
}

function sendInternalError(context: Context): Response {
  return context.json(
    {
      error: {
        message: INTERNAL_ERROR_MESSAGE,
        type: INTERNAL_ERROR_CODE,
        code: INTERNAL_ERROR_CODE,
      },
    } satisfies ChatCompletionResponse,
    HTTP_STATUS_INTERNAL_SERVER_ERROR as ContentfulStatusCode,
  );
}
