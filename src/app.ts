import { Hono } from "hono";

import type { AppConfig } from "./shared/signatures";
import type { ProviderAdapter } from "./provider/provider-adapter";
import { loadAppConfig } from "./config/config-loader";
import { registerChatCompletionRoute } from "./feature/chat-completion/chat-completion.route";
import { configureChatCompletionStorage } from "./feature/chat-completion/chat-completion.service";
import { registerHealthRoute } from "./feature/health/health.route";
import { registerModelRoute } from "./feature/model/model.route";
import { registerApiKeyAuth } from "./shared/api-key-auth";
import { registerAppErrorHandler } from "./shared/app-error";

/**
 * Creates and configures the Hono application with all feature routes
 * (health, models, chat completions) and global error handling.
 * @param appConfig  Application configuration; defaults to loading from env.
 * @param adapter    Optional provider adapter for tests; defaults to the
 *                   OpenAI-compatible adapter in production.
 * @returns A fully configured Hono application.
 */
export function createApp(
  appConfig: AppConfig = loadAppConfig(),
  adapter?: ProviderAdapter,
): Hono {
  const app = new Hono();

  configureChatCompletionStorage(appConfig.databasePath);
  registerHealthRoute(app);
  registerApiKeyAuth(app, appConfig.omnigateApiKey);
  registerModelRoute(app);
  registerChatCompletionRoute(app, adapter);
  registerAppErrorHandler(app);

  return app;
}
