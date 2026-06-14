import type { Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { HTTP_STATUS_UNAUTHORIZED } from "./http-status";

const AUTH_ROUTE_PATTERN = "/v1/*";
const AUTHORIZATION_HEADER = "Authorization";
const UNAUTHORIZED_CODE = "unauthorized";
const UNAUTHORIZED_MESSAGE = "Unauthorized";

/**
 * Registers Bearer-token authentication for OpenAI-compatible /v1 routes.
 * @param app     The Hono application instance.
 * @param apiKey  The expected OmniGate API key.
 */
export function registerApiKeyAuth(app: Hono, apiKey: string): void {
  app.use(AUTH_ROUTE_PATTERN, async (context, next) => {
    if (isAuthorized(context.req.header(AUTHORIZATION_HEADER), apiKey)) {
      await next();
      return;
    }

    return sendUnauthorized(context);
  });
}

function isAuthorized(rawAuthorization: string | undefined, apiKey: string): boolean {
  return rawAuthorization === `Bearer ${apiKey}`;
}

function sendUnauthorized(context: Context): Response {
  return context.json(
    {
      error: {
        message: UNAUTHORIZED_MESSAGE,
        type: UNAUTHORIZED_CODE,
        code: UNAUTHORIZED_CODE,
      },
    },
    HTTP_STATUS_UNAUTHORIZED as ContentfulStatusCode,
  );
}
