import type { Hono } from "hono";

import { listModelController } from "./model.controller";

const MODEL_ROUTE_PATH = "/v1/models";

export function registerModelRoute(app: Hono): void {
  app.get(MODEL_ROUTE_PATH, listModelController);
}
