import type { Context } from "hono";

import { listRouterModels } from "./model.service";

/**
 * Handles GET /v1/models requests.
 * @param context  Hono request context.
 * @returns A JSON Response with the list of router model aliases.
 */
export function listModelController(context: Context): Response {
  return context.json(listRouterModels());
}
