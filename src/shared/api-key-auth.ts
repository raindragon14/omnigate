import type { Context, Hono, Next } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { timingSafeEqual } from "crypto";

import { HTTP_STATUS_UNAUTHORIZED } from "./http-status";

const AUTH_ROUTE_PATTERNS = ["/v1/*", "/metrics"];
const AUTHORIZATION_HEADER = "Authorization";
const UNAUTHORIZED_CODE = "unauthorized";
const UNAUTHORIZED_MESSAGE = "Unauthorized";

/**
 * Registers Bearer-token authentication for OpenAI-compatible /v1 routes and
 * the operational /metrics endpoint. GET /health stays unauthenticated.
 * @param app     The Hono application instance.
 * @param apiKey  The expected OmniGate API key.
 */
export function registerApiKeyAuth(app: Hono, apiKey: string): void {
  const expectedAuthorization = Buffer.from(`Bearer ${apiKey}`);

  const authenticate = async (context: Context, next: Next): Promise<Response | void> => {
    if (isAuthorized(context.req.header(AUTHORIZATION_HEADER), expectedAuthorization)) {
      await next();
      return;
    }

    return sendUnauthorized(context);
  };

  app.use(AUTH_ROUTE_PATTERNS[0]!, authenticate);
  app.use(AUTH_ROUTE_PATTERNS[1]!, authenticate);
}

/**
 * Constant-time authorization check.
 *
 * Uses timingSafeEqual to prevent timing side-channel attacks where an
 * attacker measures response-time differences to infer the API key
 * character-by-character. At the key lengths OmniGate uses (64 hex chars),
 * the practical risk is negligible — this is defense-in-depth to ensure
 * correctness regardless of key format or runtime behavior.
 */
function isAuthorized(
  rawAuthorization: string | undefined,
  expectedAuthorization: Buffer,
): boolean {
  if (rawAuthorization === undefined) {
    return false;
  }

  const input = Buffer.from(rawAuthorization);

  if (expectedAuthorization.length !== input.length) {
    return false;
  }

  return timingSafeEqual(expectedAuthorization, input);
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
