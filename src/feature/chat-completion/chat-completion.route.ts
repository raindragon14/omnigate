import type { Hono } from "hono";

import { ROUTE_PATH } from "./chat-completion.type";
import { handleChatCompletion } from "./chat-completion.controller";

/** Registers the POST /v1/chat/completions route on the given Hono app. */
export function registerChatCompletionRoute(app: Hono): void {
  app.post(ROUTE_PATH, handleChatCompletion);
}
