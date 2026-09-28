import type { Hono } from "hono";

import { getStatsController, handleClearCooldowns, handleResetStats } from "./admin.controller";

const STATS_ROUTE_PATH = "/v1/stats";
const CLEAR_COOLDOWNS_ROUTE_PATH = "/v1/admin/cooldowns/clear";
const RESET_STATS_ROUTE_PATH = "/v1/admin/stats/reset";

/**
 * Registers the admin routes (GET /v1/stats, POST /v1/admin/*).
 * Authentication is applied by the shared Bearer-token middleware.
 * @param app  The Hono application instance.
 */
export function registerAdminRoutes(app: Hono): void {
  app.get(STATS_ROUTE_PATH, getStatsController);
  app.post(CLEAR_COOLDOWNS_ROUTE_PATH, handleClearCooldowns);
  app.post(RESET_STATS_ROUTE_PATH, handleResetStats);
}
