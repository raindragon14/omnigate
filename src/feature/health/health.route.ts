import type { Hono } from "hono";

import { getHealthController } from "./health.controller";

const HEALTH_ROUTE_PATH = "/health";

/**
 * Registers the GET /health route on the given Hono application.
 * @param app  The Hono application instance.
 */
export function registerHealthRoute(app: Hono): void {
  app.get(HEALTH_ROUTE_PATH, getHealthController);
}
