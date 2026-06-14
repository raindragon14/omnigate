import { Hono } from "hono";

import { registerHealthRoute } from "./feature/health/health.route";
import { registerModelRoute } from "./feature/model/model.route";
import { registerChatCompletionRoute } from "./feature/chat-completion/chat-completion.route";
import { configureChatCompletionStorage } from "./feature/chat-completion/chat-completion.service";
import { loadAppConfig } from "./config/config-loader";
import { registerAppErrorHandler } from "./shared/app-error";
import { registerApiKeyAuth } from "./shared/api-key-auth";
import type { AppConfig } from "./shared/signatures";

/**
 * Creates and configures the Hono application with all feature routes
 * (health, models, chat completions) and global error handling.
 * @returns A fully configured Hono application.
 */
export function createApp(appConfig: AppConfig = loadAppConfig()): Hono {
  const app = new Hono();

  configureChatCompletionStorage(appConfig.databasePath);
  registerHealthRoute(app);
  registerApiKeyAuth(app, appConfig.omnigateApiKey);
  registerModelRoute(app);
  registerChatCompletionRoute(app);
  registerAppErrorHandler(app);

  return app;
}
