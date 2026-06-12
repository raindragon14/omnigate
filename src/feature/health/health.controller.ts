import type { Context } from "hono";

import { getHealthStatus } from "./health.service";

/** Handles GET /health — returns service liveness status. */
export function getHealthController(context: Context): Response {
  return context.json(getHealthStatus());
}
