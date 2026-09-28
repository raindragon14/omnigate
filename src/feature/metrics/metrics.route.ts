import type { Hono } from "hono";

import { getMetricsController } from "./metrics.controller";

const METRICS_ROUTE_PATH = "/metrics";

/**
 * Registers the GET /metrics route on the given Hono application.
 * Authentication is applied by the shared Bearer-token middleware.
 * @param app  The Hono application instance.
 */
export function registerMetricsRoute(app: Hono): void {
  app.get(METRICS_ROUTE_PATH, getMetricsController);
}
