import { Hono } from "hono";

import { registerHealthRoute } from "./feature/health/health.route";
import { registerModelRoute } from "./feature/model/model.route";
import { registerAppErrorHandler } from "./shared/app-error";

export function createApp(): Hono {
  const app = new Hono();

  registerHealthRoute(app);
  registerModelRoute(app);
  registerAppErrorHandler(app);

  return app;
}
