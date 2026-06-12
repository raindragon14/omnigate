import { Hono } from "hono";

import { registerHealthRoute } from "./feature/health/health.route";
import { registerModelRoute } from "./feature/model/model.route";
import { registerChatCompletionRoute } from "./feature/chat-completion/chat-completion.route";
import { registerAppErrorHandler } from "./shared/app-error";

/**
 * Creates and configures the Hono application with all feature routes
 * (health, models, chat completions) and global error handling.
 * @returns A fully configured Hono application.
 */
export function createApp(): Hono {
  const app = new Hono();

  registerHealthRoute(app);
  registerModelRoute(app);
  registerChatCompletionRoute(app);
  registerAppErrorHandler(app);

  return app;
}
