import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { ProviderAdapter } from "../../provider/provider-adapter";
import { chatCompletionRequestSchema } from "./chat-completion.schema";
import { ROUTE_PATH } from "./chat-completion.type";
import {
  isChatCompletionLoggingEnabled,
  routeChatCompletion,
  RoutingError,
} from "./chat-completion.service";
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "../../shared/http-status";
import { createRequestId, REQUEST_ID_HEADER_NAME } from "../../shared/request-id";
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

const CLIENT_ERROR_CODES = new Set<string>([
  "no_provider_available",
  "no_api_key",
  "invalid_request",
]);

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
  const startedAtMs = Date.now();
  const requestId = createRequestId();

  context.header(REQUEST_ID_HEADER_NAME, requestId);

  let body: unknown;

  try {
    body = await context.req.json();
  } catch {
    logChatCompletion(requestId, "unknown", false, "malformed_json", startedAtMs);
    return sendBadRequestError(context, MALFORMED_JSON_MESSAGE);
  }

  const parseResult = chatCompletionRequestSchema.safeParse(body);

  if (!parseResult.success) {
    logChatCompletion(requestId, "unknown", false, "invalid_request", startedAtMs);
    return sendBadRequestError(context, parseResult.error.message);
  }

  logRequestBody(requestId, parseResult.data);

  try {
    const result = await routeChatCompletion(parseResult.data, adapter);

    if (result.type === "stream") {
      logChatCompletion(requestId, parseResult.data.model, true, "ok", startedAtMs);
      logStreamResponseBody(requestId);
      return sendStreamResponse(result.response, requestId);
    }

    logChatCompletion(requestId, parseResult.data.model, false, "ok", startedAtMs);
    logResponseBody(requestId, result.response);
    return context.json(result.response);
  } catch (error) {
    const code = error instanceof RoutingError ? error.code : INTERNAL_ERROR_CODE;

    logChatCompletion(
      requestId,
      parseResult.data.model,
      parseResult.data.stream ?? false,
      code,
      startedAtMs,
    );

    if (error instanceof RoutingError && CLIENT_ERROR_CODES.has(error.code)) {
      return sendBadRequestError(context, error.message);
    }

    return sendInternalError(context);
  }
}

function logChatCompletion(
  requestId: string,
  model: string,
  stream: boolean,
  status: string,
  startedAtMs: number,
): void {
  console.log(
    JSON.stringify({
      request_id: requestId,
      route: ROUTE_PATH,
      model,
      stream,
      status,
      latency_ms: Date.now() - startedAtMs,
    }),
  );
}

function logRequestBody(requestId: string, body: unknown): void {
  if (!isChatCompletionLoggingEnabled()) {
    return;
  }

  console.log(JSON.stringify({ request_id: requestId, direction: "request", body }));
}

function logResponseBody(requestId: string, body: unknown): void {
  if (!isChatCompletionLoggingEnabled()) {
    return;
  }

  console.log(JSON.stringify({ request_id: requestId, direction: "response", body }));
}

function logStreamResponseBody(requestId: string): void {
  if (!isChatCompletionLoggingEnabled()) {
    return;
  }

  console.log(
    JSON.stringify({
      request_id: requestId,
      direction: "response",
      stream: true,
      note: "stream body is passed through, not captured",
    }),
  );
}

function sendStreamResponse(response: OpenAIChatStreamResponse, requestId: string): Response {
  const headers = new Headers(response.headers);

  headers.set(REQUEST_ID_HEADER_NAME, requestId);

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
