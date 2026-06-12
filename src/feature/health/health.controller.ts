import type { Context } from "hono";

import { getHealthStatus } from "./health.service";

/**
 * Handles GET /health requests.
 * @param context  Hono request context.
 * @returns A JSON Response with service liveness status.
 */
export function getHealthController(context: Context): Response {
  return context.json(getHealthStatus());
}
