import type { Context } from "hono";

import { getHealthStatus } from "./health.service";

export function getHealthController(context: Context): Response {
  return context.json(getHealthStatus());
}
