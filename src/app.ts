import { Hono } from "hono";

import type { AppConfig } from "./shared/signatures";
import type { ProviderAdapter } from "./provider/provider-adapter";
import { loadAppConfig } from "./config/config-loader";
import { registerChatCompletionRoute } from "./feature/chat-completion/chat-completion.route";
import {
  configureChatCompletionLogging,
  configureChatCompletionStorage,
} from "./feature/chat-completion/chat-completion.service";
import { registerHealthRoute } from "./feature/health/health.route";
import { registerModelRoute } from "./feature/model/model.route";
import { registerMetricsRoute } from "./feature/metrics/metrics.route";
import { registerAdminRoutes } from "./feature/admin/admin.route";
import { registerApiKeyAuth } from "./shared/api-key-auth";
import { registerAppErrorHandler } from "./shared/app-error";
import { createRequestId, REQUEST_ID_HEADER_NAME } from "./shared/request-id";

/**
 * Creates and configures the Hono application with all feature routes
 * (health, models, chat completions) and global error handling.
 * @param appConfig  Application configuration; defaults to loading from env.
 * @param adapter    Optional provider adapter for tests; defaults to the
 *                   OpenAI-compatible adapter in production.
 * @returns A fully configured Hono application.
 */
export function createApp(appConfig: AppConfig = loadAppConfig(), adapter?: ProviderAdapter): Hono {
  const app = new Hono();

  configureChatCompletionStorage(appConfig.databasePath);
  configureChatCompletionLogging(appConfig.logBodies);
  registerRequestId(app);
  registerHealthRoute(app);
  registerApiKeyAuth(app, appConfig.omnigateApiKey);
  registerModelRoute(app);
  registerChatCompletionRoute(app, adapter);
  registerMetricsRoute(app);
  registerAdminRoutes(app);
  registerAppErrorHandler(app);

  return app;
}

/**
 * Attaches a correlation id to every response via the x-request-id header.
 * Handlers that already set the header (e.g. chat completions, whose id is
 * also used for log correlation) are left untouched.
 * @param app  The Hono application instance.
 */
function registerRequestId(app: Hono): void {
  app.use(async (context, next) => {
    await next();

    if (context.res.headers.get(REQUEST_ID_HEADER_NAME) === null) {
      context.res.headers.set(REQUEST_ID_HEADER_NAME, createRequestId());
    }
  });
}
