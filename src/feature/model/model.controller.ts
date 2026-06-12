import type { Context } from "hono";

import { listRouterModels } from "./model.service";

export function listModelController(context: Context): Response {
  return context.json(listRouterModels());
}
