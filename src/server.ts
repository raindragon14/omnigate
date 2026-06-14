import { serve } from "bun";

import { createApp } from "./app";
import { loadAppConfig } from "./config/config-loader";

const appConfig = loadAppConfig();
const app = createApp(appConfig);

serve({
  fetch: app.fetch,
  port: appConfig.port,
});
