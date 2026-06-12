import type { Hono } from "hono";

import { getHealthController } from "./health.controller";

const HEALTH_ROUTE_PATH = "/health";

export function registerHealthRoute(app: Hono): void {
  app.get(HEALTH_ROUTE_PATH, getHealthController);
}
