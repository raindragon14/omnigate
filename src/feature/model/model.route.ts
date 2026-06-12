import type { Hono } from "hono";

import { listModelController } from "./model.controller";

const MODEL_ROUTE_PATH = "/v1/models";

/** Registers the GET /v1/models route on the given Hono app. */
export function registerModelRoute(app: Hono): void {
  app.get(MODEL_ROUTE_PATH, listModelController);
}
