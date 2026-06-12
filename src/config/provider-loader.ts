import { readFileSync } from "fs";
import { parse } from "yaml";
import { join } from "path";

import type { AliasConfig, ProviderCandidate, ProviderRegistry } from "../shared/signatures";

const PROVIDER_REGISTRY_PATH = "provider.registry.yaml";

type RawProvider = {
  id: string;
  base_url: string;
  model: string;
  api_key_env: string;
  family: string;
  priority: number;
  enabled: boolean;
  paid_fallback?: boolean;
};

type RawRegistry = {
  providers: RawProvider[];
  aliases: Record<string, AliasConfig>;
};

let cachedRegistry: ProviderRegistry | undefined;

/**
 * Loads and parses provider.registry.yaml into a typed ProviderRegistry.
 * The result is cached after the first call to avoid repeated disk I/O.
 * @returns The parsed provider registry.
 */
export function loadProviderRegistry(): ProviderRegistry {
  if (cachedRegistry !== undefined) {
    return cachedRegistry;
  }

  const filePath = join(import.meta.dir, PROVIDER_REGISTRY_PATH);
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parse(raw) as RawRegistry;

  cachedRegistry = {
    providers: parsed.providers.map(toProviderCandidate),
    aliases: parsed.aliases,
  };

  return cachedRegistry;
}

/**
 * Reads an API key from the environment for the given env-var name.
 * @param apiKeyEnv  The name of the environment variable (e.g. "HF_TOKEN").
 * @returns The API key string, or undefined when not set.
 */
export function resolveApiKey(apiKeyEnv: string): string | undefined {
  return Bun.env[apiKeyEnv];
}

/**
 * Resets the cached provider registry so the next call to loadProviderRegistry
 * re-reads the YAML file from disk.  Useful for testing or hot-reload scenarios.
 */
export function resetProviderRegistry(): void {
  cachedRegistry = undefined;
}

function toProviderCandidate(raw: RawProvider): ProviderCandidate {
  return {
    id: raw.id,
    baseUrl: raw.base_url,
    model: raw.model,
    family: raw.family,
    priority: raw.priority,
    enabled: raw.enabled,
    paidFallback: raw.paid_fallback ?? false,
    apiKeyEnv: raw.api_key_env,
  };
}
