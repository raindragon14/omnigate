import { serve } from "bun";

import { createApp } from "./app";
import { loadAppConfig } from "./config/config-loader";

const app = createApp();
const appConfig = loadAppConfig();

serve({
  fetch: app.fetch,
  port: appConfig.port,
});
