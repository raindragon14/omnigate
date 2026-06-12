import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { chatCompletionRequestSchema } from "./chat-completion.schema";
import { routeChatCompletion, RoutingError } from "./chat-completion.service";
import { HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_INTERNAL_SERVER_ERROR } from "../../shared/http-status";
import type { ChatCompletionResponse } from "./chat-completion.type";

const INVALID_REQUEST_CODE = "invalid_request";
const INTERNAL_ERROR_CODE = "internal_server_error";
const INTERNAL_ERROR_MESSAGE = "Internal server error";

const CLIENT_ERROR_CODES = new Set(["no_provider_available", "no_api_key"]);

/**
 * Handles POST /v1/chat/completions requests.  Validates the body with Zod,
 * delegates to routeChatCompletion, and maps errors to appropriate HTTP
 * responses (400 for client errors, 500 for server errors).
 * @param context  Hono request context.
 * @returns A JSON Response containing either the completion or an error shape.
 */
export async function handleChatCompletion(context: Context): Promise<Response> {
  const parseResult = chatCompletionRequestSchema.safeParse(await context.req.json());

  if (!parseResult.success) {
    return sendBadRequestError(context, parseResult.error.message);
  }

  try {
    const response = await routeChatCompletion(parseResult.data);

    return context.json(response);
  } catch (error) {
    if (error instanceof RoutingError && CLIENT_ERROR_CODES.has(error.code)) {
      return sendBadRequestError(context, error.message);
    }

    const message = error instanceof Error ? error.message : INTERNAL_ERROR_MESSAGE;

    return sendInternalError(context, message);
  }
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

function sendInternalError(context: Context, message: string): Response {
  return context.json(
    {
      error: {
        message,
        type: INTERNAL_ERROR_CODE,
        code: INTERNAL_ERROR_CODE,
      },
    } satisfies ChatCompletionResponse,
    HTTP_STATUS_INTERNAL_SERVER_ERROR as ContentfulStatusCode,
  );
}
