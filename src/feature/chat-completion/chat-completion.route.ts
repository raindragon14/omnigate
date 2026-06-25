import type { Hono } from "hono";

import type { ProviderAdapter } from "../../provider/provider-adapter";
import { ROUTE_PATH } from "./chat-completion.type";
import { handleChatCompletion } from "./chat-completion.controller";

/**
 * Registers the POST /v1/chat/completions route on the given Hono application.
 * @param app      The Hono application instance.
 * @param adapter  Optional provider adapter to use for routing.
 */
export function registerChatCompletionRoute(app: Hono, adapter?: ProviderAdapter): void {
  app.post(ROUTE_PATH, (context) => handleChatCompletion(context, adapter));
}
