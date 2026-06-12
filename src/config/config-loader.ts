import type { AppConfig } from "../shared/signatures";

/** Default port used when the PORT environment variable is not set. */
export const DEFAULT_PORT = 8787;
const MIN_PORT = 1;
const MAX_PORT = 65_535;
const PORT_ENV_NAME = "PORT";

type AppEnvironment = Record<string, string | undefined>;

/**
 * Reads AppConfig from the runtime environment (Bun.env).
 * @returns A fully validated AppConfig instance.
 */
export function loadAppConfig(): AppConfig {
  return parseAppConfig(Bun.env);
}

/**
 * Parses a raw environment record into an AppConfig, validating the PORT value.
 * @param environment  Key/value pairs (typically from Bun.env or process.env).
 * @returns A validated AppConfig.
 * @throws {Error} If PORT is missing, non-numeric, or outside 1-65535.
 */
export function parseAppConfig(environment: AppEnvironment): AppConfig {
  return {
    port: parsePort(environment[PORT_ENV_NAME]),
  };
}

function parsePort(rawPort: string | undefined): number {
  if (rawPort === undefined || rawPort.trim() === "") {
    return DEFAULT_PORT;
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`${PORT_ENV_NAME} must be an integer between ${MIN_PORT} and ${MAX_PORT}`);
  }

  return port;
}
