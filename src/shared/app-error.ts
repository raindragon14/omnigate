import type { Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppError } from "./signatures";
import { HTTP_STATUS_INTERNAL_SERVER_ERROR, HTTP_STATUS_NOT_FOUND } from "./http-status";

const INTERNAL_SERVER_ERROR_CODE = "internal_server_error";
const INTERNAL_SERVER_ERROR_MESSAGE = "Internal server error";
const NOT_FOUND_ERROR_CODE = "not_found";
const NOT_FOUND_ERROR_MESSAGE = "Route not found";

export function createAppError(code: string, message: string, statusCode: number): AppError {
  return {
    code,
    message,
    statusCode,
  };
}

export function registerAppErrorHandler(app: Hono): void {
  app.notFound((context) => {
    const appError = createAppError(NOT_FOUND_ERROR_CODE, NOT_FOUND_ERROR_MESSAGE, HTTP_STATUS_NOT_FOUND);

    return sendAppError(context, appError);
  });

  app.onError((_, context) => {
    const appError = createAppError(
      INTERNAL_SERVER_ERROR_CODE,
      INTERNAL_SERVER_ERROR_MESSAGE,
      HTTP_STATUS_INTERNAL_SERVER_ERROR,
    );

    return sendAppError(context, appError);
  });
}

function sendAppError(context: Context, appError: AppError): Response {
  return context.json(
    {
      error: {
        message: appError.message,
        type: appError.code,
        code: appError.code,
      },
    },
    appError.statusCode as ContentfulStatusCode,
  );
}
